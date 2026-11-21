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
  it('lets a Super Admin create a project and become its Admin; others may not', async () => {
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
      member_count: 1,
      created_by: { display_name: 'Admin Situs' },
    })
    expect((await other.get('/admin/projects')).status).toBe(403)
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
    })

    // New sign-ins get the shorter session right away.
    const fresh = new Client(h)
    const login = await fresh.login(saEmail)
    expect(login.headers.getSetCookie().join(';')).toMatch(/Max-Age=3600/)

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
      [superAdmin, { is_super_admin: false }],
      [superAdmin, { is_active: false }],
      [ownerClient, { is_super_admin: false }],
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
      (await superAdmin.patch(`/admin/users/${owner.id}`, { is_super_admin: false })).status,
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
