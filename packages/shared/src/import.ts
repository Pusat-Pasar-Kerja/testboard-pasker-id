import type {
  DefectImportConfig,
  DefectImportPreview,
  DefectImportResult,
  ImportTarget,
} from './defect-import.js'
import { z } from 'zod'
import type { IdString } from './api.js'
import type { UserRef } from './dto.js'
import {
  EXECUTION_STATUSES,
  IMPORT_MODES,
  TEST_CASE_PRIORITIES,
  TEST_TYPES,
  type ExecutionStatus,
  type ImportJobStatus,
  type ImportMode,
  type ImportRowStatus,
  type ImportSourceFormat,
  type ImportSourceKind,
  type TestCasePriority,
  type TestType,
} from './enums.js'

/**
 * Import of test cases and (optionally) historical UAT results - doc 08, ADR 0009.
 * Shared by the API (all formats) and the demo data source (CSV/JSON).
 */

/** Fields of the test case definition (canonical template, doc 08 section C). */
export const CASE_IMPORT_FIELDS = [
  'case_code',
  'module_code',
  'suite_name',
  'sequence_number',
  'category',
  'title',
  'requirement_refs',
  'priority_code',
  'test_type_code',
  'actor_label',
  'preconditions',
  'test_steps_text',
  'expected_result',
  'source_locale',
  'source_document',
] as const

/** Fields of a historical UAT result (only used when results are migrated). */
export const RESULT_IMPORT_FIELDS = [
  'result_status',
  'actual_result',
  'notes',
  'tester_name',
  'tested_at',
  'evidence',
] as const

export const IMPORT_FIELDS = [...CASE_IMPORT_FIELDS, ...RESULT_IMPORT_FIELDS] as const
export type ImportField = (typeof IMPORT_FIELDS)[number]

const MIB = 1024 * 1024
/** Rows sent to the wizard for choosing the header row. */
export const HEADER_SCAN_ROWS = 30

export const IMPORT_LIMITS = {
  fileBytes: 40 * MIB,
  /** Total size of the XLSX parts once unzipped (zip-bomb guard). */
  unzippedBytes: 300 * MIB,
  rows: 5000,
  sheets: 40,
  images: 1000,
} as const

/** Header aliases, compared after `normalizeHeader` (legacy workbooks + canonical names). */
const SYNONYMS: Record<ImportField, string[]> = {
  case_code: [
    'id uat',
    'idtest',
    'id test case',
    'kode',
    'kode test case',
    'case code',
    'test case id',
    'id',
  ],
  module_code: ['modul', 'kode modul', 'module', 'module code'],
  suite_name: ['suite', 'test suite', 'suite name', 'nama suite'],
  sequence_number: ['no', 'nomor', 'no urut', 'sequence', 'sequence number'],
  category: ['kategori', 'category'],
  title: ['fitur proses', 'fitur', 'judul', 'skenario', 'title', 'test case', 'nama test case'],
  requirement_refs: ['referensi', 'referensi kebutuhan', 'requirement', 'requirement refs', 'fsd'],
  priority_code: ['prioritas', 'priority'],
  test_type_code: ['jenis pengujian', 'jenis', 'tipe pengujian', 'test type', 'type'],
  actor_label: ['aktor', 'actor', 'peran'],
  preconditions: ['prasyarat', 'pra syarat', 'precondition', 'preconditions'],
  test_steps_text: ['langkah pengujian', 'langkah', 'test steps', 'steps', 'test steps text'],
  expected_result: ['hasil yang diharapkan', 'expected result', 'hasil diharapkan'],
  source_locale: ['bahasa', 'locale', 'source locale'],
  source_document: ['dokumen acuan', 'dokumen sumber', 'source document'],
  result_status: ['status', 'status uat', 'hasil uji', 'result', 'result status'],
  actual_result: [
    'detail hasil aktual defect',
    'hasil aktual',
    'actual result',
    'detail hasil aktual',
  ],
  notes: ['catatan', 'keterangan', 'notes', 'note'],
  tester_name: ['penguji', 'tester', 'nama penguji'],
  tested_at: ['tanggal uji', 'tgl uat', 'tanggal', 'tgl uji', 'tested at', 'test date'],
  evidence: ['bukti', 'bukti uji', 'evidence', 'screenshot'],
}

