import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execute, insertedId, select, selectOne } from '../src/db/tx.js'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

/** ADR 0013: bug phase (cycle) and bulk actions on bugs and test cases. */
const h = createHarness()
afterAll(() => h.pool.end())

let project: { id: string; code: string }
let lead: Client
let tester: Client
let developer: Client
let developerId: string
let cycleId: string
const P = () => `/projects/${project.code}`

beforeAll(async () => {
  project = await createProject(h.pool)
  const make = async (role: 'QA_LEAD' | 'TESTER' | 'DEVELOPER') => {
    const user = await createUser(h.pool, { name: role })
    await addMember(h.pool, project.id, user.id, role)
    const client = new Client(h)
    await client.login(user.email)
    return { user, client }
  }
  lead = (await make('QA_LEAD')).client
  tester = (await make('TESTER')).client
  const d = await make('DEVELOPER')
  developer = d.client
  developerId = d.user.id
  await execute(
    h.pool,
    "INSERT INTO modules (project_id, module_code, name) VALUES (?, 'LOKER', 'Lowongan')",
    [project.id],
  )
  cycleId = insertedId(
    await execute(
      h.pool,
      "INSERT INTO test_cycles (project_id, cycle_code, title) VALUES (?, 'FASE-1', 'UAT Fase 1')",
      [project.id],
    ),
  )
})

const bug = async (client: Client, body: Record<string, unknown> = {}) =>
  (await client.post(`${P()}/defects`, { title: 'Tombol simpan tidak merespons', ...body })).json

describe('bug phase (cycle)', () => {
  it('stores, filters and validates the cycle of a bug', async () => {
    const inPhase = await bug(lead, { cycle_id: cycleId })
    expect(inPhase.cycle).toEqual({ id: cycleId, cycle_code: 'FASE-1', title: 'UAT Fase 1' })
    const loose = await bug(lead)
    expect(loose.cycle).toBeNull()

    const filtered = await lead.get(`${P()}/defects?cycle=${cycleId}`)
    expect(filtered.json.data.map((d: { id: string }) => d.id)).toEqual([inPhase.id])
    const none = await lead.get(`${P()}/defects?cycle=none`)
    expect(none.json.data.map((d: { id: string }) => d.id)).toContain(loose.id)

    const other = await createProject(h.pool)
    const foreign = insertedId(
      await execute(
        h.pool,
        "INSERT INTO test_cycles (project_id, cycle_code, title) VALUES (?, 'X', 'Lain')",
        [other.id],
      ),
    )
    const refused = await lead.post(`${P()}/defects`, { title: 'Bug lain', cycle_id: foreign })
    expect(refused.status).toBe(422)
    expect(refused.json.error.details[0].field).toBe('cycle_id')

    const moved = await lead.patch(`${P()}/defects/${loose.id}`, { cycle_id: cycleId })
    expect(moved.json.cycle.id).toBe(cycleId)
  })
})

