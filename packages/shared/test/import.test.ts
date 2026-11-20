import { describe, expect, it } from 'vitest'
import {
  checkCaseRow,
  detectHeaderRow,
  importConfigSchema,
  isDataRow,
  mapRow,
  normalizePriority,
  normalizeResultStatus,
  normalizeTestType,
  parseCsv,
  parseLegacyDate,
  suggestMapping,
} from '../src/index.js'

const LEGACY_HEADER = [
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

describe('CSV parsing', () => {
  it('handles BOM, quoted commas, escaped quotes and multi-line cells', () => {
    const csv = '﻿case_code,title\r\nA-1,"Klik ""Simpan"", lalu tunggu"\nA-2,"Baris 1\nBaris 2"\n\n'
    expect(parseCsv(csv)).toEqual([
      ['case_code', 'title'],
      ['A-1', 'Klik "Simpan", lalu tunggu'],
      ['A-2', 'Baris 1\nBaris 2'],
    ])
  })

  it('detects semicolon-separated files (Excel in Indonesian locale)', () => {
    expect(parseCsv('a;b;c\n1;2;3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ])
  })
})

describe('legacy workbook mapping (doc 08/17)', () => {
  it('finds the header on row 11 below document metadata (TB-IMP-003)', () => {
    const rows: string[][] = [
      ['UAT - Lapor Loker'],
      [],
      ['Dokumen Acuan', 'FSD Lapor Loker'],
      ['Versi Dokumen', '1.2'],
      ['Unit Pemilik', 'Demo'],
      ...Array.from({ length: 5 }, () => [] as string[]),
      LEGACY_HEADER,
      ['1', 'UAT-LL-001', 'Akses', 'Buka halaman'],
    ]
    expect(detectHeaderRow(rows)).toBe(11)
  })

  it('maps legacy Indonesian headers to fields', () => {
    expect(suggestMapping(LEGACY_HEADER)).toEqual([
      'sequence_number',
      'case_code',
      'category',
      'title',
      'priority_code',
      'test_type_code',
      'actor_label',
      'preconditions',
      'test_steps_text',
      'expected_result',
      'result_status',
      'evidence',
      'tester_name',
      'tested_at',
      'notes',
    ])
  })

  it('normalises priorities, test types and result labels; never maps retest labels', () => {
    expect(normalizePriority('Must Have')).toBe('MUST_HAVE')
    expect(normalizePriority('SHOULD_HAVE')).toBe('SHOULD_HAVE')
    expect(normalizePriority('Penting sekali')).toBeNull()
    expect(normalizeTestType('Hak Akses')).toBe('RBAC')
    expect(normalizeTestType('Negatif')).toBe('NEGATIVE')
    expect(normalizeResultStatus('Berhasil Diuji')).toBe('PASSED')
    expect(normalizeResultStatus('Gagal Diuji')).toBe('FAILED')
    expect(normalizeResultStatus('Belum Diuji')).toBe('NOT_RUN')
    expect(normalizeResultStatus('Closed')).toBeNull()
    expect(normalizeResultStatus('Open')).toBeNull()
  })

  it('parses mixed legacy dates', () => {
    expect(parseLegacyDate('30/07/2026')).toBe('2026-07-30')
    expect(parseLegacyDate('2026-07-31')).toBe('2026-07-31')
    expect(parseLegacyDate('30 Juli 2026')).toBe('2026-07-30')
    expect(parseLegacyDate('30-31 Juli 2026')).toBe('2026-07-30')
    expect(parseLegacyDate('46233')).toBe('2026-07-30')
    expect(parseLegacyDate('31/02/2026')).toBeNull()
    expect(parseLegacyDate('minggu lalu')).toBeNull()
  })

  it('validates rows and fills module/suite from the sheet settings', () => {
    const mapping = suggestMapping(LEGACY_HEADER)
    const row = mapRow(
      LEGACY_HEADER,
      [
        '7',
        'uat-ll-007',
        'Akses',
        'Pengguna membuka form',
        'Penting sekali',
        'Nonfungsional',
        '',
        '',
        '1. Buka',
        'Form tampil',
        'Berhasil Diuji',
      ],
      mapping,
      { module_code: 'll', suite_name: 'Lapor Loker' },
    )
    const checked = checkCaseRow(row)
    expect(checked.values).toMatchObject({
      case_code: 'UAT-LL-007',
      module_code: 'LL',
      suite_name: 'Lapor Loker',
      sequence_number: 7,
      priority_code: 'MUST_HAVE',
      test_type_code: 'OTHER',
    })
    expect(checked.issues.map((i) => [i.level, i.code])).toEqual([
      ['warning', 'UNKNOWN_PRIORITY'],
      ['warning', 'TYPE_AS_OTHER'],
    ])
    expect(row.result.result_status).toBe('Berhasil Diuji')
    expect(row.raw['Fitur/Proses']).toBe('Pengguna membuka form')

    const heading = mapRow(LEGACY_HEADER, ['', '', 'A. Registrasi'], mapping)
    expect(isDataRow(heading)).toBe(false)
    const broken = checkCaseRow(mapRow(LEGACY_HEADER, ['1', 'BAD CODE!', '', 'x'], mapping))
    expect(broken.issues.filter((i) => i.level === 'error').map((i) => i.field)).toEqual([
      'case_code',
      'module_code',
      'title',
      'expected_result',
    ])
  })

  it('requires a run name before migrating results', () => {
    const sheet = { name: 'S', header_row: 1, mapping: [] }
    expect(importConfigSchema.safeParse({ sheets: [sheet], include_results: true }).success).toBe(
      false,
    )
    expect(
      importConfigSchema.safeParse({
        sheets: [sheet],
        include_results: true,
        run: { name: 'Migrasi' },
      }).success,
    ).toBe(true)
  })
})
