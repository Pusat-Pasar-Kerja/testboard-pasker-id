import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { select } from '../src/db/tx.js'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

const h = createHarness()
afterAll(() => h.pool.end())

let project: { id: string; code: string }
let lead: Client
let tester: Client
let otherTester: Client
let developer: Client
let otherDeveloper: Client
let viewer: Client
let testerId: string
let developerId: string
let viewerId: string
const P = () => `/projects/${project.code}`

/** READY case -> ACTIVE run assigned to the tester -> one attempt with `result`. */
async function attempt(result: 'FAILED' | 'PASSED' = 'FAILED') {
  const testCase = await lead.post(`${P()}/test-cases`, {
    module_code: 'AUTH',
    title: `Kasus ${Math.random().toString(36).slice(2, 8)}`,
    test_steps_text: '1. Buka\n2. Klik',
    expected_result: 'Berhasil',
    case_status: 'READY',
  })
  const run = await lead.post(`${P()}/runs`, { name: 'Run bug' })
  await lead.post(`${P()}/runs/${run.json.id}/cases`, {
    test_case_ids: [testCase.json.id],
    assigned_to: testerId,
  })
  await lead.post(`${P()}/runs/${run.json.id}/status`, { status_code: 'ACTIVE' })
  const runCaseId = (await lead.get(`${P()}/runs/${run.json.id}`)).json.run_cases[0].run_case_id
  const execution = await tester.post(`${P()}/run-cases/${runCaseId}/executions`, {
    result_status: result,
    actual_result: result === 'FAILED' ? 'Tombol tidak merespons' : null,
  })
  return { runCaseId: runCaseId as string, executionId: execution.json.id as string }
}

const createBug = (client: Client, body: Record<string, unknown> = {}) =>
  client.post(`${P()}/defects`, { title: 'Tombol simpan tidak merespons', ...body })

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
  const d = await make('DEVELOPER')
  developer = d.client
  developerId = d.user.id
  otherDeveloper = (await make('DEVELOPER')).client
  const v = await make('VIEWER')
  viewer = v.client
  viewerId = v.user.id
})

describe('creating bugs', () => {
  it('creates a standalone bug with a generated code and an OPEN history entry (TB-BUG-002)', async () => {
    const first = await createBug(tester, { source_kind: 'USER_REPORT', severity_code: 'HIGH' })
    expect(first.status).toBe(201)
    expect(first.json.bug_code).toMatch(/^BUG-[A-Z0-9]{1,3}-0001$/)
    expect(first.json).toMatchObject({
      status_code: 'OPEN',
      severity_code: 'HIGH',
      priority_code: 'MEDIUM',
      source_kind: 'USER_REPORT',
      linked_executions: [],
    })
    expect(first.json.reported_by.id).toBe(testerId)
    expect(first.json.history).toEqual([
      expect.objectContaining({ from_status: null, to_status: 'OPEN' }),
    ])
    const second = await createBug(lead)
    expect(second.json.bug_code).toBe(first.json.bug_code.replace(/0001$/, '0002'))
  })

  it('links the bug to the failed attempt it came from (TB-BUG-001)', async () => {
    const { runCaseId, executionId } = await attempt('FAILED')
    const bug = await createBug(tester, { execution_ids: [executionId] })
    expect(bug.status).toBe(201)
    expect(bug.json.linked_executions).toEqual([
      expect.objectContaining({ execution_id: executionId, result_status: 'FAILED' }),
    ])
    const workspace = await tester.get(`${P()}/run-cases/${runCaseId}`)
    expect(workspace.json.linked_defects.map((d: { id: string }) => d.id)).toEqual([bug.json.id])
  })

  it('rejects attempts from another project, assignment by testers and viewers', async () => {
    const other = await createProject(h.pool)
    const outsider = await createUser(h.pool)
    await addMember(h.pool, other.id, outsider.id, 'QA_LEAD')
    expect((await createBug(tester, { execution_ids: ['999999999'] })).status).toBe(422)
    expect((await createBug(tester, { assigned_to: developerId })).status).toBe(403)
    expect((await createBug(viewer)).status).toBe(403)
    expect((await createBug(developer)).status).toBe(403)
    expect((await createBug(lead, { assigned_to: viewerId })).status).toBe(422)
    expect((await createBug(lead, { title: 'x' })).status).toBe(422)
  })

  it('returns the first bug again for a repeated Idempotency-Key', async () => {
    const body = { title: 'Klik ganda membuat dua bug?' }
    const headers = { 'Idempotency-Key': 'bug-create-key-0001' }
    const a = await tester.request('POST', `${P()}/defects`, body, headers)
    const b = await tester.request('POST', `${P()}/defects`, body, headers)
    expect(a.status).toBe(201)
    expect(b.json.id).toBe(a.json.id)
  })
})

