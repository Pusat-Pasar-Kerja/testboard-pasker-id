import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { select } from '../src/db/tx.js'
import { readWorkbook } from '../src/imports/xlsx.js'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

const h = createHarness()
afterAll(() => h.pool.end())

let project: { id: string; code: string }
let other: { id: string; code: string }
let lead: Client
let tester: Client
let viewer: Client
let testerId: string
let runA: string
let failedExecution: string
const P = () => `/projects/${project.code}`
const BOM = String.fromCharCode(0xfeff)

async function readyCase(module_code: string, title: string) {
  const res = await lead.post(`${P()}/test-cases`, {
    module_code,
    title,
    test_steps_text: '1. Buka\n2. Klik',
    expected_result: 'Berhasil',
    case_status: 'READY',
  })
  expect(res.status).toBe(201)
  return res.json as { id: string; case_code: string }
}

async function activeRun(name: string, caseIds: string[]) {
  const run = await lead.post(`${P()}/runs`, { name })
  await lead.post(`${P()}/runs/${run.json.id}/cases`, {
    test_case_ids: caseIds,
    assigned_to: testerId,
  })
  await lead.post(`${P()}/runs/${run.json.id}/status`, { status_code: 'ACTIVE' })
  const detail = await lead.get(`${P()}/runs/${run.json.id}`)
  const byCase = new Map<string, string>(
    detail.json.run_cases.map((r: { test_case_id: string; run_case_id: string }) => [
      r.test_case_id,
      r.run_case_id,
    ]),
  )
  return { id: run.json.id as string, runCase: (caseId: string) => byCase.get(caseId) as string }
}

const execute = (runCaseId: string, body: Record<string, unknown>) =>
  tester.post(`${P()}/run-cases/${runCaseId}/executions`, body)

beforeAll(async () => {
  project = await createProject(h.pool)
  other = await createProject(h.pool)
  const make = async (role: 'QA_LEAD' | 'TESTER' | 'VIEWER') => {
    const user = await createUser(h.pool, { name: `Report ${role}` })
    await addMember(h.pool, project.id, user.id, role)
    const client = new Client(h)
    await client.login(user.email)
    return { user, client }
  }
  lead = (await make('QA_LEAD')).client
  const t = await make('TESTER')
  tester = t.client
  testerId = t.user.id
  viewer = (await make('VIEWER')).client
  expect((await lead.post(`${P()}/modules`, { module_code: 'PAY', name: 'Bayar' })).status).toBe(
    201,
  )

  const login = await readyCase('AUTH', 'Login valid')
  const lockout = await readyCase('AUTH', 'Kunci akun')
  const pay = await readyCase('PAY', 'Bayar tagihan')

  const a = await activeRun('Run A', [login.id, lockout.id, pay.id])
  runA = a.id
  const failed = await execute(a.runCase(login.id), {
    result_status: 'FAILED',
    actual_result: '=HYPERLINK("http://evil.example","klik")',
  })
  failedExecution = failed.json.id
  await execute(a.runCase(login.id), { result_status: 'PASSED' })
  await execute(a.runCase(lockout.id), {
    result_status: 'BLOCKED',
    notes: 'Server uji mati',
  })

  const b = await activeRun('Run B', [login.id])
  await execute(b.runCase(login.id), { result_status: 'PASSED' })

  const bug = await tester.post(`${P()}/defects`, {
    title: 'Login gagal sekali',
    severity_code: 'HIGH',
    execution_ids: [failedExecution],
  })
  expect(bug.status).toBe(201)
  await tester.post(`${P()}/defects`, { title: 'Ejaan label', severity_code: 'LOW' })
})