describe('bulk actions on bugs', () => {
  it('updates many bugs at once and records each change', async () => {
    const a = await bug(lead)
    const b = await bug(lead)
    const res = await lead.post(`${P()}/defects/bulk`, {
      action: 'update',
      defect_ids: [a.id, b.id],
      changes: { severity_code: 'HIGH', cycle_id: cycleId, assigned_to: developerId },
    })
    expect(res.status).toBe(200)
    expect(res.json).toEqual({ updated: 2, unchanged: 0, skipped: [] })
    const after = (await lead.get(`${P()}/defects/${a.id}`)).json
    expect(after).toMatchObject({
      severity_code: 'HIGH',
      cycle: { id: cycleId },
      assigned_to: { id: developerId },
    })
    const audits = await selectOne<{ n: number }>(
      h.pool,
      "SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type = 'defect' AND action_code = 'UPDATE' AND entity_id IN (?, ?)",
      [a.id, b.id],
    )
    expect(Number(audits?.n)).toBe(2)

    const again = await lead.post(`${P()}/defects/bulk`, {
      action: 'update',
      defect_ids: [a.id],
      changes: { severity_code: 'HIGH' },
    })
    expect(again.json).toEqual({ updated: 0, unchanged: 1, skipped: [] })
  })

  it('applies the workflow per bug and reports the ones it cannot move', async () => {
    const open = await bug(lead)
    const working = await bug(lead)
    await lead.post(`${P()}/defects/${working.id}/status`, { status_code: 'IN_PROGRESS' })
    const res = await lead.post(`${P()}/defects/bulk`, {
      action: 'status',
      defect_ids: [open.id, working.id, '999999999'],
      status_code: 'FIXED',
    })
    expect(res.json.updated).toBe(1)
    expect(res.json.skipped).toEqual([
      { id: open.id, code: open.bug_code, reason: 'INVALID_TRANSITION' },
      { id: '999999999', code: '', reason: 'NOT_FOUND' },
    ])
    const history = await select<{ to_status: string }>(
      h.pool,
      'SELECT to_status FROM defect_status_history WHERE defect_id = ? ORDER BY id',
      [working.id],
    )
    expect(history.map((row) => row.to_status)).toEqual(['OPEN', 'IN_PROGRESS', 'FIXED'])

    const needsReason = await lead.post(`${P()}/defects/bulk`, {
      action: 'status',
      defect_ids: [open.id],
      status_code: 'WONT_FIX',
    })
    expect(needsReason.status).toBe(422)
  })

  it('keeps role rules: a tester cannot reassign and a developer only moves own bugs', async () => {
    const mine = await bug(lead, { assigned_to: developerId })
    const notMine = await bug(lead)
    const byTester = await tester.post(`${P()}/defects/bulk`, {
      action: 'update',
      defect_ids: [mine.id],
      changes: { assigned_to: null },
    })
    expect(byTester.json.skipped[0]).toMatchObject({ id: mine.id, reason: 'FORBIDDEN' })

    const byDev = await developer.post(`${P()}/defects/bulk`, {
      action: 'status',
      defect_ids: [mine.id, notMine.id],
      status_code: 'IN_PROGRESS',
    })
    expect(byDev.json.updated).toBe(1)
    expect(byDev.json.skipped).toEqual([
      { id: notMine.id, code: notMine.bug_code, reason: 'FORBIDDEN' },
    ])
  })
})

describe('bulk actions on test cases', () => {
  const makeCase = async (title: string) =>
    (
      await lead.post(`${P()}/test-cases`, {
        module_code: 'AUTH',
        title,
        test_steps_text: '1. Buka',
        expected_result: 'Berhasil',
      })
    ).json

  it('marks ready, moves module and changes priority with a new version each', async () => {
    const a = await makeCase('Login berhasil')
    const b = await makeCase('Login gagal')
    const ready = await lead.post(`${P()}/test-cases/bulk`, {
      action: 'set_status',
      case_ids: [a.id, b.id],
      case_status: 'READY',
    })
    expect(ready.json).toEqual({ updated: 2, unchanged: 0, skipped: [] })
    const moved = await lead.post(`${P()}/test-cases/bulk`, {
      action: 'set_module',
      case_ids: [a.id, b.id],
      module_code: 'LOKER',
    })
    expect(moved.json.updated).toBe(2)
    const prio = await lead.post(`${P()}/test-cases/bulk`, {
      action: 'set_priority',
      case_ids: [a.id],
      priority_code: 'COULD_HAVE',
    })
    expect(prio.json.updated).toBe(1)
    const detail = (await lead.get(`${P()}/test-cases/${a.id}`)).json
    expect(detail).toMatchObject({
      case_status: 'READY',
      module: { module_code: 'LOKER' },
      priority_code: 'COULD_HAVE',
      current_version: 4,
    })
    const revisions = await select(
      h.pool,
      'SELECT revision_number FROM test_case_revisions WHERE test_case_id = ?',
      [a.id],
    )
    expect(revisions).toHaveLength(4)

    const badModule = await lead.post(`${P()}/test-cases/bulk`, {
      action: 'set_module',
      case_ids: [a.id],
      module_code: 'NOPE',
    })
    expect(badModule.status).toBe(422)
  })

  it('archives many cases and skips changes to archived ones', async () => {
    const a = await makeCase('Logout')
    const b = await makeCase('Lupa sandi')
    const archived = await lead.post(`${P()}/test-cases/bulk`, {
      action: 'archive',
      case_ids: [a.id, b.id],
    })
    expect(archived.json.updated).toBe(2)
    const moveArchived = await lead.post(`${P()}/test-cases/bulk`, {
      action: 'set_module',
      case_ids: [a.id],
      module_code: 'LOKER',
    })
    expect(moveArchived.json.skipped).toEqual([{ id: a.id, code: a.case_code, reason: 'ARCHIVED' }])
    expect(
      (await tester.post(`${P()}/test-cases/bulk`, { action: 'archive', case_ids: [b.id] })).status,
    ).toBe(403)
  })
})

