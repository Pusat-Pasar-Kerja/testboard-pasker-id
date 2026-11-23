import { inflateRawSync, deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  buildXlsx,
  crc32,
  csvCell,
  formatWib,
  reportExportSchema,
  reportFileName,
  reportFilterSchema,
  reportTable,
  safeSheetName,
  toCsv,
  UTF8_BOM,
  wibDayEnd,
  wibDayStart,
} from '../src/index.js'

/** Read every entry of a ZIP (stored or deflated) into text. */
function unzip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.length - 22
  expect(view.getUint32(end, true)).toBe(0x06054b50)
  const count = view.getUint16(end + 10, true)
  let at = view.getUint32(end + 16, true)
  const files = new Map<string, string>()
  for (let i = 0; i < count; i += 1) {
    expect(view.getUint32(at, true)).toBe(0x02014b50)
    const method = view.getUint16(at + 10, true)
    const crc = view.getUint32(at + 16, true)
    const size = view.getUint32(at + 20, true)
    const nameLength = view.getUint16(at + 28, true)
    const local = view.getUint32(at + 42, true)
    const name = new TextDecoder().decode(bytes.subarray(at + 46, at + 46 + nameLength))
    const localName = view.getUint16(local + 26, true)
    const start = local + 30 + localName
    const body = bytes.subarray(start, start + size)
    const data = method === 8 ? new Uint8Array(inflateRawSync(body)) : body
    expect(crc32(data)).toBe(crc)
    files.set(name, new TextDecoder().decode(data))
    at += 46 + nameLength
  }
  return files
}

describe('CSV output (TB-REPORT-001)', () => {
  it('neutralises formulas and quotes separators', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`)
    expect(csvCell('+62 811')).toBe("'+62 811")
    expect(csvCell('-1')).toBe("'-1")
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(csvCell(-1)).toBe('-1')
    expect(csvCell('a,b')).toBe('"a,b"')
    expect(csvCell('line 1\nline 2')).toBe('"line 1\nline 2"')
    expect(csvCell(null)).toBe('')
  })

  it('writes a BOM and CRLF lines', () => {
    expect(toCsv(['a', 'b'], [[1, 'x']])).toBe(`${UTF8_BOM}a,b\r\n1,x\r\n`)
  })
})

describe('XLSX output', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('builds a valid package with typed cells and no formulas', () => {
    for (const deflate of [undefined, (d: Uint8Array) => new Uint8Array(deflateRawSync(d))]) {
      const bytes = buildXlsx(
        [
          {
            name: 'Hasil: Run [1]',
            header: ['Kode', 'Jumlah'],
            rows: [
              ['=1+1', 3],
              ['A & <B>\nbaris dua', null],
            ],
          },
        ],
        { deflate },
      )
      const files = unzip(bytes)
      expect([...files.keys()]).toEqual(
        expect.arrayContaining([
          '[Content_Types].xml',
          '_rels/.rels',
          'xl/workbook.xml',
          'xl/styles.xml',
          'xl/worksheets/sheet1.xml',
        ]),
      )
      expect(files.get('xl/workbook.xml')).toContain('name="Hasil  Run  1"')
      const sheet = files.get('xl/worksheets/sheet1.xml') ?? ''
      expect(sheet).toContain('<c r="A2" t="inlineStr"><is><t>=1+1</t></is></c>')
      expect(sheet).toContain('<c r="B2"><v>3</v></c>')
      expect(sheet).toContain('A &amp; &lt;B&gt;\nbaris dua')
      expect(sheet).toContain('<autoFilter ref="A1:B3"/>')
      expect(sheet).not.toContain('<f>')
    }
  })

  it('keeps sheet names short and unique', () => {
    const taken = new Set<string>()
    expect(safeSheetName('A'.repeat(40), taken)).toHaveLength(31)
    expect(safeSheetName('A'.repeat(40), taken)).toBe(`${'A'.repeat(27)} (2)`)
  })
})

describe('report helpers', () => {
  it('uses WIB calendar days', () => {
    expect(wibDayStart('2026-07-30').toISOString()).toBe('2026-07-29T17:00:00.000Z')
    expect(wibDayEnd('2026-07-30').toISOString()).toBe('2026-07-30T17:00:00.000Z')
    expect(formatWib('2026-07-29T17:30:00.000Z')).toBe('2026-07-30 00:30')
    expect(formatWib(null)).toBe('')
    expect(reportFileName('DEMO-KARIR', 'results', 'xlsx', new Date('2026-11-20T07:05:00Z'))).toBe(
      'testboard-DEMO-KARIR-results-20261120-1405.xlsx',
    )
  })

  it('validates filters', () => {
    expect(reportFilterSchema.safeParse({ from: '2026-08-01', to: '2026-07-01' }).success).toBe(
      false,
    )
    expect(reportFilterSchema.safeParse({ run_id: '1; DROP' }).success).toBe(false)
    expect(reportExportSchema.parse({ dataset: 'defects' })).toMatchObject({
      format: 'csv',
      locale: 'id',
    })
  })

  it('renders labels and times in the chosen language', () => {
    const record = {
      run_code: 'RUN-1',
      module_code: null,
      case_code: 'UAT-1',
      title: 'Login',
      attempt_number: 2,
      kind: 'RETEST' as const,
      status: 'PASSED' as const,
      tested_at: '2026-07-30T03:00:00.000Z',
      tester: 'Penguji A',
      actual_result: null,
      notes: null,
      browser: null,
      device: null,
      os: null,
      evidence: 1,
      bugs: ['BUG-1', 'BUG-2'],
    }
    const id = reportTable('attempts', [record], 'id')
    expect(id.header[6]).toBe('Hasil')
    expect(id.rows[0]).toEqual([
      'RUN-1',
      null,
      'UAT-1',
      'Login',
      2,
      'Uji ulang setelah perbaikan',
      'Sesuai',
      '2026-07-30 10:00',
      'Penguji A',
      null,
      null,
      null,
      null,
      null,
      1,
      'BUG-1, BUG-2',
    ])
    expect(reportTable('attempts', [record], 'en').rows[0]?.[6]).toBe('As expected')
  })
})