export function normalizeHeader(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const LOOKUP = new Map<string, ImportField>()
for (const field of IMPORT_FIELDS) {
  for (const alias of SYNONYMS[field]) LOOKUP.set(normalizeHeader(alias), field)
  LOOKUP.set(normalizeHeader(field), field)
}

export function fieldForHeader(header: string): ImportField | null {
  return LOOKUP.get(normalizeHeader(header)) ?? null
}

/** Column -> field suggestion; a field is used once (the first matching column wins). */
export function suggestMapping(headers: string[]): (ImportField | null)[] {
  const used = new Set<ImportField>()
  return headers.map((header) => {
    const field = fieldForHeader(header)
    if (!field || used.has(field)) return null
    used.add(field)
    return field
  })
}

/**
 * The header row is the one (within the first rows) that names the most known columns.
 * Legacy sheets put document metadata above it, typically on row 11 (doc 17).
 */
export function detectHeaderRow(rows: string[][], scan = 40): number | null {
  let best: { row: number; score: number } | null = null
  rows.slice(0, scan).forEach((cells, index) => {
    const score = new Set(cells.map(fieldForHeader).filter(Boolean)).size
    if (score >= 3 && (!best || score > best.score)) best = { row: index + 1, score }
  })
  return (best as { row: number } | null)?.row ?? null
}

const PRIORITY: Record<string, TestCasePriority> = {
  'must have': 'MUST_HAVE',
  must: 'MUST_HAVE',
  tinggi: 'MUST_HAVE',
  high: 'MUST_HAVE',
  'should have': 'SHOULD_HAVE',
  should: 'SHOULD_HAVE',
  sedang: 'SHOULD_HAVE',
  medium: 'SHOULD_HAVE',
  'could have': 'COULD_HAVE',
  could: 'COULD_HAVE',
  rendah: 'COULD_HAVE',
  low: 'COULD_HAVE',
  'won t have': 'WONT_HAVE',
  'wont have': 'WONT_HAVE',
}

const TEST_TYPE: Record<string, TestType> = {
  positif: 'POSITIVE',
  positive: 'POSITIVE',
  negatif: 'NEGATIVE',
  negative: 'NEGATIVE',
  'hak akses': 'RBAC',
  rbac: 'RBAC',
  akses: 'RBAC',
  sla: 'SLA',
  'ui ux': 'UI_UX',
  ui: 'UI_UX',
  ux: 'UI_UX',
  tampilan: 'UI_UX',
  integrasi: 'INTEGRATION',
  integration: 'INTEGRATION',
  nonfungsional: 'OTHER',
  'non fungsional': 'OTHER',
  other: 'OTHER',
  lainnya: 'OTHER',
}

/** Doc 08 section E. Retest labels (Closed/Open/Pending) are deliberately NOT here. */
const RESULT_STATUS: Record<string, ExecutionStatus> = {
  'belum diuji': 'NOT_RUN',
  'not tested': 'NOT_RUN',
  'not run': 'NOT_RUN',
  'berhasil diuji': 'PASSED',
  berhasil: 'PASSED',
  lulus: 'PASSED',
  passed: 'PASSED',
  pass: 'PASSED',
  'gagal diuji': 'FAILED',
  gagal: 'FAILED',
  failed: 'FAILED',
  fail: 'FAILED',
  'sedang diuji': 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  blocked: 'BLOCKED',
  terhambat: 'BLOCKED',
  terblokir: 'BLOCKED',
  dilewati: 'SKIPPED',
  skipped: 'SKIPPED',
}

const enumOrCode = <T extends string>(
  text: string,
  table: Record<string, T>,
  codes: readonly T[],
) => {
  const upper = text
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_')
  if ((codes as readonly string[]).includes(upper)) return upper as T
  return table[normalizeHeader(text)] ?? null
}

export const normalizePriority = (text: string) => enumOrCode(text, PRIORITY, TEST_CASE_PRIORITIES)
export const normalizeTestType = (text: string) => enumOrCode(text, TEST_TYPE, TEST_TYPES)
export const normalizeResultStatus = (text: string) =>
  enumOrCode(text, RESULT_STATUS, EXECUTION_STATUSES)

const MONTHS: Record<string, number> = {
  jan: 1,
  januari: 1,
  january: 1,
  feb: 2,
  februari: 2,
  february: 2,
  pebruari: 2,
  mar: 3,
  maret: 3,
  march: 3,
  apr: 4,
  april: 4,
  mei: 5,
  may: 5,
  jun: 6,
  juni: 6,
  june: 6,
  jul: 7,
  juli: 7,
  july: 7,
  agu: 8,
  agt: 8,
  agustus: 8,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  okt: 10,
  oktober: 10,
  oct: 10,
  october: 10,
  nov: 11,
  nopember: 11,
  november: 11,
  des: 12,
  desember: 12,
  dec: 12,
  december: 12,
}

const isoDay = (y: number, m: number, d: number) => {
  const date = new Date(Date.UTC(y, m - 1, d))
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
    ? date.toISOString().slice(0, 10)
    : null
}

/**
 * Mixed legacy dates (doc 17): Excel serial numbers, 30/07/2026, 2026-07-30, "30 Juli 2026".
 * A range such as "30-31 Juli 2026" keeps its first day. Unparseable -> null (warning).
 */
export function parseLegacyDate(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  if (/^\d{4}-\d{2}-\d{2}/.test(text))
    return isoDay(+text.slice(0, 4), +text.slice(5, 7), +text.slice(8, 10))
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text)
    if (serial < 20000 || serial > 80000) return null
    // Excel's day 0 is 1899-12-30 (including its leap-year quirk).
    return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000)
      .toISOString()
      .slice(0, 10)
  }
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(text)
  if (m) {
    const year = (m[3] as string).length === 2 ? 2000 + Number(m[3]) : Number(m[3])
    return isoDay(year, Number(m[2]), Number(m[1]))
  }
  m = /^(\d{1,2})(?:\s*[-–]\s*\d{1,2})?\s+([A-Za-z]+)\.?\s+(\d{4})/.exec(text)
  if (m) {
    const month = MONTHS[(m[2] as string).toLowerCase()]
    return month ? isoDay(Number(m[3]), month, Number(m[1])) : null
  }
  return null
}

