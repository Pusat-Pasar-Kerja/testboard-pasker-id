import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

const h = createHarness()
afterAll(() => h.pool.end())

let project: { id: string; code: string }
let lead: Client
let tester: Client
let otherTester: Client
let developer: Client
let testerId: string
let viewerId: string
const P = () => `/projects/${project.code}`

async function readyCase(title: string, steps = '1. Buka halaman\n2. Klik tombol\n3. Lihat hasil') {
  const res = await lead.post(`${P()}/test-cases`, {
    module_code: 'AUTH',
    title,
    test_steps_text: steps,
    expected_result: 'Sesuai harapan',
    case_status: 'READY',
  })
  return res.json as { id: string; case_code: string }
}

async function activeRunWith(caseIds: string[], assignedTo: string | null = testerId) {
  const run = await lead.post(`${P()}/runs`, { name: 'Run uji', environment_name: 'STAGING' })
  await lead.post(`${P()}/runs/${run.json.id}/cases`, {
    test_case_ids: caseIds,
    assigned_to: assignedTo,
  })
  await lead.post(`${P()}/runs/${run.json.id}/status`, { status_code: 'ACTIVE' })
  const detail = await lead.get(`${P()}/runs/${run.json.id}`)
  return {
    runId: run.json.id as string,
    runCases: detail.json.run_cases as { run_case_id: string; test_case_id: string }[],
  }
}

beforeAll(async () => {
  project = await createProject(h.pool)
  const make = async (role: 'QA_LEAD' | 'TESTER' | 'DEVELOPER' | 'VIEWER') => {
    const user = await createUser(h.pool, { name: role })
    await addMember(h.pool, project.id, user.id, role)
    const client = new Client(h)
    await client.login(user.email)
    return { user, client }
  }
  lead = (await make('QA_LEAD')).client
  const t = await make('TESTER')
  tester = t.client
  testerId = t.user.id
  otherTester = (await make('TESTER')).client
  developer = (await make('DEVELOPER')).client
  viewerId = (await make('VIEWER')).user.id
})

describe('cycles', () => {
  it('creates a cycle, rejects duplicates and inverted dates', async () => {
    const created = await lead.post(`${P()}/cycles`, {
      cycle_code: 'siklus-1',
      title: 'Siklus 1',
      starts_on: '2026-11-01',
      ends_on: '2026-11-30',
    })
    expect(created.status).toBe(201)
    expect(created.json.cycle_code).toBe('SIKLUS-1')
    expect((await lead.post(`${P()}/cycles`, { cycle_code: 'SIKLUS-1', title: 'x' })).status).toBe(
      409,
    )
    const bad = await lead.post(`${P()}/cycles`, {
      cycle_code: 'S2',
      title: 'x',
      starts_on: '2026-12-01',
      ends_on: '2026-11-01',
    })
    expect(bad.status).toBe(422)
    expect((await tester.post(`${P()}/cycles`, { cycle_code: 'S3', title: 'x' })).status).toBe(403)
  })
})

