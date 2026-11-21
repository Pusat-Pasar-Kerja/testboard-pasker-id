import { suggestDefectMapping } from '@testboard/shared'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execute, insertedId, select, selectOne } from '../src/db/tx.js'
import { uiPng } from './support/fixtures.js'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'
import { buildXlsx } from './support/xlsx-fixture.js'

/** "Impor Bug" from a tracker workbook (ADR 0013). FICTITIOUS content only. */
const h = createHarness()
afterAll(async () => {
  await h.files.idle()
  await h.pool.end()
})

let project: { id: string; code: string }
let lead: Client
let cycleId: string
let executionId: string
const P = () => `/projects/${project.code}`

async function upload(name: string, data: Buffer) {
  const form = new FormData()
  form.append('file', new Blob([data]), name)
  const headers: Record<string, string> = { Origin: 'http://127.0.0.1:5173' }
  headers.Cookie = [...lead.cookies].map(([k, v]) => `${k}=${v}`).join('; ')
  const csrf = lead.cookies.get('tb_csrf')
  if (csrf) headers['X-CSRF-Token'] = csrf
  const res = await h.app.request(`/api/v1${P()}/imports?target=DEFECTS`, {
    method: 'POST',
    headers,
    body: form,
  })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose JSON in tests
  return { status: res.status, json: JSON.parse(await res.text()) as any }
}