/** RFC 4180 CSV with optional BOM; delimiter `,`, `;` or tab detected from the first line. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '')
  const firstLine = source.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = [',', ';', '\t'].reduce((best, d) =>
    firstLine.split(d).length > firstLine.split(best).length ? d : best,
  )
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < source.length; i++) {
    const ch = source[i] as string
    if (quoted) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          cell += '"'
          i++
        } else quoted = false
      } else cell += ch
      continue
    }
    if (ch === '"' && cell === '') quoted = true
    else if (ch === delimiter) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** AI JSON import, schema v1.0 (examples/ai_testcases.schema.json). */
export const aiImportSchema = z.object({
  schema_version: z.literal('1.0'),
  project_code: z.string().min(1),
  source_kind: z.enum(['AI', 'LEGACY', 'MANUAL']),
  source_locale: z.enum(['id', 'en']),
  suite_name: z.string().optional(),
  cases: z.array(z.record(z.string(), z.unknown())).min(1).max(IMPORT_LIMITS.rows),
})

export interface ImportIssue {
  field?: ImportField
  level: 'error' | 'warning'
  /** Stable code for translation, e.g. REQUIRED, UNKNOWN_PRIORITY. */
  code: string
  /** Original value when relevant (e.g. the unknown label). */
  value?: string
}