describe('runs (TB-RUN-001) and run lifecycle', () => {
  it('generates a run code and freezes READY cases with their version', async () => {
    const ready = await readyCase('Masuk dengan akun valid')
    const draft = (
      await lead.post(`${P()}/test-cases`, { title: 'Masih draf', expected_result: 'x' })
    ).json
    const run = await lead.post(`${P()}/runs`, { name: 'Sprint 1' })
    expect(run.status).toBe(201)
    expect(run.json).toMatchObject({ status_code: 'PLANNED', total_cases: 0 })
    expect(run.json.run_code).toMatch(/^RUN-\d{8}-\d+$/)

    const add = await lead.post(`${P()}/runs/${run.json.id}/cases`, {
      test_case_ids: [ready.id, draft.id, ready.id],
    })
    expect(add.json.added).toBe(1)
    expect(add.json.skipped).toEqual([{ test_case_id: draft.id, reason: 'NOT_READY' }])
    const again = await lead.post(`${P()}/runs/${run.json.id}/cases`, { test_case_ids: [ready.id] })
    expect(again.json.skipped[0].reason).toBe('ALREADY_IN_RUN')

    await lead.patch(`${P()}/test-cases/${ready.id}`, { title: 'Judul diubah setelah masuk run' })
    const detail = await lead.get(`${P()}/runs/${run.json.id}`)
    expect(detail.json.run_cases[0]).toMatchObject({
      title: 'Masuk dengan akun valid',
      case_version: 1,
      latest_status: 'NOT_RUN',
    })
  })

  it('only allows valid status transitions and freezes a locked run', async () => {
    const run = (await lead.post(`${P()}/runs`, { name: 'Siklus status' })).json
    const url = `${P()}/runs/${run.id}`
    expect((await lead.post(`${url}/status`, { status_code: 'COMPLETED' })).status).toBe(409)
    const active = await lead.post(`${url}/status`, { status_code: 'ACTIVE' })
    expect(active.json.status_code).toBe('ACTIVE')
    expect(active.json.starts_at).not.toBeNull()
    expect(
      (await lead.post(`${url}/status`, { status_code: 'COMPLETED' })).json.ends_at,
    ).not.toBeNull()
    expect((await lead.post(`${url}/status`, { status_code: 'ACTIVE' })).json.ends_at).toBeNull()
    await lead.post(`${url}/status`, { status_code: 'COMPLETED' })
    expect((await lead.post(`${url}/status`, { status_code: 'LOCKED' })).status).toBe(200)
    expect((await lead.patch(url, { name: 'Ubah' })).status).toBe(409)
    expect((await lead.post(`${url}/status`, { status_code: 'ACTIVE' })).status).toBe(409)
    expect((await tester.post(`${url}/status`, { status_code: 'ACTIVE' })).status).toBe(403)
  })

  it('assigns only executing members and removes a case only while it has no results', async () => {
    const one = await readyCase('Kasus assign 1')
    const two = await readyCase('Kasus assign 2')
    const { runId, runCases } = await activeRunWith([one.id, two.id], null)
    const assignUrl = `${P()}/runs/${runId}/cases/assign`
    expect(
      (
        await lead.patch(assignUrl, {
          run_case_ids: [runCases[0]!.run_case_id],
          assigned_to: viewerId,
        })
      ).status,
    ).toBe(422)
    const ok = await lead.patch(assignUrl, {
      run_case_ids: runCases.map((r) => r.run_case_id),
      assigned_to: testerId,
    })
    expect(ok.json.updated).toBe(2)

    await tester.post(`${P()}/run-cases/${runCases[0]!.run_case_id}/executions`, {
      result_status: 'PASSED',
    })
    expect(
      (await lead.delete(`${P()}/runs/${runId}/cases/${runCases[0]!.run_case_id}`)).status,
    ).toBe(409)
    expect(
      (await lead.delete(`${P()}/runs/${runId}/cases/${runCases[1]!.run_case_id}`)).status,
    ).toBe(204)
  })
})