describe('status workflow', () => {
  it('fix -> retest fails -> REOPENED with reason, never auto-passed (TB-BUG-003)', async () => {
    const { runCaseId, executionId } = await attempt('FAILED')
    const bug = (await createBug(tester, { execution_ids: [executionId] })).json
    const url = `${P()}/defects/${bug.id}`
    expect((await lead.patch(url, { assigned_to: developerId })).status).toBe(200)

    const move = (client: Client, body: Record<string, unknown>) =>
      client.post(`${url}/status`, body)
    expect((await move(developer, { status_code: 'IN_PROGRESS' })).status).toBe(200)
    const fixed = await move(developer, { status_code: 'FIXED', fixed_in_version: '1.2.1' })
    expect(fixed.json).toMatchObject({ status_code: 'FIXED', fixed_in_version: '1.2.1' })
    expect((await move(developer, { status_code: 'READY_FOR_RETEST' })).status).toBe(200)
    // The developer cannot verify their own fix.
    expect((await move(developer, { status_code: 'VERIFIED' })).status).toBe(403)

    // Retest fails: a new attempt is recorded, the bug status does not change by itself.
    await lead.post(
      `${P()}/runs/${(await tester.get(`${P()}/run-cases/${runCaseId}`)).json.run.id}/status`,
      {
        status_code: 'COMPLETED',
      },
    )
    const runId = (await tester.get(`${P()}/run-cases/${runCaseId}`)).json.run.id
    await lead.post(`${P()}/runs/${runId}/status`, { status_code: 'ACTIVE' })
    const retest = await tester.post(`${P()}/run-cases/${runCaseId}/executions`, {
      result_status: 'FAILED',
      actual_result: 'Masih tidak merespons',
    })
    expect(retest.json.attempt_number).toBe(2)
    expect((await tester.get(url)).json.status_code).toBe('READY_FOR_RETEST')

    expect((await move(tester, { status_code: 'REOPENED' })).status).toBe(422)
    const reopened = await move(tester, {
      status_code: 'REOPENED',
      comment: 'Retest #2 masih gagal',
      expected_status: 'READY_FOR_RETEST',
    })
    expect(reopened.status).toBe(200)
    expect(reopened.json.history.map((e: { to_status: string }) => e.to_status)).toEqual([
      'OPEN',
      'IN_PROGRESS',
      'FIXED',
      'READY_FOR_RETEST',
      'REOPENED',
    ])
    expect(reopened.json.history.at(-1).change_comment).toBe('Retest #2 masih gagal')

    // The earlier FAILED attempt is untouched (no auto pass).
    const attempts = (await tester.get(`${P()}/run-cases/${runCaseId}`)).json.attempts
    expect(attempts.map((a: { result_status: string }) => a.result_status)).toEqual([
      'FAILED',
      'FAILED',
    ])

    const audit = await select<{ n: number }>(
      h.pool,
      "SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type = 'defect' AND entity_id = ? AND action_code = 'STATUS_CHANGE'",
      [bug.id],
    )
    expect(Number(audit[0]?.n)).toBe(4)
  })

  it('rejects invalid transitions, stale status and the wrong people (TB-BUG-004)', async () => {
    const bug = (await createBug(tester)).json
    const url = `${P()}/defects/${bug.id}/status`
    const closed = await lead.post(url, { status_code: 'CLOSED' })
    expect(closed.status).toBe(409)
    expect(closed.json.error.details[0].message).toBe('Invalid transition OPEN -> CLOSED')
    expect((await developer.post(url, { status_code: 'IN_PROGRESS' })).status).toBe(403)
    expect((await viewer.post(url, { status_code: 'IN_PROGRESS' })).status).toBe(403)
    expect((await tester.post(url, { status_code: 'WONT_FIX', comment: 'x' })).status).toBe(403)
    expect(
      (await lead.post(url, { status_code: 'IN_PROGRESS', expected_status: 'FIXED' })).status,
    ).toBe(409)
    const declined = await lead.post(url, { status_code: 'WONT_FIX', comment: 'Bukan bug' })
    expect(declined.json.status_code).toBe('WONT_FIX')
  })
})