/** One mapped source row. Values are trimmed text; `case` keeps only non-empty fields. */
export interface MappedRow {
  case: Partial<Record<(typeof CASE_IMPORT_FIELDS)[number], string>>
  result: Partial<Record<(typeof RESULT_IMPORT_FIELDS)[number], string>>
  raw: Record<string, string>
}

export interface SheetDefaults {
  module_code?: string
  suite_name?: string
  source_locale?: 'id' | 'en'
}

export function mapRow(
  headers: string[],
  cells: string[],
  mapping: (ImportField | null)[],
  defaults: SheetDefaults = {},
): MappedRow {
  const mapped: MappedRow = { case: {}, result: {}, raw: {} }
  headers.forEach((header, index) => {
    const value = (cells[index] ?? '').trim()
    if (header.trim() || value) mapped.raw[header.trim() || `#${index + 1}`] = value
    const field = mapping[index]
    if (!field || !value) return
    if ((CASE_IMPORT_FIELDS as readonly string[]).includes(field)) {
      mapped.case[field as (typeof CASE_IMPORT_FIELDS)[number]] = value
    } else {
      mapped.result[field as (typeof RESULT_IMPORT_FIELDS)[number]] = value
    }
  })
  mapped.case.module_code ??= defaults.module_code
  mapped.case.suite_name ??= defaults.suite_name
  mapped.case.source_locale ??= defaults.source_locale
  return mapped
}

/** A row with neither code, title nor expected result is a separator/heading, not a case. */
export function isDataRow(row: MappedRow): boolean {
  return Boolean(row.case.case_code || row.case.title || row.case.expected_result)
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,99}$/

/** Validation + normalisation of the case part (doc 08 section C/D). */
export function checkCaseRow(row: MappedRow): {
  values: {
    case_code: string | null
    module_code: string | null
    suite_name: string | null
    sequence_number: number | null
    category: string | null
    title: string
    requirement_refs: string | null
    priority_code: TestCasePriority
    test_type_code: TestType
    actor_label: string | null
    preconditions: string | null
    test_steps_text: string | null
    expected_result: string
    source_locale: 'id' | 'en'
    source_document: string | null
  }
  issues: ImportIssue[]
} {
  const c = row.case
  const issues: ImportIssue[] = []
  const code = c.case_code ? c.case_code.toUpperCase() : null
  if (code && !CODE.test(code))
    issues.push({ field: 'case_code', level: 'error', code: 'INVALID_CODE', value: c.case_code })
  const moduleCode = c.module_code ? c.module_code.toUpperCase() : null
  if (!moduleCode) issues.push({ field: 'module_code', level: 'error', code: 'REQUIRED' })
  else if (!/^[A-Z0-9][A-Z0-9_-]{0,39}$/.test(moduleCode)) {
    issues.push({
      field: 'module_code',
      level: 'error',
      code: 'INVALID_CODE',
      value: c.module_code,
    })
  }
  if (!c.title || c.title.length < 3)
    issues.push({ field: 'title', level: 'error', code: 'REQUIRED' })
  if (!c.expected_result)
    issues.push({ field: 'expected_result', level: 'error', code: 'REQUIRED' })

  let priority: TestCasePriority = 'MUST_HAVE'
  if (c.priority_code) {
    const p = normalizePriority(c.priority_code)
    if (p) priority = p
    else
      issues.push({
        field: 'priority_code',
        level: 'warning',
        code: 'UNKNOWN_PRIORITY',
        value: c.priority_code,
      })
  }
  let type: TestType = 'POSITIVE'
  if (c.test_type_code) {
    const t = normalizeTestType(c.test_type_code)
    if (t) {
      type = t
      if (t === 'OTHER' && normalizeHeader(c.test_type_code) !== 'other') {
        issues.push({
          field: 'test_type_code',
          level: 'warning',
          code: 'TYPE_AS_OTHER',
          value: c.test_type_code,
        })
      }
    } else {
      type = 'OTHER'
      issues.push({
        field: 'test_type_code',
        level: 'warning',
        code: 'UNKNOWN_TYPE',
        value: c.test_type_code,
      })
    }
  }
  const sequence = c.sequence_number ? Number.parseInt(c.sequence_number, 10) : NaN
  const text = (value: string | undefined, max: number) => (value ? value.slice(0, max) : null)
  return {
    values: {
      case_code: code,
      module_code: moduleCode,
      suite_name: text(c.suite_name, 255),
      sequence_number: Number.isFinite(sequence) && sequence > 0 ? sequence : null,
      category: text(c.category, 255),
      title: c.title ?? '',
      requirement_refs: text(c.requirement_refs, 5000),
      priority_code: priority,
      test_type_code: type,
      actor_label: text(c.actor_label, 500),
      preconditions: c.preconditions ?? null,
      test_steps_text: c.test_steps_text ?? null,
      expected_result: c.expected_result ?? '',
      source_locale: c.source_locale === 'en' ? 'en' : 'id',
      source_document: text(c.source_document, 500),
    },
    issues,
  }
}

