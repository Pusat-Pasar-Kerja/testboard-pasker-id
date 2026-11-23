import type { RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { setPermanentSuperAdmin } from '../src/auth/owner.js'
import { execute } from '../src/db/tx.js'
import { Client, createHarness, createUser, unique } from './support/harness.js'

const h = createHarness()
afterAll(async () => {
  // Leave the shared test database with default settings for the other suites.
  await execute(h.pool, 'DELETE FROM system_settings')
  await h.pool.end()
})

let superAdmin: Client
let saEmail: string
let other: Client

beforeAll(async () => {
  const sa = await createUser(h.pool, { superAdmin: true, name: 'Admin Situs' })
  saEmail = sa.email
  superAdmin = new Client(h)
  await superAdmin.login(sa.email)
  const plain = await createUser(h.pool, { name: 'Bukan Admin' })
  other = new Client(h)
  await other.login(plain.email)
})

describe('projects from the admin console', () => {
  it('lets a Super Admin create a project; Users may not', async () => {
    const code = unique('KRH').slice(0, 20)
    const created = await superAdmin.post('/projects', {
      project_code: code,
      name: 'Karirhub',
      description: 'UAT Fase 1 dan Fase 2',
    })
    expect(created.status).toBe(201)
    expect(created.json).toMatchObject({ project_code: code, role_code: 'ADMIN' })
    expect((await other.post('/projects', { project_code: 'NOPE', name: 'x' })).status).toBe(403)
    expect((await superAdmin.post('/projects', { project_code: code, name: 'Lagi' })).status).toBe(
      409,
    )

    const list = await superAdmin.get('/admin/projects')
    expect(list.status).toBe(200)
    expect(list.json.find((p: { project_code: string }) => p.project_code === code)).toMatchObject({
      name: 'Karirhub',
      is_archived: false,
      // The creator needs no membership row (ADR 0017).
      member_count: 0,
      created_by: { display_name: 'Admin Situs' },
    })
    expect((await other.get('/admin/projects')).status).toBe(403)
  })

  it('changes project, module and cycle codes and refuses codes already in use', async () => {
    const code = unique('OLD').slice(0, 20)
    const taken = unique('TKN').slice(0, 20)
    const project = (await superAdmin.post('/projects', { project_code: code, name: 'Kode lama' }))
      .json as { id: string }
    await superAdmin.post('/projects', { project_code: taken, name: 'Sudah ada' })

    const clash = await superAdmin.patch(`/admin/projects/${project.id}`, { project_code: taken })
    expect(clash.status).toBe(409)
    expect(clash.json.error.details[0].field).toBe('project_code')
    expect(
      (await other.patch(`/admin/projects/${project.id}`, { project_code: 'X1' })).status,
    ).toBe(403)

    const next = unique('NEW').slice(0, 20)
    const renamed = await superAdmin.patch(`/admin/projects/${project.id}`, { project_code: next })
    expect(renamed.status).toBe(200)
    expect(renamed.json.project_code).toBe(next)
    expect((await superAdmin.get(`/projects/${code}`)).status).toBe(404)
    expect((await superAdmin.get(`/projects/${next}`)).status).toBe(200)

    // Module: the code changes, the case keeps its own code and follows the module.
    const auth = (
      await superAdmin.post(`/projects/${next}/modules`, {
        module_code: 'AUTH',
        name: 'Autentikasi',
      })
    ).json as { id: string }
    await superAdmin.post(`/projects/${next}/modules`, { module_code: 'LOKER', name: 'Loker' })
    const testCase = (
      await superAdmin.post(`/projects/${next}/test-cases`, {
        module_code: 'AUTH',
        title: 'Login berhasil',
        expected_result: 'Masuk ke beranda',
      })
    ).json as { id: string; case_code: string }
    expect(testCase.case_code).toBe('UAT-AUTH-001')
    expect(
      (await superAdmin.patch(`/projects/${next}/modules/${auth.id}`, { module_code: 'LOKER' }))
        .status,
    ).toBe(409)
    const module = await superAdmin.patch(`/projects/${next}/modules/${auth.id}`, {
      module_code: 'login',
      name: 'Masuk',
    })
    expect(module.json).toMatchObject({ module_code: 'LOGIN', name: 'Masuk' })
    const detail = await superAdmin.get(`/projects/${next}/test-cases/${testCase.id}`)
    expect(detail.json).toMatchObject({
      case_code: 'UAT-AUTH-001',
      module: { module_code: 'LOGIN' },
    })
    const fresh = await superAdmin.post(`/projects/${next}/test-cases`, {
      module_code: 'LOGIN',
      title: 'Login gagal',
      expected_result: 'Pesan salah sandi',
    })
    expect(fresh.json.case_code).toBe('UAT-LOGIN-001')

    // Cycle
    const cycle = (
      await superAdmin.post(`/projects/${next}/cycles`, {
        cycle_code: 'SIKLUS-1',
        title: 'Siklus 1',
      })
    ).json as { id: string }
    await superAdmin.post(`/projects/${next}/cycles`, { cycle_code: 'FASE-2', title: 'Fase 2' })
    expect(
      (await superAdmin.patch(`/projects/${next}/cycles/${cycle.id}`, { cycle_code: 'FASE-2' }))
        .status,
    ).toBe(409)
    const renamedCycle = await superAdmin.patch(`/projects/${next}/cycles/${cycle.id}`, {
      cycle_code: 'FASE-1',
      title: 'UAT Fase 1',
    })
    expect(renamedCycle.json).toMatchObject({ cycle_code: 'FASE-1', title: 'UAT Fase 1' })

    const log = await superAdmin.get(`/admin/audit-logs?entity_type=project&page_size=100`)
    const change = (
      log.json.data as { entity_id: string; changes: { field: string; old: unknown }[] }[]
    )
      .filter((e) => e.entity_id === project.id)
      .flatMap((e) => e.changes)
      .find((c) => c.field === 'project_code')
    expect(change).toMatchObject({ old: code, new: next })
    const entry = (log.json.data as { entity_id: string; entity_label: string | null }[]).find(
      (e) => e.entity_id === project.id,
    )
    expect(entry?.entity_label).toBe(`${next} · Kode lama`)
  })

  it('archives a project as read-only and restores it', async () => {
    const code = unique('ARC').slice(0, 20)
    const project = (await superAdmin.post('/projects', { project_code: code, name: 'Arsip' }))
      .json as { id: string }
    const archived = await superAdmin.patch(`/admin/projects/${project.id}`, {
      is_archived: true,
    })
    expect(archived.json.is_archived).toBe(true)

    expect((await superAdmin.get(`/projects/${code}/test-cases`)).status).toBe(200)
    const blocked = await superAdmin.post(`/projects/${code}/modules`, {
      module_code: 'AUTH',
      name: 'Auth',
    })
    expect(blocked.status).toBe(409)
    expect(blocked.json.error.details[0].message).toBe('PROJECT_ARCHIVED')

    await superAdmin.patch(`/admin/projects/${project.id}`, {
      is_archived: false,
      name: 'Arsip (aktif lagi)',
    })
    expect(
      (await superAdmin.post(`/projects/${code}/modules`, { module_code: 'AUTH', name: 'Auth' }))
        .status,
    ).toBe(201)
  })
})

describe('website settings (ADR 0011)', () => {
  it('starts from defaults, validates every key and records who changed what', async () => {
    const initial = await superAdmin.get('/admin/settings')
    expect(initial.status).toBe(200)
    expect(initial.json.values).toMatchObject({
      'site.name': 'TestBoard PASKER ID',
      'site.announcement': '',
      'auth.session_hours': 12,
      'retention.unused_file_days': 90,
    })

    expect(
      (await superAdmin.request('PUT', '/admin/settings', { 'auth.session_hours': 0 })).status,
    ).toBe(422)
    expect(
      (await superAdmin.request('PUT', '/admin/settings', { 'site.color': 'red' })).status,
    ).toBe(422)
    expect((await other.request('PUT', '/admin/settings', { 'site.name': 'X' })).status).toBe(403)

    const saved = await superAdmin.request('PUT', '/admin/settings', {
      'site.announcement': 'UAT Fase 2 dimulai Senin.',
      'site.support_contact': 'Hubungi Tim SIPK',
      'auth.session_hours': 1,
    })
    expect(saved.status).toBe(200)
    expect(saved.json.values['site.announcement']).toBe('UAT Fase 2 dimulai Senin.')
    expect(saved.json.changed['auth.session_hours'].by.display_name).toBe('Admin Situs')

    const anonymous = new Client(h)
    const publicSettings = await anonymous.get('/settings/public')
    expect(publicSettings.status).toBe(200)
    expect(publicSettings.json).toEqual({
      'site.name': 'TestBoard PASKER ID',
      'site.announcement': 'UAT Fase 2 dimulai Senin.',
      'site.default_locale': 'id',
      'site.support_contact': 'Hubungi Tim SIPK',
      'auth.remember_days': 30,
    })

    // New sign-ins get the shorter session right away.
    const fresh = new Client(h)
    await fresh.login(saEmail)
    const [session] = await h.pool.query<RowDataPacket[]>(
      `SELECT TIMESTAMPDIFF(SECOND, created_at, expires_at) AS seconds FROM user_sessions
        WHERE id = SHA2(?, 256)`,
      [fresh.cookies.get('tb_session') ?? ''],
    )
    expect(Math.abs(Number(session[0]?.seconds) - 3600)).toBeLessThan(120)

    const log = await superAdmin.get('/admin/audit-logs?project=site&entity_type=system_setting')
    expect(log.json.data[0]).toMatchObject({ action_code: 'UPDATE', project: null })
    expect(log.json.data[0].changes.map((c: { field: string }) => c.field)).toEqual(
      expect.arrayContaining(['site.announcement', 'auth.session_hours']),
    )
    expect((await other.get('/admin/audit-logs')).status).toBe(403)
  })
})

describe('permanent Super Admin', () => {
  it('cannot be revoked or deactivated from the website by anyone', async () => {
    const owner = await createUser(h.pool, { superAdmin: true, name: 'Pemilik' })
    await setPermanentSuperAdmin(h.pool, owner.email, true)
    const ownerClient = new Client(h)
    await ownerClient.login(owner.email)

    const users = (await superAdmin.get('/admin/users')).json as {
      id: string
      is_permanent: boolean
    }[]
    expect(users.find((u) => u.id === owner.id)?.is_permanent).toBe(true)

    for (const [client, body] of [
      [superAdmin, { system_role: 'NONE' }],
      [superAdmin, { is_active: false }],
      [ownerClient, { system_role: 'ADMIN' }],
    ] as const) {
      const res = await client.patch(`/admin/users/${owner.id}`, body)
      expect(res.status).toBe(403)
      expect(res.json.error.details[0].message).toBe('PERMANENT_SUPER_ADMIN')
    }
    // Renaming is still fine.
    expect(
      (await superAdmin.patch(`/admin/users/${owner.id}`, { display_name: 'Tim SIPK' })).status,
    ).toBe(200)

    await setPermanentSuperAdmin(h.pool, owner.email, false)
    expect(
      (await superAdmin.patch(`/admin/users/${owner.id}`, { system_role: 'NONE' })).status,
    ).toBe(200)
  })

  it('accepts 8-character passwords for new accounts and rejects shorter ones', async () => {
    const ok = await superAdmin.post('/admin/users', {
      email: `${unique('pw')}@demo.invalid`,
      display_name: 'Delapan',
      password: 'abcd1234',
    })
    expect(ok.status).toBe(201)
    const short = await superAdmin.post('/admin/users', {
      email: `${unique('pw')}@demo.invalid`,
      display_name: 'Tujuh',
      password: 'abc1234',
    })
    expect(short.status).toBe(422)
  })
})
