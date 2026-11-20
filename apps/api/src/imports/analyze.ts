import {
  aiImportSchema,
  CASE_IMPORT_FIELDS,
  detectHeaderRow,
  HEADER_SCAN_ROWS,
  moduleCodeFromName,
  normalizeHeader,
  parseCsv,
  type ImportSheetInfo,
  type ImportSourceFormat,
  type ImportSourceKind,
} from '@testboard/shared'
import { mkdir, readFile, rename, rm, writeFile, copyFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'
import { readWorkbook, WorkbookError, type SheetImage } from './xlsx.js'

/** Parsed source cached next to the upload so later steps need not re-read the XLSX. */
export interface ParsedSheet {
  name: string
  hidden: boolean
  rows: string[][]
  hiddenRows: number[]
  images: SheetImage[]
}

export interface ParsedSource {
  kind: ImportSourceKind
  sheets: ParsedSheet[]
  /** JSON imports: top-level defaults. */
  suite_name?: string
  source_locale?: 'id' | 'en'
}

/** Private folder per import job: source file + parsed cache + preview summary. */
export class ImportStore {
  private readonly dir: string

  constructor(storageRoot: string) {
    this.dir = resolve(storageRoot, 'imports')
  }

  private jobDir(jobId: string) {
    if (!/^\d{1,20}$/.test(jobId)) throw new Error('Invalid job id')
    const dir = resolve(this.dir, jobId)
    if (!dir.startsWith(this.dir + sep)) throw new Error('Invalid job id')
    return dir
  }

  async saveSource(jobId: string, tempPath: string, format: ImportSourceFormat) {
    const dir = this.jobDir(jobId)
    await mkdir(dir, { recursive: true })
    const target = join(dir, `source.${format.toLowerCase()}`)
    try {
      await rename(tempPath, target)
    } catch {
      await copyFile(tempPath, target)
      await rm(tempPath, { force: true })
    }
  }

  readSource(jobId: string, format: ImportSourceFormat) {
    return readFile(join(this.jobDir(jobId), `source.${format.toLowerCase()}`))
  }

  async writeJson(jobId: string, name: 'parsed' | 'preview', value: unknown) {
    const dir = this.jobDir(jobId)
    await mkdir(dir, { recursive: true })
    await writeFile(join(dir, `${name}.json`), JSON.stringify(value))
  }

  async readJson<T>(jobId: string, name: 'parsed' | 'preview'): Promise<T | null> {
    try {
      return JSON.parse(await readFile(join(this.jobDir(jobId), `${name}.json`), 'utf8')) as T
    } catch {
      return null
    }
  }

  /** Drop the uploaded source (after commit or cancel); keeps nothing personal around. */
  async remove(jobId: string) {
    await rm(this.jobDir(jobId), { recursive: true, force: true })
  }
}

export class ImportSourceError extends Error {}

const trimRows = (rows: string[][]) => {
  let end = rows.length
  while (end > 0 && !(rows[end - 1] ?? []).some((c) => c.trim() !== '')) end--
  return rows.slice(0, end).map((row) => row ?? [])
}

function decodeText(bytes: Buffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    // Excel "CSV" in older Windows locales is often Windows-1252.
    return new TextDecoder('windows-1252').decode(bytes)
  }
}

const cellText = (value: unknown): string =>
  value === null || value === undefined
    ? ''
    : Array.isArray(value)
      ? value.map(cellText).join('\n')
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)

/** Read the uploaded file into sheets of text rows (+ image anchors for XLSX). */
export function parseSource(format: ImportSourceFormat, bytes: Buffer): ParsedSource {
  if (format === 'XLSX') {
    try {
      const book = readWorkbook(bytes)
      return {
        kind: 'LEGACY',
        sheets: book.sheets.map((s) => ({
          name: s.name,
          hidden: s.hidden,
          rows: trimRows(s.rows),
          hiddenRows: [...s.hiddenRows],
          images: s.images,
        })),
      }
    } catch (error) {
      if (error instanceof WorkbookError) throw new ImportSourceError(error.message)
      throw new ImportSourceError('CORRUPT')
    }
  }
  const text = decodeText(bytes)
  if (format === 'CSV') {
    const rows = parseCsv(text)
    if (rows.length === 0) throw new ImportSourceError('EMPTY')
    return {
      kind: 'MANUAL',
      sheets: [{ name: 'CSV', hidden: false, rows, hiddenRows: [], images: [] }],
    }
  }
  let json: unknown
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''))
  } catch {
    throw new ImportSourceError('INVALID_JSON')
  }
  const parsed = aiImportSchema.safeParse(json)
  if (!parsed.success) throw new ImportSourceError('SCHEMA_MISMATCH')
  // Canonical columns first, then any extra keys (kept as raw data, never dropped).
  const extra = new Set<string>()
  for (const item of parsed.data.cases) {
    for (const key of Object.keys(item)) {
      if (!(CASE_IMPORT_FIELDS as readonly string[]).includes(key)) extra.add(key)
    }
  }
  const header = [...CASE_IMPORT_FIELDS, ...extra]
  const rows = [
    header,
    ...parsed.data.cases.map((item) => header.map((key) => cellText(item[key]))),
  ]
  return {
    kind: parsed.data.source_kind,
    suite_name: parsed.data.suite_name,
    source_locale: parsed.data.source_locale,
    sheets: [{ name: 'JSON', hidden: false, rows, hiddenRows: [], images: [] }],
  }
}

const METADATA = {
  document: new Set(['dokumen acuan', 'dokumen referensi', 'referensi dokumen', 'dokumen sumber']),
  version: new Set(['versi dokumen', 'versi', 'version']),
}

/** What the wizard shows per sheet: header guess, sample rows, metadata above the header. */
export function sheetInfo(sheet: ParsedSheet, format: ImportSourceFormat): ImportSheetInfo {
  const headerRow = format === 'XLSX' ? detectHeaderRow(sheet.rows) : 1
  const headerIndex = (headerRow ?? 1) - 1
  let referenceDocument: string | null = null
  let referenceVersion: string | null = null
  for (const row of sheet.rows.slice(0, headerIndex)) {
    const cells = row.map((c) => c.trim()).filter(Boolean)
    const label = normalizeHeader(cells[0] ?? '')
    const value = cells[1] ?? null
    if (value && METADATA.document.has(label)) referenceDocument ??= value.slice(0, 500)
    if (value && METADATA.version.has(label)) referenceVersion ??= value.slice(0, 100)
  }
  const nonEmpty = sheet.rows.filter((r) => r.some((c) => c.trim() !== ''))
  return {
    name: sheet.name,
    hidden: sheet.hidden,
    row_count: nonEmpty.length,
    column_count: Math.max(0, ...sheet.rows.map((r) => r.length)),
    image_count: sheet.images.length,
    suggested_header_row: headerRow,
    header_cells: sheet.rows[headerIndex] ?? [],
    sample_rows: sheet.rows
      .slice(headerIndex + 1)
      .filter((r) => r.some((c) => c.trim() !== ''))
      .slice(0, 3),
    top_rows: sheet.rows
      .slice(0, HEADER_SCAN_ROWS)
      .map((r) => r.slice(0, 60).map((c) => c.slice(0, 200))),
    reference_document: referenceDocument,
    reference_version: referenceVersion,
    suggested_module_code: moduleCodeFromName(sheet.name),
  }
}
