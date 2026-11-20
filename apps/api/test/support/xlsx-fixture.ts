import { zip } from './fixtures.js'

/**
 * Builds small but real XLSX packages for import tests (FICTITIOUS content only).
 * Cells are inline strings; numbers given as `{ n: 46233, date: true }` become a date cell.
 */
export type Cell = string | { n: number; date?: boolean }

export interface FixtureSheet {
  name: string
  hidden?: boolean
  rows: Cell[][]
  merges?: string[]
  /** Images anchored at (0-based col, 1-based row). */
  images?: { col: number; row: number; png: Buffer }[]
}

const esc = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const colName = (col: number) => {
  let n = col + 1
  let name = ''
  while (n > 0) {
    const r = (n - 1) % 26
    name = String.fromCharCode(65 + r) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

export function buildXlsx(sheets: FixtureSheet[]): Buffer {
  const entries: { name: string; data: string | Buffer }[] = []
  let media = 0
  const contentTypes = [
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Default Extension="png" ContentType="image/png"/>',
  ]
  entries.push({
    name: '_rels/.rels',
    data: '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
  })
  entries.push({
    name: 'xl/workbook.xml',
    data: `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets
      .map(
        (s, i) =>
          `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`,
      )
      .join('')}</sheets></workbook>`,
  })
  entries.push({
    name: 'xl/_rels/workbook.xml.rels',
    data: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map(
        (_, i) =>
          `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
      )
      .join('')}</Relationships>`,
  })
  // Style 1 = built-in date format 14.
  entries.push({
    name: 'xl/styles.xml',
    data: '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',
  })

  sheets.forEach((sheet, i) => {
    const n = i + 1
    const rows = sheet.rows
      .map((cells, r) => {
        const xml = cells
          .map((cell, c) => {
            const ref = `${colName(c)}${r + 1}`
            if (typeof cell === 'string') {
              return cell === ''
                ? ''
                : `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`
            }
            return `<c r="${ref}"${cell.date ? ' s="1"' : ''}><v>${cell.n}</v></c>`
          })
          .join('')
        return `<row r="${r + 1}">${xml}</row>`
      })
      .join('')
    const merges = sheet.merges?.length
      ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
      : ''
    const drawing = sheet.images?.length ? '<drawing r:id="rId1"/>' : ''
    entries.push({
      name: `xl/worksheets/sheet${n}.xml`,
      data: `<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${rows}</sheetData>${merges}${drawing}</worksheet>`,
    })
    if (sheet.images?.length) {
      entries.push({
        name: `xl/worksheets/_rels/sheet${n}.xml.rels`,
        data: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${n}.xml"/></Relationships>`,
      })
      const anchors: string[] = []
      const rels: string[] = []
      sheet.images.forEach((image, k) => {
        media++
        entries.push({ name: `xl/media/image${media}.png`, data: image.png })
        rels.push(
          `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${media}.png"/>`,
        )
        anchors.push(
          `<xdr:oneCellAnchor><xdr:from><xdr:col>${image.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${image.row - 1}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:ext cx="100" cy="100"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${k + 2}" name="Picture ${k + 1}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip r:embed="rId${k + 1}"/></xdr:blipFill><xdr:spPr/></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`,
        )
      })
      entries.push({
        name: `xl/drawings/drawing${n}.xml`,
        data: `<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`,
      })
      entries.push({
        name: `xl/drawings/_rels/drawing${n}.xml.rels`,
        data: `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`,
      })
    }
  })
  entries.unshift({
    name: '[Content_Types].xml',
    data: `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${contentTypes.join('')}</Types>`,
  })
  return zip(entries)
}

/** Header used by the legacy UAT workbooks (doc 17), with fictitious rows. */
export const LEGACY_HEADER = [
  'No.',
  'ID UAT',
  'Kategori',
  'Fitur/Proses',
  'Prioritas',
  'Jenis Pengujian',
  'Aktor',
  'Prasyarat',
  'Langkah Pengujian',
  'Hasil yang Diharapkan',
  'Status',
  'Bukti Uji',
  'Penguji',
  'Tanggal Uji',
  'Catatan',
]

/** Document metadata on rows 1-10, header on row 11 (like the Phase 1/2 workbooks). */
export function legacySheetRows(dataRows: Cell[][]): Cell[][] {
  return [
    ['UAT DEMO - CONTOH FIKTIF'],
    [],
    ['Dokumen Acuan', 'FSD Demo Lapor Loker'],
    ['Versi Dokumen', '1.3'],
    ['Unit Pemilik', 'Unit Demo'],
    ['Ruang Lingkup', 'Contoh saja'],
    [],
    [],
    [],
    [],
    LEGACY_HEADER,
    ...dataRows,
  ]
}
