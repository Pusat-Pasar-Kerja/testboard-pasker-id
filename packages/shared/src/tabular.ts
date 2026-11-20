import { columnName } from './import-plan.js'

/**
 * Spreadsheet output shared by the API (authoritative exports) and the demo data source.
 * No dependencies: CSV text plus a minimal, standards-compliant XLSX (Office Open XML)
 * writer. Cells are always typed values (inline strings or numbers), never formulas.
 */

export type TabularValue = string | number | null | undefined

export interface TabularSheet {
  name: string
  header: string[]
  rows: TabularValue[][]
  /** Column widths in characters; derived from the content when omitted. */
  widths?: number[]
}

/** Byte order mark so Excel opens UTF-8 CSV files with the right encoding. */
export const UTF8_BOM = String.fromCharCode(0xfeff)

/**
 * One CSV cell. Text a spreadsheet would treat as a formula (= + - @, tab, CR) is prefixed
 * with an apostrophe (OWASP CSV injection guidance, doc 02 section 8, TB-REPORT-001).
 */
export function csvCell(value: TabularValue): string {
  let text = value === null || value === undefined ? '' : String(value)
  if (typeof value !== 'number' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** Complete CSV document: BOM, CRLF line endings, escaped cells. */
export function toCsv(header: string[], rows: TabularValue[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','))
  return `${UTF8_BOM}${lines.join('\r\n')}\r\n`
}

// ---------------------------------------------------------------------------- XLSX

const encoder = new TextEncoder()

/** Excel's hard limit per cell. */
const MAX_CELL_CHARS = 32_767

/** Characters XML 1.0 cannot carry (control characters, lone surrogates, U+FFFE/FFFF). */
const INVALID_XML =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

function xmlText(value: string): string {
  return value
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Sheet names: 1-31 characters, none of : \ / ? * [ ], unique within the workbook. */
export function safeSheetName(name: string, taken: Set<string> = new Set()): string {
  const base =
    name
      .replace(/[:\\/?*[\]]/g, ' ')
      .trim()
      .slice(0, 31) || 'Sheet'
  let candidate = base
  for (let i = 2; taken.has(candidate.toLowerCase()); i += 1) {
    const suffix = ` (${i})`
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`
  }
  taken.add(candidate.toLowerCase())
  return candidate
}

function cellXml(ref: string, value: TabularValue, style: number): string {
  const s = style ? ` s="${style}"` : ''
  if (typeof value === 'number' && Number.isFinite(value))
    return `<c r="${ref}"${s}><v>${value}</v></c>`
  if (value === null || value === undefined || value === '') return ''
  const text = String(value).slice(0, MAX_CELL_CHARS)
  const space = /^\s|\s$|\n/.test(text) ? ' xml:space="preserve"' : ''
  return `<c r="${ref}" t="inlineStr"${s}><is><t${space}>${xmlText(text)}</t></is></c>`
}

function widthsFor(sheet: TabularSheet): number[] {
  if (sheet.widths) return sheet.widths
  return sheet.header.map((head, col) => {
    let longest = head.length
    for (const row of sheet.rows.slice(0, 200)) {
      const value = row[col]
      if (value === null || value === undefined) continue
      const firstLine = String(value).split('\n')[0] ?? ''
      longest = Math.max(longest, firstLine.length)
    }
    return Math.min(60, Math.max(8, longest + 2))
  })
}

function sheetXml(sheet: TabularSheet): string {
  const lastCol = columnName(Math.max(sheet.header.length, 1) - 1)
  const lastRow = sheet.rows.length + 1
  const cols = widthsFor(sheet)
    .map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`)
    .join('')
  const rows = [sheet.header, ...sheet.rows].map((row, r) => {
    const cells = row
      .map((value, col) => cellXml(`${columnName(col)}${r + 1}`, value, r === 0 ? 1 : 0))
      .join('')
    return `<row r="${r + 1}">${cells}</row>`
  })
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
    'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    `<dimension ref="A1:${lastCol}${lastRow}"/>` +
    '<sheetViews><sheetView workbookViewId="0">' +
    '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>' +
    '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    (cols ? `<cols>${cols}</cols>` : '') +
    `<sheetData>${rows.join('')}</sheetData>` +
    (sheet.header.length > 0 ? `<autoFilter ref="A1:${lastCol}${lastRow}"/>` : '') +
    '</worksheet>'
  )
}

const STYLES =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>' +
  '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="3"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill>' +
  '<fill><patternFill patternType="solid"><fgColor rgb="FFE8EDFB"/><bgColor indexed="64"/></patternFill></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>'

let crcTable: Uint32Array | null = null

/** CRC-32 (IEEE 802.3), as required by the ZIP format. */
export function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256)
    for (let n = 0; n < 256; n += 1) {
      let c = n
      for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      crcTable[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const byte of data) crc = (crcTable[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export interface ZipOptions {
  /** Raw DEFLATE (e.g. node:zlib deflateRawSync). Without it entries are stored. */
  deflate?: (data: Uint8Array) => Uint8Array
  /** Entry timestamp; defaults to now. */
  date?: Date
}

/** Minimal ZIP writer (stored or deflated entries, UTF-8 names, no ZIP64). */
export function buildZip(
  entries: { name: string; data: Uint8Array }[],
  options: ZipOptions = {},
): Uint8Array<ArrayBuffer> {
  const date = options.date ?? new Date()
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1)
  const dosDate =
    ((Math.max(date.getFullYear(), 1980) - 1980) << 9) |
    ((date.getMonth() + 1) << 5) |
    date.getDate()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const entry of entries) {
    const name = encoder.encode(entry.name)
    const crc = crc32(entry.data)
    const compressed = options.deflate ? options.deflate(entry.data) : entry.data
    const deflated = options.deflate !== undefined && compressed.length < entry.data.length
    const body = deflated ? compressed : entry.data
    const method = deflated ? 8 : 0

    const local = new Uint8Array(30 + name.length)
    const lv = new DataView(local.buffer)
    lv.setUint32(0, 0x04034b50, true)
    lv.setUint16(4, 20, true)
    lv.setUint16(6, 0x0800, true) // UTF-8 names
    lv.setUint16(8, method, true)
    lv.setUint16(10, dosTime, true)
    lv.setUint16(12, dosDate, true)
    lv.setUint32(14, crc, true)
    lv.setUint32(18, body.length, true)
    lv.setUint32(22, entry.data.length, true)
    lv.setUint16(26, name.length, true)
    local.set(name, 30)

    const central = new Uint8Array(46 + name.length)
    const cv = new DataView(central.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint16(4, 20, true)
    cv.setUint16(6, 20, true)
    cv.setUint16(8, 0x0800, true)
    cv.setUint16(10, method, true)
    cv.setUint16(12, dosTime, true)
    cv.setUint16(14, dosDate, true)
    cv.setUint32(16, crc, true)
    cv.setUint32(20, body.length, true)
    cv.setUint32(24, entry.data.length, true)
    cv.setUint16(28, name.length, true)
    cv.setUint32(42, offset, true)
    central.set(name, 46)

    locals.push(local, body)
    centrals.push(central)
    offset += local.length + body.length
  }
  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0)
  const end = new Uint8Array(22)
  const ev = new DataView(end.buffer)
  ev.setUint32(0, 0x06054b50, true)
  ev.setUint16(8, entries.length, true)
  ev.setUint16(10, entries.length, true)
  ev.setUint32(12, centralSize, true)
  ev.setUint32(16, offset, true)

  const parts = [...locals, ...centrals, end]
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** XLSX workbook with one worksheet per sheet: bold frozen header row and auto filter. */
export function buildXlsx(
  sheets: TabularSheet[],
  options: ZipOptions = {},
): Uint8Array<ArrayBuffer> {
  const taken = new Set<string>()
  const named = sheets.map((sheet) => ({ ...sheet, name: safeSheetName(sheet.name, taken) }))
  const text = (s: string) => encoder.encode(s)
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
  const files: { name: string; data: Uint8Array }[] = [
    {
      name: '[Content_Types].xml',
      data: text(
        `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          named
            .map(
              (_, i) =>
                `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
            )
            .join('') +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: text(
        `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: text(
        `${head}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ` +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
          named
            .map(
              (sheet, i) =>
                `<sheet name="${xmlText(sheet.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
            )
            .join('') +
          '</sheets></workbook>',
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: text(
        `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
          named
            .map(
              (_, i) =>
                `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
            )
            .join('') +
          `<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
          '</Relationships>',
      ),
    },
    { name: 'xl/styles.xml', data: text(STYLES) },
    ...named.map((sheet, i) => ({
      name: `xl/worksheets/sheet${i + 1}.xml`,
      data: text(sheetXml(sheet)),
    })),
  ]
  return buildZip(files, options)
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const CSV_MIME = 'text/csv; charset=utf-8'