describe('merging duplicate test cases', () => {
  const create = async (title: string, expected: string) =>
    (
      await lead.post(`${P()}/test-cases`, {
        module_code: 'AUTH',
        title,
        test_steps_text: '1. Buka',
        expected_result: expected,
      })
    ).json

  it('finds likely duplicates by words and bracket references, not by code', async () => {
    const a = await create(
      '[FSD-LPL-001/002/030] Aksi Lapor pada lowongan yang sudah dilamar',
      'Aksi Laporkan tampil pada lowongan native yang telah dilamar',
    )
    const b = await create(
      '[FSD-LPL-001/002] Aksi Lapor pada detail lowongan',
      'Aksi Laporkan lowongan ini tampil dan dapat dipilih',
    )
    await create('Ekspor laporan bulanan ke Excel', 'File XLSX terunduh')
    const pairs = (await lead.get(`${P()}/test-cases/similar?module=AUTH`)).json
    const pair = pairs.find(
      (p: { a: { id: string }; b: { id: string } }) =>
        [p.a.id, p.b.id].sort().join() === [a.id, b.id].sort().join(),
    )
    expect(pair).toMatchObject({ reasons: expect.arrayContaining(['REFERENCE']) })
    expect(pair.shared_refs).toEqual(['FSD-LPL-001', 'FSD-LPL-002'])
    expect(pair.score).toBeGreaterThan(0.45)
  })

  it('archives the merged cases with a link to the kept one; restoring clears it', async () => {
    const keep = await create('Login dengan akun SIAPkerja', 'Pengguna masuk ke dasbor')
    const dup1 = await create('Login memakai akun SIAPkerja', 'Pengguna masuk ke dasbor')
    const dup2 = await create('Masuk dengan akun SIAPkerja', 'Dasbor tampil')
    const res = await lead.post(`${P()}/test-cases/merge`, {
      target_id: keep.id,
      source_ids: [dup1.id, dup2.id],
    })
    expect(res.status).toBe(200)
    expect(res.json.merged.map((m: { id: string }) => m.id)).toEqual([dup1.id, dup2.id])

    const merged = (await lead.get(`${P()}/test-cases/${dup1.id}`)).json
    expect(merged).toMatchObject({
      case_status: 'ARCHIVED',
      merged_into: { id: keep.id, case_code: keep.case_code },
    })
    expect(merged.revisions[0].change_reason).toBe(`Merged into ${keep.case_code}`)
    const kept = (await lead.get(`${P()}/test-cases/${keep.id}`)).json
    expect(kept.case_status).toBe('DRAFT')
    expect(kept.merged_from.map((m: { id: string }) => m.id).sort()).toEqual(
      [dup1.id, dup2.id].sort(),
    )

    // Merging an archived case again, or into itself, is refused.
    expect(
      (await lead.post(`${P()}/test-cases/merge`, { target_id: keep.id, source_ids: [dup1.id] }))
        .status,
    ).toBe(409)
    expect(
      (await lead.post(`${P()}/test-cases/merge`, { target_id: keep.id, source_ids: [keep.id] }))
        .status,
    ).toBe(422)
    expect(
      (await tester.post(`${P()}/test-cases/merge`, { target_id: keep.id, source_ids: [dup2.id] }))
        .status,
    ).toBe(403)

    await lead.patch(`${P()}/test-cases/${dup1.id}`, { case_status: 'DRAFT' })
    const restored = (await lead.get(`${P()}/test-cases/${dup1.id}`)).json
    expect(restored.merged_into).toBeNull()
    const row = await selectOne<{ merged_into_id: string | null }>(
      h.pool,
      'SELECT merged_into_id FROM test_cases WHERE id = ?',
      [dup1.id],
    )
    expect(row?.merged_into_id).toBeNull()
  })
})
