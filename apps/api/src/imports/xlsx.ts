import { IMPORT_LIMITS } from '@testboard/shared'
import { XMLParser } from 'fast-xml-parser'
import { posix } from 'node:path'
import { extractZipEntry, readZipEntries, type ZipEntry } from '../files/zip.js'

/**
 * Minimal, strict XLSX reader for imports (doc 08 section B/F/I): cell values (shared and
 * inline strings, numbers, booleans, cached formula results - formulas are never
 * evaluated), dates via number formats, merged cells, hidden rows/sheets, and images
 * anchored in drawings. Every part is size-checked before it is unzipped.
 */
export interface SheetImage {
  key: string
  /** Path of the media part inside the package, e.g. xl/media/image3.png. */
  media: string
  /** 1-based row and 0-based column of the anchor cell. */
  row: number
  col: number
}

export interface SheetData {
  name: string
  hidden: boolean
  rows: string[][]
  hiddenRows: Set<number>
  images: SheetImage[]
}

export interface Workbook {
  sheets: SheetData[]
  readMedia(path: string): Buffer
}

export class WorkbookError extends Error {}

const MAX_ROWS_PER_SHEET = IMPORT_LIMITS.rows + 1000
const MAX_COLUMNS = 200

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  isArray: (name) =>
    [
      'sheet',
      'Relationship',
      'si',
      'r',
      'row',
      'c',
      'mergeCell',
      'oneCellAnchor',
      'twoCellAnchor',
      'numFmt',
      'xf',
    ].includes(name),
})

type Node = Record<string, unknown>

function parseXml(bytes: Buffer): Node {
  const text = bytes.toString('utf8')
  // XLSX never needs a DTD; refusing it blocks entity-expansion attacks outright.
  if (/<!DOCTYPE/i.test(text)) throw new WorkbookError('DTD_NOT_ALLOWED')
  return parser.parse(text) as Node
}

/** Text of a <t>/<is>/<si> node, including rich-text runs. */
function textOf(node: unknown): string {
  if (node === undefined || node === null) return ''
  // e.g. <xdr:row> inside an anchor is parsed as an array because sheet rows are.
  if (Array.isArray(node)) return textOf(node[0])
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  const n = node as Node
  if ('#text' in n) return String(n['#text'] ?? '')
  let out = ''
  if ('t' in n) out += textOf(n.t)
  if (Array.isArray(n.r)) for (const run of n.r) out += textOf((run as Node).t)
  return out
}

/** "AB12" -> { col: 27, row: 12 } (0-based column, 1-based row). */
export function cellRef(ref: string): { col: number; row: number } {
  const m = /^([A-Z]+)(\d+)$/.exec(ref)
  if (!m) return { col: 0, row: 0 }
  let col = 0
  for (const ch of m[1] as string) col = col * 26 + (ch.charCodeAt(0) - 64)
  return { col: col - 1, row: Number(m[2]) }
}

