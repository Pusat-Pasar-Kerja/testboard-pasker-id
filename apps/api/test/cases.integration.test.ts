import type { RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execute, insertedId } from '../src/db/tx.js'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

const h = createHarness()
afterAll(() => h.pool.end())

let project: { id: string; code: string }
let lead: Client
const base = () => `/projects/${project.code}/test-cases`
const body = (extra: Record<string, unknown> = {}) => ({
  module_code: 'auth',
  title: 'Pengguna masuk dengan akun valid',
  test_steps_text: '1. Buka halaman login\n2. Isi kredensial\n3. Klik Masuk',
  expected_result: 'Dasbor tampil',
  ...extra,
})

beforeAll(async () => {
  project = await createProject(h.pool)
  const user = await createUser(h.pool)
  await addMember(h.pool, project.id, user.id, 'QA_LEAD')
  lead = new Client(h)
  await lead.login(user.email)
})

describe('create (TB-CASE-001/002)', () => {
  it('creates a DRAFT case with a generated per-module code and revision 1', async () => {
    const first = await lead.post(base(), body())
    const second = await lead.post(base(), body())
    expect(first.status).toBe(201)
    expect(first.json).toMatchObject({
      case_code: 'UAT-AUTH-001',
      case_status: 'DRAFT',
      current_version: 1,
    })
    expect(second.json.case_code).toBe('UAT-AUTH-002')

    const detail = await lead.get(`${base()}/${first.json.id}`)
    expect(detail.json.revisions).toHaveLength(1)
    expect(detail.json.steps.map((s: { instruction: string }) => s.instruction)).toEqual([
      'Buka halaman login',
      'Isi kredensial',
      'Klik Masuk',
    ])
    expect(detail.json.test_steps_text).toBe(body().test_steps_text)
  })

  it('rejects a duplicate code regardless of letter case (409)', async () => {
    expect((await lead.post(base(), body({ case_code: 'uat-dup-001' }))).status).toBe(201)
    const dup = await lead.post(base(), body({ case_code: 'UAT-DUP-001' }))
    expect(dup.status).toBe(409)
    expect(dup.json.error.details[0].field).toBe('case_code')
  })

  it('validates required fields and project-scoped references', async () => {
    const missing = await lead.post(base(), { title: 'abc' })
    expect(missing.status).toBe(422)
    expect(missing.json.error.details.map((d: { field: string }) => d.field)).toContain(
      'expected_result',
    )

    const other = await createProject(h.pool)
    const [rows] = await h.pool.query<RowDataPacket[]>(
      'SELECT id FROM test_suites WHERE project_id = ?',
      [other.id],
    )
    expect(rows).toHaveLength(0)
    const suite = await execute(
      h.pool,
      'INSERT INTO test_suites (project_id, name) VALUES (?, ?)',
      [other.id, 'Lain'],
    )
    const foreignSuite = await lead.post(base(), body({ suite_id: insertedId(suite) }))
    expect(foreignSuite.status).toBe(422)
    expect((await lead.post(base(), body({ module_code: 'NOPE' }))).status).toBe(422)
  })

  it('generates unique codes under concurrent creation', async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => lead.post(base(), body({ module_code: null }))),
    )
    const codes = results.map((r) => r.json.case_code)
    expect(results.every((r) => r.status === 201)).toBe(true)
    expect(new Set(codes).size).toBe(6)
  })
})