describe('report overview', () => {
  it('counts each run case once by its latest attempt, per run, module and tester', async () => {
    expect((await viewer.get(`${P()}/reports/overview`)).status).toBe(403)
    const res = await lead.get(`${P()}/reports/overview`)
    expect(res.status).toBe(200)
    const o = res.json
    expect(o.timezone).toBe('Asia/Jakarta')
    expect(o.totals).toMatchObject({ run_cases: 4, executed: 3, attempts: 4, retests: 1 })
    expect(o.totals.counts).toMatchObject({ PASSED: 2, BLOCKED: 1, NOT_RUN: 1, FAILED: 0 })
    expect(o.totals.pass_rate).toBe(50)
    expect(o.by_run.map((r: { name: string }) => r.name)).toEqual(
      expect.arrayContaining(['Run A', 'Run B']),
    )
    const auth = o.by_module.find((m: { code: string }) => m.code === 'AUTH')
    expect(auth).toMatchObject({ run_cases: 3, pass_rate: 66.7 })
    expect(o.by_tester).toHaveLength(1)
    expect(o.by_tester[0]).toMatchObject({
      tester_id: testerId,
      legacy: false,
      attempts: 4,
      retests: 1,
    })
    expect(o.by_tester[0].counts).toMatchObject({ FAILED: 1, PASSED: 2, BLOCKED: 1 })
    expect(o.defects).toMatchObject({ total: 2, open: 2 })
    expect(o.defects.by_severity.HIGH).toEqual({ open: 1, total: 1 })
  })

  it('applies run, module and period filters', async () => {
    const one = (await lead.get(`${P()}/reports/overview?run_id=${runA}`)).json
    expect(one.totals.run_cases).toBe(3)
    expect(one.by_run).toHaveLength(1)
    // Only bugs linked to the run's attempts.
    expect(one.defects.total).toBe(1)

    const pay = await lead.get(
      `${P()}/reports/overview?module_id=${(await select<{ id: string }>(h.pool, "SELECT id FROM modules WHERE project_id = ? AND module_code = 'PAY'", [project.id]))[0]?.id}`,
    )
    expect(pay.json.totals).toMatchObject({ run_cases: 1, executed: 0 })
    expect(pay.json.by_run).toHaveLength(1)

    const future = (await lead.get(`${P()}/reports/overview?from=2099-01-01`)).json
    expect(future.totals.run_cases).toBe(0)
    expect(future.totals.attempts).toBe(0)
    expect(future.defects.total).toBe(0)

    const bad = await lead.get(`${P()}/reports/overview?from=2026-08-01&to=2026-07-01`)
    expect(bad.status).toBe(422)
    expect((await lead.get(`${P()}/reports/overview?run_id=1%20OR%201`)).status).toBe(422)
  })

  it('never leaks another project (TB-RBAC-002)', async () => {
    expect((await lead.get(`/projects/${other.code}/reports/overview`)).status).toBe(404)
    expect((await lead.get(`/projects/${other.code}/reports/export?dataset=results`)).status).toBe(
      404,
    )
  })
})