export function columnName(col: number): string {
  let n = col + 1
  let name = ''
  while (n > 0) {
    const r = (n - 1) % 26
    name = String.fromCharCode(65 + r) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

const BUILTIN_DATE_FORMATS = new Set([
  14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 30, 36, 45, 46, 47, 50, 57,
])

function isDateFormat(code: string): boolean {
  const unquoted = code.replace(/"[^"]*"|\[[^\]]*\]|\\./g, '')
  return /[dmy]/i.test(unquoted) && !/0\.0|#/.test(unquoted)
}

function serialToIso(serial: number): string {
  const ms = Date.UTC(1899, 11, 30) + Math.round(serial * 86_400_000)
  const iso = new Date(ms).toISOString()
  return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ')
}

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value]

export function readWorkbook(bytes: Buffer): Workbook {
  const entries = readZipEntries(bytes)
  if (!entries) throw new WorkbookError('NOT_XLSX')
  const total = entries.reduce((sum, e) => sum + e.uncompressedSize, 0)
  if (total > IMPORT_LIMITS.unzippedBytes || entries.length > 20_000) {
    throw new WorkbookError('ARCHIVE_BOMB')
  }
  const byName = new Map<string, ZipEntry>(entries.map((e) => [e.name, e]))
  const part = (name: string): Buffer | null => {
    const entry = byName.get(name)
    return entry ? extractZipEntry(bytes, entry) : null
  }
  if (!byName.has('xl/workbook.xml')) throw new WorkbookError('NOT_XLSX')
  if (entries.some((e) => /vbaProject\.bin$/i.test(e.name)))
    throw new WorkbookError('ACTIVE_CONTENT')

  const rels = (path: string): Map<string, string> => {
    const dir = posix.dirname(path)
    const relPath = posix.join(dir, '_rels', `${posix.basename(path)}.rels`)
    const xml = part(relPath)
    const map = new Map<string, string>()
    if (!xml) return map
    const list = asArray((parseXml(xml).Relationships as Node | undefined)?.Relationship as Node[])
    for (const rel of list) {
      const target = String(rel['@Target'] ?? '')
      const resolved = target.startsWith('/')
        ? target.slice(1)
        : posix.normalize(posix.join(dir, target))
      map.set(String(rel['@Id']), resolved)
    }
    return map
  }

  // Shared strings and date styles.
  const sharedXml = part('xl/sharedStrings.xml')
  const shared = sharedXml
    ? asArray((parseXml(sharedXml).sst as Node | undefined)?.si as unknown[]).map(textOf)
    : []
  const dateStyles = new Set<number>()
  const stylesXml = part('xl/styles.xml')
  if (stylesXml) {
    const styles = parseXml(stylesXml).styleSheet as Node | undefined
    const custom = new Map<number, string>()
    for (const f of asArray((styles?.numFmts as Node | undefined)?.numFmt as Node[])) {
      custom.set(Number(f['@numFmtId']), String(f['@formatCode'] ?? ''))
    }
    asArray((styles?.cellXfs as Node | undefined)?.xf as Node[]).forEach((xf, index) => {
      const id = Number(xf['@numFmtId'] ?? 0)
      if (BUILTIN_DATE_FORMATS.has(id) || isDateFormat(custom.get(id) ?? '')) dateStyles.add(index)
    })
  }

  const workbookRels = rels('xl/workbook.xml')
  const sheetNodes = asArray(
    (
      (parseXml(part('xl/workbook.xml') as Buffer).workbook as Node | undefined)?.sheets as
        Node | undefined
    )?.sheet as Node[],
  )
  if (sheetNodes.length > IMPORT_LIMITS.sheets) throw new WorkbookError('TOO_MANY_SHEETS')

  let imageCount = 0
  const sheets: SheetData[] = sheetNodes.map((sheetNode, sheetIndex) => {
    const name = String(sheetNode['@name'] ?? `Sheet${sheetIndex + 1}`)
    const path = workbookRels.get(String(sheetNode['@id'] ?? ''))
    const xml = path ? part(path) : null
    const data: SheetData = {
      name,
      hidden: sheetNode['@state'] === 'hidden' || sheetNode['@state'] === 'veryHidden',
      rows: [],
      hiddenRows: new Set(),
      images: [],
    }
    if (!xml || !path) return data
    const ws = parseXml(xml).worksheet as Node | undefined
    const grid: string[][] = []
    for (const row of asArray((ws?.sheetData as Node | undefined)?.row as Node[])) {
      const r = Number(row['@r'] ?? grid.length + 1)
      if (r > MAX_ROWS_PER_SHEET) throw new WorkbookError('TOO_MANY_ROWS')
      if (row['@hidden'] === '1' || row['@hidden'] === 'true') data.hiddenRows.add(r)
      const cells: string[] = (grid[r - 1] ??= [])
      for (const c of asArray(row.c as Node[])) {
        const { col } = cellRef(String(c['@r'] ?? ''))
        if (col >= MAX_COLUMNS) continue
        const type = c['@t']
        const raw = c.v === undefined ? '' : textOf(c.v)
        let value: string
        if (type === 's') value = shared[Number(raw)] ?? ''
        else if (type === 'inlineStr') value = textOf(c.is)
        else if (type === 'b') value = raw === '1' ? 'TRUE' : 'FALSE'
        else if (type === 'e') value = ''
        else if (type === 'str') value = raw
        else if (
          raw !== '' &&
          dateStyles.has(Number(c['@s'] ?? -1)) &&
          Number.isFinite(Number(raw))
        ) {
          value = serialToIso(Number(raw))
        } else value = raw === '' ? '' : String(Number(raw))
        cells[col] = value
      }
    }
    // A merged range shows one value over several cells; every covered cell gets it.
    for (const merge of asArray((ws?.mergeCells as Node | undefined)?.mergeCell as Node[])) {
      const [from, to] = String(merge['@ref'] ?? '').split(':')
      if (!from || !to) continue
      const a = cellRef(from)
      const b = cellRef(to)
      if (b.row - a.row > 500 || b.col - a.col > MAX_COLUMNS) continue
      const value = grid[a.row - 1]?.[a.col] ?? ''
      for (let r = a.row; r <= b.row; r++) {
        const cells = (grid[r - 1] ??= [])
        for (let col = a.col; col <= b.col; col++) if (!cells[col]) cells[col] = value
      }
    }
    data.rows = Array.from(grid, (cells) => Array.from(cells ?? [], (v) => v ?? ''))

    // Images: worksheet -> drawing -> anchors -> media (never matched by file order).
    const sheetRels = rels(path)
    const drawingId = (ws?.drawing as Node | undefined)?.['@id']
    const drawingPath = drawingId ? sheetRels.get(String(drawingId)) : undefined
    const drawingXml = drawingPath ? part(drawingPath) : null
    if (drawingPath && drawingXml) {
      const drawingRels = rels(drawingPath)
      const wsDr = parseXml(drawingXml).wsDr as Node | undefined
      const anchors = [
        ...asArray(wsDr?.oneCellAnchor as Node[]),
        ...asArray(wsDr?.twoCellAnchor as Node[]),
      ]
      anchors.forEach((anchor, index) => {
        const blip = (
          ((anchor.pic as Node | undefined)?.blipFill as Node | undefined)?.blip as Node | undefined
        )?.['@embed']
        const media = blip ? drawingRels.get(String(blip)) : undefined
        const from = anchor.from as Node | undefined
        if (!media || !from) return
        if (++imageCount > IMPORT_LIMITS.images) throw new WorkbookError('TOO_MANY_IMAGES')
        data.images.push({
          key: `${sheetIndex + 1}-${index + 1}`,
          media,
          row: Number(textOf(from.row)) + 1,
          col: Number(textOf(from.col)),
        })
      })
    }
    return data
  })

  return {
    sheets,
    readMedia(path: string) {
      const entry = byName.get(path)
      if (!entry || !path.startsWith('xl/media/')) throw new WorkbookError('MEDIA_NOT_FOUND')
      return extractZipEntry(bytes, entry)
    },
  }
}