export type CheckedCase = ReturnType<typeof checkCaseRow>['values']

/** Stable fingerprint of the case definition (doc 08: source_hash for re-import). */
export function caseFingerprint(values: CheckedCase): string {
  return JSON.stringify([
    values.case_code,
    values.module_code,
    values.suite_name,
    values.category,
    values.title,
    values.requirement_refs,
    values.priority_code,
    values.test_type_code,
    values.actor_label,
    values.preconditions,
    values.test_steps_text,
    values.expected_result,
  ])
}

/** Module code suggestion from a sheet name: "Pemberi Kerja Individu" -> "PKI". */
export function moduleCodeFromName(name: string): string {
  const words = normalizeHeader(name).split(' ').filter(Boolean)
  if (words.length === 0) return 'MOD'
  const digits = words.filter((w) => /^\d+$/.test(w)).join('')
  const letters = words.filter((w) => !/^\d+$/.test(w))
  const code =
    letters.length === 1 ? (letters[0] as string).slice(0, 6) : letters.map((w) => w[0]).join('')
  return `${code}${digits}`.toUpperCase().slice(0, 12) || 'MOD'
}

// ---- DTOs -------------------------------------------------------------------------

export interface ImportSheetInfo {
  name: string
  hidden: boolean
  row_count: number
  column_count: number
  image_count: number
  suggested_header_row: number | null
  /** Cells of the suggested header row (or row 1). */
  header_cells: string[]
  /** A few rows right below the header, for the mapping screen. */
  sample_rows: string[][]
  /** First rows of the sheet, so the header row can be changed in the wizard. */
  top_rows: string[][]
  /** Document metadata found above the header (Dokumen Acuan, Versi Dokumen ...). */
  reference_document: string | null
  reference_version: string | null
  /** Suggested module for the sheet (legacy workbooks have no module column). */
  suggested_module_code: string
}

export interface ImportSheetConfig {
  name: string
  header_row: number
  mapping: (ImportField | null)[]
  module_code?: string
  suite_name?: string
  reference_document?: string | null
  reference_version?: string | null
}

export interface ImportConfig {
  sheets: ImportSheetConfig[]
  import_mode: ImportMode
  case_status: 'DRAFT' | 'READY'
  /** Historical UAT migration (doc 08 section G mode 2). */
  include_results: boolean
  run?: {
    name: string
    environment_name?: string | null
    build_version?: string | null
    cycle_id?: string | null
  }
  /** Raw status label -> result, or IGNORE to keep the case without a result. */
  status_map?: Record<string, ExecutionStatus | 'IGNORE'>
  /** Image key -> data row number on its sheet, or null to leave the image out. */
  image_rows?: Record<string, number | null>
}

