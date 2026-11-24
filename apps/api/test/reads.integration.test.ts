import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execute, insertedId } from '../src/db/tx.js'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

const h = createHarness()
afterAll(() => h.pool.end())

let project: { id: string; code: string }
let other: { id: string; code: string }
let viewer: Client
let runId: string
let defectId: string

/** One run with two cases: case A FAILED then PASSED on retest, case B never executed. */
beforeAll(async () => {
  project = await createProject(h.pool)
  other = await createProject(h.pool)
  const user = await createUser(h.pool)
  // A Pengguna reads the UATs they take part in (ADR 0019).
  await addMember(h.pool, project.id, user.id, 'TESTER')
  viewer = new Client(h)
  await viewer.login(user.email)

  const caseA = insertedId(
    await execute(
      h.pool,
      "INSERT INTO test_cases (project_id, case_code, title, expected_result, case_status) VALUES (?, 'UAT-A-001', 'Judul saat ini', 'x', 'READY')",
      [project.id],
    ),
  )
  const caseB = insertedId(
    await execute(
      h.pool,
      "INSERT INTO test_cases (project_id, case_code, title, expected_result, case_status) VALUES (?, 'UAT-A-002', 'Kasus B', 'x', 'READY')",
      [project.id],
    ),
  )
  runId = insertedId(
    await execute(
      h.pool,
      "INSERT INTO test_runs (project_id, run_code, name, status_code, starts_at) VALUES (?, 'RUN-1', 'Run satu', 'ACTIVE', UTC_TIMESTAMP(3))",
      [project.id],
    ),
  )
  await execute(
    h.pool,
    'INSERT INTO workshop_table_members (run_id, display_name, user_id) VALUES (?, ?, ?)',
    [runId, 'Pembaca', user.id],
  )
  const rcA = insertedId(
    await execute(
      h.pool,
      'INSERT INTO test_run_cases (test_run_id, test_case_id, case_snapshot_json, sort_order) VALUES (?, ?, ?, 1)',
      [runId, caseA, JSON.stringify({ title: 'Judul saat run dimulai' })],
    ),
  )
  await execute(
    h.pool,
    'INSERT INTO test_run_cases (test_run_id, test_case_id, sort_order) VALUES (?, ?, 2)',
    [runId, caseB],
  )
  const exec1 = insertedId(
    await execute(
      h.pool,
      "INSERT INTO test_executions (run_case_id, attempt_number, result_status, tested_at) VALUES (?, 1, 'FAILED', UTC_TIMESTAMP(3))",
      [rcA],
    ),
  )
  await execute(
    h.pool,
    "INSERT INTO test_executions (run_case_id, attempt_number, execution_kind, result_status, tested_at) VALUES (?, 2, 'RETEST', 'PASSED', UTC_TIMESTAMP(3))",
    [rcA],
  )
  defectId = insertedId(
    await execute(
      h.pool,
      "INSERT INTO defects (project_id, bug_code, title, severity_code, status_code) VALUES (?, 'BUG-T-0001', 'Tombol tidak merespons', 'HIGH', 'READY_FOR_RETEST')",
      [project.id],
    ),
  )
  await execute(
    h.pool,
    'INSERT INTO defect_execution_links (defect_id, execution_id) VALUES (?, ?)',
    [defectId, exec1],
  )
  await execute(
    h.pool,
    "INSERT INTO defect_status_history (defect_id, from_status, to_status) VALUES (?, NULL, 'OPEN')",
    [defectId],
  )
  await execute(
    h.pool,
    "INSERT INTO defects (project_id, bug_code, title, severity_code, status_code) VALUES (?, 'BUG-T-0002', 'Sudah ditutup', 'LOW', 'CLOSED')",
    [project.id],
  )
})

describe('runs (read-only)', () => {
  it('counts each run case once by its latest attempt (TB-DASH-001)', async () => {
    const runs = await viewer.get(`/projects/${project.code}/runs`)
    expect(runs.status).toBe(200)
    expect(runs.json[0]).toMatchObject({ run_code: 'RUN-1', total_cases: 2 })
    expect(runs.json[0].counts).toMatchObject({ PASSED: 1, FAILED: 0, NOT_RUN: 1 })
  })

  it('shows run cases with the frozen snapshot title, attempts and linked bugs', async () => {
    const run = await viewer.get(`/projects/${project.code}/runs/${runId}`)
    expect(run.json.run_cases[0]).toMatchObject({
      case_code: 'UAT-A-001',
      title: 'Judul saat run dimulai',
      latest_status: 'PASSED',
      attempts: 2,
      defect_codes: ['BUG-T-0001'],
    })
    expect(run.json.run_cases[1]).toMatchObject({ latest_status: 'NOT_RUN', attempts: 0 })
  })
})

describe('defects and dashboard (read-only)', () => {
  it('filters open bugs and returns detail with linked execution and history', async () => {
    const open = await viewer.get(`/projects/${project.code}/defects?status=open`)
    expect(open.json.total).toBe(1)
    expect(open.json.data[0].bug_code).toBe('BUG-T-0001')

    const detail = await viewer.get(`/projects/${project.code}/defects/${defectId}`)
    expect(detail.json.linked_executions[0]).toMatchObject({
      run_code: 'RUN-1',
      attempt_number: 1,
      result_status: 'FAILED',
    })
    expect(detail.json.history[0]).toMatchObject({ from_status: null, to_status: 'OPEN' })
  })

  it('aggregates the dashboard from latest statuses and open bugs only', async () => {
    const summary = await viewer.get(`/projects/${project.code}/reports/summary`)
    expect(summary.json).toMatchObject({
      total_run_cases: 2,
      open_defects: 1,
      critical_high_open_defects: 1,
    })
    expect(summary.json.counts).toMatchObject({ PASSED: 1, NOT_RUN: 1 })
    expect(summary.json.recent_defects).toHaveLength(2)
    const scoped = await viewer.get(`/projects/${project.code}/reports/summary?run_id=${runId}`)
    expect(scoped.json.run_id).toBe(runId)
  })

  it('never exposes runs or bugs through another project', async () => {
    const outsider = await createUser(h.pool)
    await addMember(h.pool, other.id, outsider.id, 'ADMIN')
    const client = new Client(h)
    await client.login(outsider.email)
    expect((await client.get(`/projects/${other.code}/runs/${runId}`)).status).toBe(404)
    expect((await client.get(`/projects/${other.code}/defects/${defectId}`)).status).toBe(404)
    expect(
      (await client.get(`/projects/${other.code}/reports/summary?run_id=${runId}`)).status,
    ).toBe(404)
  })
})