describe('edit, revisions and run snapshots (TB-CASE-003)', () => {
  it('each saved edit is a new version + revision; stale edits are rejected', async () => {
    const created = await lead.post(base(), body())
    const url = `${base()}/${created.json.id}`
    const edited = await lead.patch(url, {
      expected_result: 'Dasbor sesuai peran tampil',
      expected_version: 1,
    })
    expect(edited.status).toBe(200)
    expect(edited.json.current_version).toBe(2)

    const stale = await lead.patch(url, { title: 'Lain', expected_version: 1 })
    expect(stale.status).toBe(409)

    const noop = await lead.patch(url, { expected_result: 'Dasbor sesuai peran tampil' })
    expect(noop.json.current_version).toBe(2)

    const revisions = await lead.get(`${url}/revisions`)
    expect(revisions.json.map((r: { revision_number: number }) => r.revision_number)).toEqual([
      2, 1,
    ])
    expect(revisions.json[1].snapshot.expected_result).toBe('Dasbor tampil')
  })

  it('never changes the snapshot frozen in an existing run', async () => {
    const created = await lead.post(base(), body({ case_status: 'READY' }))
    const caseId = created.json.id
    const run = await execute(
      h.pool,
      'INSERT INTO test_runs (project_id, run_code, name) VALUES (?, ?, ?)',
      [project.id, 'RUN-SNAP-1', 'Run snapshot'],
    )
    const frozen = { title: created.json.title, expected_result: 'Dasbor tampil' }
    await execute(
      h.pool,
      'INSERT INTO test_run_cases (test_run_id, test_case_id, case_version, case_snapshot_json) VALUES (?, ?, 1, ?)',
      [insertedId(run), caseId, JSON.stringify(frozen)],
    )

    await lead.patch(`${base()}/${caseId}`, { expected_result: 'Hasil baru' })

    const [rows] = await h.pool.query<RowDataPacket[]>(
      'SELECT case_version, case_snapshot_json FROM test_run_cases WHERE test_case_id = ?',
      [caseId],
    )
    expect(Number(rows[0]?.case_version)).toBe(1)
    expect(JSON.parse(rows[0]?.case_snapshot_json as string)).toEqual(frozen)
    const detail = await lead.get(`${base()}/${caseId}`)
    expect(detail.json.current_version).toBe(2)
    expect(detail.json.used_in_runs[0]).toMatchObject({
      run_code: 'RUN-SNAP-1',
      case_version: 1,
      latest_status: 'NOT_RUN',
    })
  })
})

describe('archive, clone and list (TB-CASE-004)', () => {
  it('archives without losing history and hides archived cases by default', async () => {
    const created = await lead.post(base(), body({ title: 'Kasus yang diarsipkan' }))
    const url = `${base()}/${created.json.id}`
    expect((await lead.post(`${url}/archive`)).json.case_status).toBe('ARCHIVED')
    expect((await lead.patch(url, { title: 'Ubah arsip' })).status).toBe(409)

    const list = await lead.get(`${base()}?q=diarsipkan`)
    expect(list.json.total).toBe(0)
    const archived = await lead.get(`${base()}?q=diarsipkan&status=ARCHIVED`)
    expect(archived.json.total).toBe(1)
    expect((await lead.get(url)).json.revisions).toHaveLength(2)

    const restored = await lead.patch(url, { case_status: 'READY' })
    expect(restored.json.case_status).toBe('READY')
  })

  it('clones into a new DRAFT with a new code', async () => {
    const source = await lead.post(base(), body({ case_status: 'READY' }))
    const clone = await lead.post(`${base()}/${source.json.id}/clone`, {})
    expect(clone.status).toBe(201)
    expect(clone.json.case_status).toBe('DRAFT')
    expect(clone.json.case_code).not.toBe(source.json.case_code)
    expect(clone.json.title).toBe(source.json.title)
  })

  it('filters, paginates and treats LIKE wildcards in search literally', async () => {
    const page = await lead.get(`${base()}?module=AUTH&page_size=2&page=1`)
    expect(page.json.data).toHaveLength(2)
    expect(page.json.total).toBeGreaterThan(2)
    expect(
      page.json.data.every(
        (c: { module: { module_code: string } }) => c.module.module_code === 'AUTH',
      ),
    ).toBe(true)
    expect((await lead.get(`${base()}?q=%25`)).json.total).toBe(0)
  })
})