describe('editing, comments and links', () => {
  it('applies field restrictions per role', async () => {
    const bug = (await createBug(tester)).json
    const url = `${P()}/defects/${bug.id}`
    expect((await tester.patch(url, { title: 'Judul lebih jelas' })).json.title).toBe(
      'Judul lebih jelas',
    )
    expect((await tester.patch(url, { assigned_to: developerId })).status).toBe(403)
    expect((await otherTester.patch(url, { title: 'Bukan pelapor' })).status).toBe(403)
    expect((await viewer.patch(url, { title: 'Pemantau' })).status).toBe(403)

    const assigned = await lead.patch(url, { assigned_to: developerId, priority_code: 'URGENT' })
    expect(assigned.json.assigned_to.id).toBe(developerId)
    expect(assigned.json.priority_code).toBe('URGENT')
    expect((await developer.patch(url, { fixed_in_version: '2.0.1' })).status).toBe(200)
    expect((await developer.patch(url, { title: 'Dev ubah judul' })).status).toBe(403)
    expect((await otherDeveloper.patch(url, { fixed_in_version: '9' })).status).toBe(403)

    const stale = await lead.patch(url, {
      title: 'Judul dari layar lama',
      expected_updated_at: bug.updated_at,
    })
    expect(stale.status).toBe(409)
  })

  it('stores comments from the team, not from viewers', async () => {
    const bug = (await createBug(tester)).json
    const url = `${P()}/defects/${bug.id}/comments`
    const posted = await developer.post(url, { body: 'Sedang saya cek di staging.' })
    expect(posted.status).toBe(201)
    expect(posted.json.author.id).toBe(developerId)
    expect((await viewer.post(url, { body: 'Halo' })).status).toBe(403)
    expect((await tester.post(url, { body: '   ' })).status).toBe(422)
    const list = await viewer.get(url)
    expect(list.json.map((c: { body: string }) => c.body)).toEqual(['Sedang saya cek di staging.'])
  })

  it('links and unlinks test attempts', async () => {
    const bug = (await createBug(tester)).json
    const { executionId } = await attempt('FAILED')
    const url = `${P()}/defects/${bug.id}/executions`
    expect((await tester.post(url, { execution_id: executionId })).status).toBe(201)
    expect((await tester.post(url, { execution_id: executionId })).status).toBe(200)
    expect((await developer.post(url, { execution_id: executionId })).status).toBe(403)
    const unlinked = await lead.delete(`${url}/${executionId}`)
    expect(unlinked.json.linked_executions).toEqual([])
    expect((await lead.delete(`${url}/${executionId}`)).status).toBe(404)
  })

  it('never exposes bugs to non-members', async () => {
    const bug = (await createBug(tester)).json
    const outsider = await createUser(h.pool)
    const other = await createProject(h.pool)
    await addMember(h.pool, other.id, outsider.id, 'ADMIN')
    const client = new Client(h)
    await client.login(outsider.email)
    expect((await client.get(`${P()}/defects/${bug.id}`)).status).toBe(404)
    expect((await client.patch(`${P()}/defects/${bug.id}`, { title: 'Bocor' })).status).toBe(404)
    expect((await client.get(`/projects/${other.code}/defects/${bug.id}`)).status).toBe(404)
  })
})
