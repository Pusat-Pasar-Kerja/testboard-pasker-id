import { suggestMapping } from '@testboard/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { selectOne } from '../src/db/tx.js'
import { uiPng } from './support/fixtures.js'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'
import { buildXlsx, legacySheetRows, type Cell } from './support/xlsx-fixture.js'

const h = createHarness()
afterAll(async () => {
  await h.files.idle()
  await h.pool.end()
})

let project: { id: string; code: string }
let lead: Client
let tester: Client
const P = () => `/projects/${project.code}`

const CSV_HEADER =
  'case_code,module_code,suite_name,category,title,requirement_refs,priority_code,test_type_code,actor_label,preconditions,test_steps_text,expected_result,source_locale,source_document'

async function upload(client: Client, name: string, data: Buffer | string) {
  const form = new FormData()
  form.append('file', new Blob([data]), name)
  const headers: Record<string, string> = { Origin: 'http://127.0.0.1:5173' }
  headers.Cookie = [...client.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  const csrf = client.cookies.get('tb_csrf')
  if (csrf) headers['X-CSRF-Token'] = csrf
  const res = await h.app.request(`/api/v1${P()}/imports`, { method: 'POST', headers, body: form })
  const text = await res.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON in tests
  return { status: res.status, json: (text ? JSON.parse(text) : null) as any }
}

/** Configure every sheet with its suggested header/mapping (+ extra options). */
async function configure(
  job: {
    id: string
    sheets: { name: string; suggested_header_row: number | null; header_cells: string[] }[]
  },
  options: Record<string, unknown> = {},
  sheetOverrides: Record<string, unknown> = {},
  only?: string[],
) {
  return lead.request('PUT', `${P()}/imports/${job.id}/config`, {
    sheets: job.sheets
      .filter((s) => !only || only.includes(s.name))
      .map((s) => ({
        name: s.name,
        header_row: s.suggested_header_row ?? 1,
        mapping: suggestMapping(s.header_cells),
        ...sheetOverrides,
      })),
    ...options,
  })
}

async function commitAndWait(jobId: string) {
  const res = await lead.post(`${P()}/imports/${jobId}/commit`)
  expect(res.status).toBe(202)
  for (let i = 0; i < 200; i++) {
    const job = await lead.get(`${P()}/imports/${jobId}`)
    if (job.json.status_code !== 'IMPORTING') return job.json
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('import did not finish')
}

const caseByCode = (code: string) =>
  selectOne<{
    id: string
    case_status: string
    source_kind: string
    current_version: number
    expected_result: string
  }>(
    h.pool,
    'SELECT id, case_status, source_kind, current_version, expected_result FROM test_cases WHERE project_id = ? AND case_code = ?',
    [project.id, code],
  )

beforeAll(async () => {
  project = await createProject(h.pool)
  const make = async (role: 'QA_LEAD' | 'TESTER') => {
    const user = await createUser(h.pool, { name: role })
    await addMember(h.pool, project.id, user.id, role)
    const client = new Client(h)
    await client.login(user.email)
    return client
  }
  lead = await make('QA_LEAD')
  tester = await make('TESTER')
})

describe('canonical CSV and AI JSON', () => {
  const csv = [
    CSV_HEADER,
    'CSV-001,LOGIN,Masuk,Akses,Pengguna masuk dengan akun valid,FSD-1,MUST_HAVE,POSITIVE,Pengguna,Akun aktif,"1. Buka\n2. Masuk",Dashboard tampil,id,FSD Login',
    'CSV-002,LOGIN,Masuk,Akses,Sandi salah ditolak,,Should Have,Negatif,Pengguna,,"1. Isi sandi salah",Pesan galat tampil,id,',
  ].join('\n')

  it('imports the canonical template as draft cases without manual mapping (TB-IMP-001)', async () => {
    const up = await upload(lead, 'template.csv', csv)
    expect(up.status).toBe(201)
    expect(up.json.sheets[0]).toMatchObject({ name: 'CSV', suggested_header_row: 1 })
    const preview = await configure(up.json)
    expect(preview.json.preview.counts).toMatchObject({ total: 2, create: 2, invalid: 0 })
    expect(preview.json.preview.new_modules).toEqual(['LOGIN'])
    const done = await commitAndWait(up.json.id)
    expect(done.status_code).toBe('COMPLETED')
    expect(done.result).toMatchObject({ created_cases: 2 })
    expect(await caseByCode('CSV-002')).toMatchObject({
      case_status: 'DRAFT',
      source_kind: 'MANUAL',
    })
  })

  it('skips existing codes when the same file is imported again (TB-IMP-005)', async () => {
    const up = await upload(lead, 'template.csv', csv)
    const preview = await configure(up.json)
    expect(preview.json.preview.counts).toMatchObject({ duplicate: 2, create: 0 })
    const done = await commitAndWait(up.json.id)
    expect(done.result).toMatchObject({ created_cases: 0, skipped_rows: 2 })
    const count = await selectOne<{ n: number }>(
      h.pool,
      "SELECT COUNT(*) AS n FROM test_cases WHERE project_id = ? AND case_code LIKE 'CSV-%'",
      [project.id],
    )
    expect(Number(count?.n)).toBe(2)
  })

  it('updates changed cases as a new version and leaves unchanged ones alone (UPDATE)', async () => {
    const changed = csv.replace('Dashboard tampil', 'Dashboard tampil dengan nama pengguna')
    const up = await upload(lead, 'template-v2.csv', changed)
    const preview = await configure(up.json, { import_mode: 'UPDATE' })
    expect(preview.json.preview.counts).toMatchObject({ update: 1, unchanged: 1 })
    const before = await caseByCode('CSV-001')
    await commitAndWait(up.json.id)
    const after = await caseByCode('CSV-001')
    expect(after?.current_version).toBe(Number(before?.current_version) + 1)
    expect(after?.expected_result).toBe('Dashboard tampil dengan nama pengguna')
  })

  it('imports AI-generated JSON with source_kind AI (TB-IMP-002)', async () => {
    const json = JSON.stringify({
      schema_version: '1.0',
      project_code: project.code,
      source_kind: 'AI',
      source_locale: 'id',
      suite_name: 'Profil',
      cases: [
        {
          module_code: 'PROFIL',
          title: 'Ubah foto profil',
          expected_result: 'Foto baru tampil',
          model_note: 'dibuat AI',
        },
        {
          case_code: 'AI-002',
          module_code: 'PROFIL',
          title: 'Ubah nama tampilan',
          expected_result: 'Nama baru tampil',
        },
      ],
    })
    const up = await upload(lead, 'ai.json', json)
    expect(up.json.source_kind).toBe('AI')
    expect(up.json.sheets[0].header_cells).toContain('model_note')
    await configure(up.json)
    const done = await commitAndWait(up.json.id)
    expect(done.result.created_cases).toBe(2)
    expect(await caseByCode('AI-002')).toMatchObject({ source_kind: 'AI_IMPORT' })
    expect(await caseByCode('UAT-PROFIL-001')).toMatchObject({ source_kind: 'AI_IMPORT' })
  })
})

describe('legacy workbooks', () => {
  const row = (
    no: number,
    code: string,
    title: string,
    status = '',
    extra: Cell[] = [],
  ): Cell[] => [
    String(no),
    code,
    'Akses',
    title,
    'Must Have',
    'Positif',
    'Pemberi kerja',
    'Akun aktif',
    '1. Buka\n2. Simpan',
    `${title} berhasil`,
    status,
    ...extra,
  ]

  it('finds the header on row 11, keeps metadata out and reports hidden sheets (TB-IMP-003)', async () => {
    const book = buildXlsx([
      {
        name: 'Lapor Loker',
        rows: legacySheetRows([
          row(1, 'LL-001', 'Isi formulir lowongan'),
          row(2, 'LL-002', 'Kirim lowongan'),
        ]),
      },
      {
        name: 'Lapor Loker 2',
        hidden: true,
        rows: legacySheetRows([row(1, 'LL-001', 'Versi lama')]),
      },
    ])
    const up = await upload(lead, 'phase2.xlsx', book)
    expect(up.status).toBe(201)
    const [main, old] = up.json.sheets
    expect(main).toMatchObject({
      suggested_header_row: 11,
      reference_document: 'FSD Demo Lapor Loker',
      reference_version: '1.3',
      suggested_module_code: 'LL',
      hidden: false,
    })
    expect(old.hidden).toBe(true)
    const preview = await configure(
      up.json,
      {},
      { module_code: 'LL', suite_name: 'Lapor Loker', reference_document: main.reference_document },
      ['Lapor Loker'],
    )
    expect(preview.json.preview.counts).toMatchObject({ total: 2, create: 2 })
    await commitAndWait(up.json.id)
    const suite = await selectOne<{ reference_document: string }>(
      h.pool,
      "SELECT reference_document FROM test_suites WHERE project_id = ? AND name = 'Lapor Loker'",
      [project.id],
    )
    expect(suite?.reference_document).toBe('FSD Demo Lapor Loker')
    expect(await caseByCode('UAT DEMO - CONTOH FIKTIF')).toBeNull()
  })

  it('creates one case for a repeated ID UAT and reports the duplicates (TB-IMP-004)', async () => {
    const book = buildXlsx([
      {
        name: 'Tracker A',
        rows: legacySheetRows([
          row(1, 'TR-001', 'Verifikasi loker'),
          row(2, 'TR-002', 'Tolak loker'),
        ]),
      },
      {
        name: 'Tracker B',
        rows: legacySheetRows([row(1, 'TR-001', 'Verifikasi loker (salinan)')]),
      },
    ])
    const up = await upload(lead, 'tracker.xlsx', book)
    const preview = await configure(up.json, {}, { module_code: 'TR' })
    expect(preview.json.preview.counts).toMatchObject({ create: 2, duplicate: 1 })
    const dup = await lead.get(`${P()}/imports/${up.json.id}/rows?status=DUPLICATE`)
    expect(dup.json.data[0]).toMatchObject({
      external_case_code: 'TR-001',
      duplicate_of: 'Tracker A!12',
    })
    const done = await commitAndWait(up.json.id)
    expect(done.result).toMatchObject({ created_cases: 2, skipped_rows: 1 })
  })

  it('migrates old results with screenshots into a run, without creating user accounts (TB-IMP-006)', async () => {
    const png = await uiPng()
    const usersBefore = await selectOne<{ n: number }>(h.pool, 'SELECT COUNT(*) AS n FROM users')
    const book = buildXlsx([
      {
        name: 'UAT Phase 1',
        rows: legacySheetRows([
          row(1, 'P1-001', 'Registrasi pemberi kerja', 'Berhasil Diuji', [
            '',
            'Penguji Demo A',
            { n: 46233, date: true },
            'OK',
          ]),
          row(2, 'P1-002', 'Undangan pemberi kerja', 'Gagal Diuji', [
            '',
            'Penguji Demo B',
            '31/07/2026',
            'Tombol tidak aktif',
          ]),
          row(3, 'P1-003', 'Verifikasi data', 'Belum Diuji'),
          row(4, 'P1-004', 'Ekspor laporan', 'Closed'),
        ]),
        images: [
          { col: 11, row: 12, png },
          { col: 11, row: 13, png },
          { col: 12, row: 13, png },
          { col: 3, row: 5, png },
        ],
      },
    ])
    const up = await upload(lead, 'uat-phase1.xlsx', book)
    expect(up.json.sheets[0].image_count).toBe(4)
    const preview = await configure(
      up.json,
      { include_results: true, run: { name: 'Migrasi UAT Phase 1', environment_name: 'STAGING' } },
      { module_code: 'P1', suite_name: 'UAT Phase 1' },
    )
    const p = preview.json.preview
    expect(p.images).toMatchObject({ total: 4, auto: 3 })
    expect(p.images.review).toEqual([expect.objectContaining({ anchor: 'D5', state: 'REVIEW' })])
    expect(p.statuses).toEqual(
      expect.arrayContaining([
        { label: 'Berhasil Diuji', count: 1, mapped: 'PASSED' },
        { label: 'Closed', count: 1, mapped: null },
      ]),
    )
    const image = await lead.raw(`${P()}/imports/${up.json.id}/images/${p.images.review[0].key}`)
    expect(image.headers.get('content-type')).toBe('image/png')

    const done = await commitAndWait(up.json.id)
    expect(done.status_code).toBe('COMPLETED')
    expect(done.result).toMatchObject({
      created_cases: 4,
      executions: 2,
      images_imported: 3,
      images_left_out: 1,
    })

    const run = await lead.get(`${P()}/runs/${done.result.run.id}`)
    expect(run.json).toMatchObject({
      name: 'Migrasi UAT Phase 1',
      status_code: 'COMPLETED',
      total_cases: 4,
    })
    expect(run.json.counts).toMatchObject({ PASSED: 1, FAILED: 1, NOT_RUN: 2 })
    const failed = run.json.run_cases.find((r: { case_code: string }) => r.case_code === 'P1-002')
    const detail = await lead.get(`${P()}/run-cases/${failed.run_case_id}`)
    expect(detail.json.attempts[0]).toMatchObject({
      result_status: 'FAILED',
      tester: null,
      legacy_tester_name: 'Penguji Demo B',
      notes: 'Tombol tidak aktif',
    })
    expect(detail.json.attempts[0].tested_at).toMatch(/^2026-07-31/)
    expect(detail.json.attempts[0].files).toHaveLength(2)
    expect(detail.json.attempts[0].files[0]).toMatchObject({
      processing_status: 'READY',
      evidence_type: 'SCREENSHOT',
    })
    const usersAfter = await selectOne<{ n: number }>(h.pool, 'SELECT COUNT(*) AS n FROM users')
    expect(Number(usersAfter?.n)).toBe(Number(usersBefore?.n))
  })
})

describe('safety and permissions', () => {
  it('rejects malformed files and keeps bad rows out without partial data (TB-IMP-007)', async () => {
    expect((await upload(lead, 'rusak.xlsx', 'bukan zip')).json.error.details[0].message).toBe(
      'SIGNATURE_MISMATCH',
    )
    expect((await upload(lead, 'data.xls', 'x')).status).toBe(422)
    expect((await upload(lead, 'kosong.json', '{"schema_version":"2.0"}')).status).toBe(422)

    const csv = [
      CSV_HEADER,
      'BAD-001,BAD,,,Judul yang valid,,,,,,,Tampil,id,',
      'BAD-002,BAD,,,=HYPERLINK("http://jahat"),,,,,,,,id,',
      'BAD-003,BAD,,,Baris yang benar,,,,,,,Hasil ada,id,',
    ].join('\n')
    const up = await upload(lead, 'campuran.csv', csv)
    const preview = await configure(up.json)
    expect(preview.json.preview.counts).toMatchObject({ create: 2, invalid: 1 })
    const errors = await lead.raw(`${P()}/imports/${up.json.id}/errors.csv`)
    const text = errors.bytes.toString('utf8')
    expect(text).toContain("'=HYPERLINK")
    expect(text).toContain('expected_result:REQUIRED')
    const done = await commitAndWait(up.json.id)
    expect(done.status_code).toBe('PARTIAL')
    expect(await caseByCode('BAD-002')).toBeNull()
    expect(await caseByCode('BAD-003')).not.toBeNull()
  })

  it('limits imports to leads and to the project', async () => {
    expect((await upload(tester, 'a.csv', CSV_HEADER)).status).toBe(403)
    const up = await upload(lead, 'a.csv', `${CSV_HEADER}\nX-1,X,,,Satu judul,,,,,,,Hasil,id,`)
    const other = await createProject(h.pool)
    const outsider = await createUser(h.pool)
    await addMember(h.pool, other.id, outsider.id, 'ADMIN')
    const client = new Client(h)
    await client.login(outsider.email)
    expect((await client.get(`/projects/${other.code}/imports/${up.json.id}`)).status).toBe(404)
    expect((await lead.post(`${P()}/imports/${up.json.id}/commit`)).status).toBe(409)
    expect((await lead.delete(`${P()}/imports/${up.json.id}`)).status).toBe(204)
  })
})