describe('executions (TB-EXEC-001..004, TB-RUN-002)', () => {
  it('refuses to record results while the run is not ACTIVE', async () => {
    const c1 = await readyCase('Belum aktif')
    const run = (await lead.post(`${P()}/runs`, { name: 'Belum mulai' })).json
    await lead.post(`${P()}/runs/${run.id}/cases`, {
      test_case_ids: [c1.id],
      assigned_to: testerId,
    })
    const rc = (await lead.get(`${P()}/runs/${run.id}`)).json.run_cases[0]
    expect(
      (
        await tester.post(`${P()}/run-cases/${rc.run_case_id}/executions`, {
          result_status: 'PASSED',
        })
      ).status,
    ).toBe(409)
  })

  it('TB-EXEC-002/004: FAILED needs the actual result, BLOCKED/SKIPPED need a reason', async () => {
    const { runCases } = await activeRunWith([(await readyCase('Validasi hasil')).id])
    const url = `${P()}/run-cases/${runCases[0]!.run_case_id}/executions`
    const failed = await tester.post(url, { result_status: 'FAILED' })
    expect(failed.status).toBe(422)
    expect(failed.json.error.details[0].field).toBe('actual_result')
    const blocked = await tester.post(url, { result_status: 'BLOCKED' })
    expect(blocked.json.error.details[0].field).toBe('notes')
    expect((await tester.post(url, { result_status: 'NOT_RUN' })).status).toBe(422)
  })

  it('TB-EXEC-001/003: retest is a new attempt; the earlier FAILED stays; latest status follows', async () => {
    const { runId, runCases } = await activeRunWith([
      (await readyCase('Retest gagal lalu lulus')).id,
    ])
    const rc = runCases[0]!.run_case_id
    const url = `${P()}/run-cases/${rc}/executions`

    const first = await tester.post(url, {
      result_status: 'FAILED',
      actual_result: 'Tombol tidak merespons',
      browser_name: 'Chrome',
      tester_id: '1',
      step_results: [
        { step_number: 1, result_status: 'PASSED' },
        { step_number: 2, result_status: 'FAILED', actual_result: 'Tidak ada respons' },
      ],
    })
    expect(first.status).toBe(201)
    expect(first.json).toMatchObject({
      attempt_number: 1,
      execution_kind: 'INITIAL',
      result_status: 'FAILED',
    })
    expect(first.json.tester.display_name).toBe('TESTER')
    expect(first.json.step_results).toEqual([
      { step_number: 1, result_status: 'PASSED', actual_result: null },
      { step_number: 2, result_status: 'FAILED', actual_result: 'Tidak ada respons' },
    ])

    const retest = await tester.post(url, { result_status: 'PASSED' })
    expect(retest.json).toMatchObject({ attempt_number: 2, execution_kind: 'RETEST' })

    const detail = await tester.get(`${P()}/run-cases/${rc}`)
    expect(detail.json.latest_status).toBe('PASSED')
    expect(detail.json.attempts.map((a: { result_status: string }) => a.result_status)).toEqual([
      'PASSED',
      'FAILED',
    ])
    expect(detail.json.snapshot.steps).toHaveLength(3)

    const run = await lead.get(`${P()}/runs/${runId}`)
    expect(run.json.counts).toMatchObject({ PASSED: 1, FAILED: 0 })
    expect(run.json.run_cases[0].attempts).toBe(2)
  })

  it('TB-EXEC-004: BLOCKED is concluded but never counted as passed', async () => {
    const { runId, runCases } = await activeRunWith([(await readyCase('Terhambat data')).id])
    await tester.post(`${P()}/run-cases/${runCases[0]!.run_case_id}/executions`, {
      result_status: 'BLOCKED',
      notes: 'Data uji belum ada',
    })
    const summary = await lead.get(`${P()}/reports/summary?run_id=${runId}`)
    expect(summary.json.counts).toMatchObject({ BLOCKED: 1, PASSED: 0 })
  })

  it('TB-RUN-002: concurrent saves get unique, consecutive attempt numbers', async () => {
    const { runCases } = await activeRunWith([(await readyCase('Paralel')).id])
    const url = `${P()}/run-cases/${runCases[0]!.run_case_id}/executions`
    const results = await Promise.all(
      Array.from({ length: 5 }, () => lead.post(url, { result_status: 'PASSED' })),
    )
    expect(results.every((r) => r.status === 201)).toBe(true)
    expect(results.map((r) => r.json.attempt_number).sort()).toEqual([1, 2, 3, 4, 5])
  })

  it('a repeated request with the same Idempotency-Key creates only one attempt', async () => {
    const { runCases } = await activeRunWith([(await readyCase('Klik ganda')).id])
    const rc = runCases[0]!.run_case_id
    const url = `${P()}/run-cases/${rc}/executions`
    const headers = { 'Idempotency-Key': 'save-attempt-0001' }
    const a = await tester.request('POST', url, { result_status: 'PASSED' }, headers)
    const b = await tester.request('POST', url, { result_status: 'PASSED' }, headers)
    expect(b.json.id).toBe(a.json.id)
    expect((await tester.get(`${P()}/run-cases/${rc}`)).json.attempts).toHaveLength(1)
  })

  it('limits who may execute: assigned TESTER yes, other TESTER and DEVELOPER no', async () => {
    const { runCases } = await activeRunWith([(await readyCase('Hak eksekusi')).id])
    const url = `${P()}/run-cases/${runCases[0]!.run_case_id}/executions`
    expect((await otherTester.post(url, { result_status: 'PASSED' })).status).toBe(403)
    expect((await developer.post(url, { result_status: 'PASSED' })).status).toBe(403)
    expect((await tester.post(url, { result_status: 'PASSED' })).status).toBe(201)
  })

  it('rejects step numbers outside the snapshot and hides run cases of other projects', async () => {
    const { runCases } = await activeRunWith([
      (await readyCase('Langkah salah', '1. Satu-satunya langkah')).id,
    ])
    const rc = runCases[0]!.run_case_id
    const bad = await tester.post(`${P()}/run-cases/${rc}/executions`, {
      result_status: 'PASSED',
      step_results: [{ step_number: 4, result_status: 'PASSED' }],
    })
    expect(bad.status).toBe(422)

    const other = await createProject(h.pool)
    const outsider = await createUser(h.pool)
    await addMember(h.pool, other.id, outsider.id, 'QA_LEAD')
    const client = new Client(h)
    await client.login(outsider.email)
    expect((await client.get(`/projects/${other.code}/run-cases/${rc}`)).status).toBe(404)
    expect(
      (
        await client.post(`/projects/${other.code}/run-cases/${rc}/executions`, {
          result_status: 'PASSED',
        })
      ).status,
    ).toBe(404)
  })
})