export interface ImportImage {
  key: string
  sheet: string
  /** Cell where the image is anchored, e.g. "L12". */
  anchor: string
  /** Data row it belongs to, null when it needs review. */
  row_number: number | null
  state: 'AUTO' | 'REVIEW' | 'ASSIGNED' | 'IGNORED'
}

export interface ImportPreview {
  counts: {
    total: number
    valid: number
    review: number
    duplicate: number
    invalid: number
    create: number
    update: number
    unchanged: number
  }
  /** Distinct result labels found and how they map (results migration). */
  statuses: { label: string; count: number; mapped: ExecutionStatus | 'IGNORE' | null }[]
  new_modules: string[]
  new_suites: string[]
  images: { total: number; auto: number; review: ImportImage[] }
}

export interface ImportResultSummary {
  created_cases: number
  updated_cases: number
  unchanged_cases: number
  skipped_rows: number
  run: { id: IdString; run_code: string } | null
  executions: number
  images_imported: number
  images_failed: number
  images_left_out: number
}

export interface ImportJobDto {
  id: IdString
  original_filename: string
  source_format: ImportSourceFormat
  source_kind: ImportSourceKind
  /** What the job creates: test cases (default) or bugs ("Impor Bug", ADR 0013). */
  import_target: ImportTarget
  import_mode: ImportMode
  status_code: ImportJobStatus
  total_rows: number
  valid_rows: number
  imported_rows: number
  skipped_rows: number
  invalid_rows: number
  created_by: UserRef | null
  created_at: string
  completed_at: string | null
  sheets: ImportSheetInfo[]
  config: ImportConfig | null
  preview: ImportPreview | null
  result: ImportResultSummary | null
  /** Bug imports only (import_target DEFECTS). */
  defect_config: DefectImportConfig | null
  defect_preview: DefectImportPreview | null
  defect_result: DefectImportResult | null
  /** Safe failure reason when status is FAILED. */
  failure: string | null
}

export interface ImportRowDto {
  id: IdString
  sheet_name: string | null
  source_row_number: number | null
  external_case_code: string | null
  status_code: ImportRowStatus
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | null
  title: string | null
  module_code: string | null
  result_status: ExecutionStatus | null
  issues: ImportIssue[]
  /** Duplicate of an earlier row in this file, or of an existing case. */
  duplicate_of: string | null
  target_test_case_id: IdString | null
  image_count: number
}

const sheetConfigSchema = z.object({
  name: z.string().min(1).max(255),
  header_row: z.number().int().min(1).max(1000),
  mapping: z.array(z.enum(IMPORT_FIELDS).nullable()).max(200),
  module_code: z.string().trim().max(40).optional(),
  suite_name: z.string().trim().max(255).optional(),
  reference_document: z.string().trim().max(500).nullable().optional(),
  reference_version: z.string().trim().max(100).nullable().optional(),
})

export const importConfigSchema = z
  .object({
    sheets: z.array(sheetConfigSchema).min(1).max(IMPORT_LIMITS.sheets),
    import_mode: z.enum(IMPORT_MODES).default('CREATE_ONLY'),
    case_status: z.enum(['DRAFT', 'READY']).default('DRAFT'),
    include_results: z.boolean().default(false),
    run: z
      .object({
        name: z.string().trim().min(1).max(255),
        environment_name: z.string().trim().max(100).nullable().optional(),
        build_version: z.string().trim().max(100).nullable().optional(),
        cycle_id: z
          .string()
          .regex(/^\d{1,20}$/)
          .nullable()
          .optional(),
      })
      .optional(),
    status_map: z.record(z.string().max(200), z.enum([...EXECUTION_STATUSES, 'IGNORE'])).optional(),
    image_rows: z.record(z.string().max(200), z.number().int().min(1).nullable()).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.include_results && !value.run) {
      ctx.addIssue({
        code: 'custom',
        path: ['run'],
        message: 'A run name is required to migrate results',
      })
    }
  })

export type ImportConfigInput = z.input<typeof importConfigSchema>