async function commitAndWait(jobId: string) {
  expect((await lead.post(`${P()}/imports/${jobId}/commit`)).status).toBe(202)
  for (let i = 0; i < 200; i++) {
    const job = await lead.get(`${P()}/imports/${jobId}`)
    if (job.json.status_code !== 'IMPORTING') return job.json
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  throw new Error('import did not finish')
}

const UAT_HEADER = [
  'No.',
  'ID UAT',
  'Kategori',
  'Fitur / Proses',
  'Bukti',
  'Prioritas',
  'Status UAT',
  'Detail Hasil Aktual / Defect',
  'Severity',
  'Penguji',
  'Tgl UAT',
]
const ADUAN_HEADER = [
  'No.',
  'ID',
  'Kategori',
  'Fitur / Proses',
  'Bukti',
  'Prioritas',
  'Status',
  'Detail Hasil Aktual/Defect',
  'Notes',
  'Tanggal',
  'Status Retest',
]

async function tracker() {
  const png = await uiPng()
  return buildXlsx([
    {
      name: 'Modul Loker',
      rows: [
        UAT_HEADER,
        [
          '1',
          'UAT-LOK-001',
          'Pengajuan',
          'Submit lowongan lengkap',
          '',
          'Must Have',
          'Gagal Diuji',
          'Tombol kirim tidak merespons',
          'High',
          'Penguji Contoh',
          '30/07/2026',
        ],
        [
          '2',
          'UAT-LOK-002',
          'Pengajuan',
          'Validasi field wajib',
          '',
          'Must Have',
          'Berhasil Diuji',
          'Sesuai',
          'Info',
          'Penguji Contoh',
          '30/07/2026',
        ],
        [
          '3',
          'UAT-LOK-003',
          'Routing',
          'Routing per wilayah',
          '',
          'Must Have',
          'Gagal Diuji',
          'Case muncul di wilayah lain',
          'Critical',
          'Penguji Contoh',
          '31/07/2026',
        ],
      ],
      images: [{ col: 4, row: 2, png }],
    },
    {
      name: 'Aduan user',
      rows: [
        ADUAN_HEADER,
        [
          '1',
          'ADU-001',
          'Bug/Error',
          'Unggah logo dinas',
          '',
          'High',
          'Not Done',
          'Tombol Pilih File macet',
          'Perlu dicek di peramban lain',
          '01/08/2026',
          'Not Done',
        ],
        [
          '2',
          'ADU-002',
          'Enhancement/Penambahan Fitur',
          'Filter lowongan per tanggal',
          '',
          'Medium',
          'Done',
          'Tambahkan filter tanggal',
          '',
          '02/08/2026',
          'Done',
        ],
        [
          '3',
          'ADU-003',
          'Bug/Error',
          'Ejaan label',
          '',
          '-',
          'Info',
          'Salah ketik pada label',
          '',
          '03/08/2026',
          'Info',
        ],
      ],
    },
  ])
}

beforeAll(async () => {
  project = await createProject(h.pool)
  const user = await createUser(h.pool, { name: 'Lead Impor Bug' })
  await addMember(h.pool, project.id, user.id, 'QA_LEAD')
  lead = new Client(h)
  await lead.login(user.email)
  cycleId = insertedId(
    await execute(
      h.pool,
      "INSERT INTO test_cycles (project_id, cycle_code, title) VALUES (?, 'FASE-1', 'UAT Fase 1')",
      [project.id],
    ),
  )
  // A failed attempt of UAT-LOK-001 in a run of that cycle: the imported bug links to it.
  const testCase = await lead.post(`${P()}/test-cases`, {
    case_code: 'UAT-LOK-001',
    module_code: 'AUTH',
    title: 'Submit lowongan lengkap',
    test_steps_text: '1. Isi form\n2. Kirim',
    expected_result: 'Lowongan terkirim',
    case_status: 'READY',
  })
  const run = await lead.post(`${P()}/runs`, { name: 'UAT 30-31 Juli', cycle_id: cycleId })
  await lead.post(`${P()}/runs/${run.json.id}/cases`, { test_case_ids: [testCase.json.id] })
  await lead.post(`${P()}/runs/${run.json.id}/status`, { status_code: 'ACTIVE' })
  const runCaseId = (await lead.get(`${P()}/runs/${run.json.id}`)).json.run_cases[0].run_case_id
  executionId = (
    await lead.post(`${P()}/run-cases/${runCaseId}/executions`, {
      result_status: 'FAILED',
      actual_result: 'Tombol kirim tidak merespons',
    })
  ).json.id
})

const configure = (job: {
  id: string
  sheets: { name: string; suggested_header_row: number | null; header_cells: string[] }[]
}) =>
  lead.request('PUT', `${P()}/imports/${job.id}/config`, {
    sheets: job.sheets.map((s) => ({
      name: s.name,
      header_row: s.suggested_header_row ?? 1,
      mapping: suggestDefectMapping(s.header_cells),
      module_code: s.name === 'Aduan user' ? 'ADUAN' : 'LOKER',
      source_kind: s.name === 'Aduan user' ? 'USER_REPORT' : 'UAT',
    })),
    cycle_id: cycleId,
  })

describe('importing bugs from a tracker workbook', () => {
  it('previews failed UAT rows and complaints with mapped status, severity and priority', async () => {
    const up = await upload('tracker.xlsx', await tracker())
    expect(up.status).toBe(201)
    expect(up.json.import_target).toBe('DEFECTS')
    const mapping = suggestDefectMapping(up.json.sheets[0].header_cells)
    expect(mapping.slice(0, 4)).toEqual([null, 'case_code', 'category', 'title'])
    expect(suggestDefectMapping(up.json.sheets[1].header_cells)[1]).toBe('bug_code')

    const preview = await configure(up.json)
    expect(preview.status).toBe(200)
    const p = preview.json.defect_preview
    expect(p.counts).toMatchObject({ total: 6, create: 5, skipped: 1, duplicate: 0, invalid: 0 })
    expect(p.statuses).toEqual(
      expect.arrayContaining([
        { label: 'Gagal Diuji', count: 2, mapped: 'OPEN' },
        { label: 'Berhasil Diuji', count: 1, mapped: 'SKIP' },
        { label: 'Done', count: 1, mapped: 'CLOSED' },
        { label: 'Info', count: 1, mapped: 'CLOSED' },
      ]),
    )
    expect(p.severities).toEqual(
      expect.arrayContaining([{ label: 'Critical', count: 1, mapped: 'CRITICAL' }]),
    )
    expect(p.new_modules.sort()).toEqual(['ADUAN', 'LOKER'])
    expect(p.images).toMatchObject({ total: 1, auto: 1 })
    expect(preview.json.config).toBeNull()

    const done = await commitAndWait(up.json.id)
    expect(done.status_code).toBe('COMPLETED')
    expect(done.defect_result).toMatchObject({
      created_defects: 5,
      linked_results: 1,
      images_imported: 1,
      images_failed: 0,
    })

    const bugs = await select<{
      id: string
      bug_code: string
      title: string
      status_code: string
      severity_code: string
      priority_code: string
      source_kind: string
      cycle_id: string | null
      legacy_reporter_name: string | null
      reported_at: Date | null
      description: string | null
      closed_at: Date | null
      source_reference: string | null
    }>(h.pool, 'SELECT * FROM defects WHERE project_id = ? ORDER BY id', [project.id])
    expect(bugs).toHaveLength(5)
    const first = bugs.find((b) => b.title === 'Submit lowongan lengkap')!
    expect(first).toMatchObject({
      status_code: 'OPEN',
      severity_code: 'HIGH',
      source_kind: 'UAT',
      legacy_reporter_name: 'Penguji Contoh',
      source_reference: 'tracker.xlsx / Modul Loker / baris 2 / UAT-LOK-001',
    })
    expect(String(first.cycle_id)).toBe(cycleId)
    expect(first.reported_at?.toISOString().slice(0, 10)).toBe('2026-07-30')
    const done2 = bugs.find((b) => b.bug_code === 'ADU-002')!
    expect(done2).toMatchObject({
      status_code: 'CLOSED',
      source_kind: 'USER_REPORT',
      priority_code: 'MEDIUM',
    })
    expect(done2.closed_at).not.toBeNull()
    expect(done2.description).toContain('Kategori: Enhancement/Penambahan Fitur')
    expect(bugs.find((b) => b.bug_code === 'ADU-003')?.priority_code).toBe('MEDIUM')

    const detail = (await lead.get(`${P()}/defects/${first.id}`)).json
    expect(detail.linked_executions.map((e: { execution_id: string }) => e.execution_id)).toEqual([
      executionId,
    ])
    expect(detail.files).toHaveLength(1)
    expect(detail.history[0]).toMatchObject({
      to_status: 'OPEN',
      change_comment: 'Diimpor dari tracker.xlsx',
    })
    const withNote = (
      await lead.get(`${P()}/defects/${bugs.find((b) => b.bug_code === 'ADU-001')!.id}`)
    ).json
    expect(withNote.comments[0].body).toBe('Catatan dari file: Perlu dicek di peramban lain')
    const audit = await selectOne<{ n: number }>(
      h.pool,
      "SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type = 'import_job' AND entity_id = ? AND action_code = 'IMPORT'",
      [up.json.id],
    )
    expect(Number(audit?.n)).toBe(1)
  })

  it('does not import the same complaint twice', async () => {
    const up = await upload('tracker-lagi.xlsx', await tracker())
    const preview = await configure(up.json)
    const p = preview.json.defect_preview
    expect(p.counts).toMatchObject({ create: 2, duplicate: 3, skipped: 1 })
    const rows = (await lead.get(`${P()}/imports/${up.json.id}/rows?status=DUPLICATE`)).json.data
    expect(rows.map((r: { external_case_code: string }) => r.external_case_code).sort()).toEqual([
      'ADU-001',
      'ADU-002',
      'ADU-003',
    ])
  })
})