describe('report export (TB-REPORT-001)', () => {
  it('exports latest results as CSV with formulas neutralised and labels translated', async () => {
    const res = await lead.raw(`${P()}/reports/export?dataset=results&run_id=${runA}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/csv; charset=utf-8')
    expect(res.headers.get('content-disposition')).toMatch(
      new RegExp(`attachment; filename="testboard-${project.code}-results-\\d{8}-\\d{4}\\.csv"`),
    )
    expect(res.headers.get('cache-control')).toBe('no-store')
    const text = res.bytes.toString('utf8')
    expect(text.startsWith(BOM)).toBe(true)
    const lines = text.slice(1).trim().split('\r\n')
    expect(lines[0]).toMatch(/^Kode lembar uji,Nama lembar uji,Fase,Fitur,Kode skenario uji,Judul/)
    expect(lines).toHaveLength(4)
    // Plain words, the same as in the app (owner, 2026-11-24).
    expect(text).toContain('Sesuai')
    expect(text).toContain('Tidak bisa dicoba')
    expect(text).toContain('Belum dicoba')
    // Latest attempt of the login case is PASSED; the failed attempt's text is not "latest".
    expect(text).not.toContain('HYPERLINK')
  })

  it('exports every attempt with the injection escaped and linked bug codes', async () => {
    const res = await lead.raw(`${P()}/reports/export?dataset=attempts&locale=en`)
    const text = res.bytes.toString('utf8')
    expect(text).toContain(`"'=HYPERLINK(""http://evil.example"",""klik"")"`)
    expect(text).toMatch(/,Retest after a fix,As expected,/)
    expect(text).toMatch(/BUG-[A-Z0-9]+-0001/)
    expect(text.slice(1).split('\r\n')[0]).toMatch(/^Test sheet code,Feature,Scenario code/)
  })

  it('exports bugs as a real XLSX workbook (typed cells, no formulas)', async () => {
    const res = await lead.raw(`${P()}/reports/export?dataset=defects&format=xlsx`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    const book = readWorkbook(res.bytes)
    expect(book.sheets).toHaveLength(1)
    const sheet = book.sheets[0]!
    expect(sheet.name).toBe('Masalah')
    expect(sheet.rows[0]?.slice(0, 3)).toEqual(['Kode masalah', 'Judul', 'Tingkat dampak'])
    expect(sheet.rows).toHaveLength(3)
    expect(sheet.rows.flat()).toEqual(
      expect.arrayContaining(['Berat', 'Ringan', 'Baru dilaporkan']),
    )
  })

  it('exports the case library in the import template format', async () => {
    const res = await lead.raw(`${P()}/reports/export?dataset=cases`)
    const [header, ...rows] = res.bytes.toString('utf8').slice(1).trim().split('\r\n')
    expect(header).toMatch(
      /^case_code,module_code,suite_name,category,title,requirement_refs,priority_code,test_type_code,actor_label,preconditions,test_steps_text,expected_result,source_locale,source_document,case_status,current_version,updated_at$/,
    )
    expect(rows).toHaveLength(3)
  })

  it('is for Admins only (Pemantau is gone, ADR 0019), and is audited', async () => {
    expect((await lead.raw(`${P()}/reports/export?dataset=results`)).status).toBe(200)
    expect((await viewer.raw(`${P()}/reports/export?dataset=results`)).status).toBe(403)
    expect((await tester.raw(`${P()}/reports/export?dataset=results`)).status).toBe(403)
    expect((await lead.raw(`${P()}/reports/export?dataset=nope`)).status).toBe(422)

    const log = await lead.get(`${P()}/audit-logs?action=EXPORT`)
    expect(log.status).toBe(200)
    expect(log.json.total).toBeGreaterThanOrEqual(5)
    expect(log.json.data[0]).toMatchObject({ entity_type: 'report', action_code: 'EXPORT' })
    expect(log.json.data[0].changes.map((c: { field: string }) => c.field)).toEqual(
      expect.arrayContaining(['dataset', 'format', 'rows']),
    )
  })
})

describe('audit log', () => {
  it('lists project activity with field changes for leads only', async () => {
    const all = await lead.get(`${P()}/audit-logs?page_size=100`)
    expect(all.status).toBe(200)
    const types = new Set(all.json.data.map((e: { entity_type: string }) => e.entity_type))
    expect([...types]).toEqual(expect.arrayContaining(['test_case', 'defect']))
    const created = all.json.data.find(
      (e: { entity_type: string; action_code: string }) =>
        e.entity_type === 'defect' && e.action_code === 'CREATE',
    )
    expect(created.actor).toMatchObject({ id: testerId })
    expect(created.changes.length).toBeGreaterThan(0)
    // Named, not numbered (audit 2026-11-24): the item and every id inside the changes.
    expect(created.entity_label).toMatch(/^BUG-/)
    const ids = (created.changes as { field: string; new: unknown }[]).filter(
      (c) => ['module_id', 'cycle_id'].includes(c.field) && c.new !== null,
    )
    for (const change of ids) {
      const kind = change.field === 'module_id' ? 'module' : 'cycle'
      expect(created.refs[`${kind}:${String(change.new)}`]).toEqual(expect.any(String))
    }
    const labelled = all.json.data.filter((e: { entity_label: string | null }) => e.entity_label)
    expect(labelled.length).toBeGreaterThan(all.json.data.length / 2)

    const bugsOnly = await lead.get(`${P()}/audit-logs?entity_type=defect`)
    expect(
      bugsOnly.json.data.every((e: { entity_type: string }) => e.entity_type === 'defect'),
    ).toBe(true)
    expect((await viewer.get(`${P()}/audit-logs`)).status).toBe(403)
    expect((await tester.get(`${P()}/audit-logs`)).status).toBe(403)
    expect((await lead.get(`${P()}/audit-logs?action=drop%20table`)).status).toBe(422)
  })
})
