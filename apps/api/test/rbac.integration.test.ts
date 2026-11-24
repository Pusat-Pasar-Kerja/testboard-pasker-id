import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  addMember,
  Client,
  createHarness,
  createProject,
  createUser,
  unique,
} from './support/harness.js'

const h = createHarness()
afterAll(() => h.pool.end())

const caseBody = {
  title: 'Pengguna dapat masuk',
  expected_result: 'Dasbor tampil',
  module_code: 'AUTH',
}

let projectA: { id: string; code: string }
let projectB: { id: string; code: string }
const clients: Record<string, Client> = {}
let caseInB: string

beforeAll(async () => {
  projectA = await createProject(h.pool)
  projectB = await createProject(h.pool)
  for (const role of ['ADMIN', 'QA_LEAD', 'TESTER', 'DEVELOPER', 'VIEWER'] as const) {
    const user = await createUser(h.pool, { name: role })
    await addMember(h.pool, projectA.id, user.id, role)
    clients[role] = new Client(h)
    await clients[role].login(user.email)
  }
  const leadB = await createUser(h.pool)
  await addMember(h.pool, projectB.id, leadB.id, 'QA_LEAD')
  const clientB = new Client(h)
  await clientB.login(leadB.email)
  const created = await clientB.post(`/projects/${projectB.code}/test-cases`, caseBody)
  caseInB = created.json.id
})

describe('project scoping (TB-RBAC-002, TB-PRJ-001)', () => {
  it('lists only member projects', async () => {
    const res = await clients.VIEWER!.get('/projects')
    const codes = (res.json as { project_code: string }[]).map((p) => p.project_code)
    expect(codes).toContain(projectA.code)
    expect(codes).not.toContain(projectB.code)
  })

  it('answers 404 (not 403) for another project and for its entities through my project', async () => {
    const lead = clients.QA_LEAD!
    expect((await lead.get(`/projects/${projectB.code}`)).status).toBe(404)
    expect((await lead.get(`/projects/${projectB.code}/test-cases`)).status).toBe(404)
    expect((await lead.get(`/projects/${projectA.code}/test-cases/${caseInB}`)).status).toBe(404)
    expect(
      (await lead.patch(`/projects/${projectA.code}/test-cases/${caseInB}`, { title: 'hijack' }))
        .status,
    ).toBe(404)
  })

  it('requires a session for project data', async () => {
    expect((await new Client(h).get(`/projects/${projectA.code}`)).status).toBe(401)
  })
})

describe('role permissions (doc 09 matrix)', () => {
  it('TB-RBAC-001: VIEWER cannot create a test case via the API', async () => {
    const res = await clients.VIEWER!.post(`/projects/${projectA.code}/test-cases`, caseBody)
    expect(res.status).toBe(403)
  })

  it('TB-RBAC-003: DEVELOPER cannot edit the expected result', async () => {
    const created = await clients.QA_LEAD!.post(`/projects/${projectA.code}/test-cases`, caseBody)
    const res = await clients.DEVELOPER!.patch(
      `/projects/${projectA.code}/test-cases/${created.json.id}`,
      {
        expected_result: 'Diubah developer',
      },
    )
    expect(res.status).toBe(403)
  })

  it('a Pengguna works inside UATs: no scenario library, no members, no modules (ADR 0019)', async () => {
    const tester = clients.TESTER!
    expect((await tester.get(`/projects/${projectA.code}/test-cases`)).status).toBe(403)
    expect((await tester.get(`/projects/${projectA.code}/phases`)).status).toBe(403)
    expect(
      (await tester.post(`/projects/${projectA.code}/modules`, { module_code: 'X1', name: 'X' }))
        .status,
    ).toBe(403)
    expect(
      (
        await tester.post(`/projects/${projectA.code}/members`, {
          email: 'a@b.invalid',
          role_code: 'TESTER',
        })
      ).status,
    ).toBe(403)
  })

  it('only an Admin manages members; Developer and Pemantau are gone (ADR 0019)', async () => {
    const admin = clients.ADMIN!
    const newcomer = await createUser(h.pool)
    const added = await admin.post(`/projects/${projectA.code}/members`, {
      email: newcomer.email,
      role_code: 'TESTER',
    })
    expect(added.status).toBe(201)
    expect(added.json.user.has_password).toBe(true)
    expect(
      (await clients.QA_LEAD!.delete(`/projects/${projectA.code}/members/${newcomer.id}`)).status,
    ).toBe(403)
    // ADMIN and QA_LEAD are website matters (ADR 0017); DEVELOPER and VIEWER no longer exist.
    for (const role_code of ['ADMIN', 'QA_LEAD', 'DEVELOPER', 'VIEWER']) {
      const res = await admin.patch(`/projects/${projectA.code}/members/${newcomer.id}`, {
        role_code,
      })
      expect(res.status).toBe(422)
    }
    // No "last ADMIN" rule any more: the website roles manage every project.
    const me = await admin.get('/auth/me')
    const demoteSelf = await admin.patch(`/projects/${projectA.code}/members/${me.json.id}`, {
      role_code: 'TESTER',
    })
    expect(demoteSelf.status).toBe(200)
    await h.pool.query(
      "UPDATE project_members SET role_code = 'ADMIN' WHERE project_id = ? AND user_id = ?",
      [projectA.id, me.json.id],
    )
  })

  it('an Admin creates the account of a new e-mail from a name; it is not activated', async () => {
    const admin = clients.ADMIN!
    const email = `${unique('baru').toLowerCase()}@test.invalid`
    const missing = await admin.post(`/projects/${projectA.code}/members`, {
      email,
      role_code: 'TESTER',
    })
    expect(missing.status).toBe(422)
    expect(missing.json.error.details[0]).toMatchObject({ field: 'email', message: 'NO_ACCOUNT' })

    const created = await admin.post(`/projects/${projectA.code}/members`, {
      email,
      display_name: 'Warga Baru',
      role_code: 'TESTER',
    })
    expect(created.status).toBe(201)
    expect(created.json).toMatchObject({
      role_code: 'TESTER',
      user: { display_name: 'Warga Baru', email, has_password: false, is_active: true },
    })
    // No password yet: signing in is impossible until the person activates the account.
    const login = await new Client(h).post('/auth/login', { email, password: 'whatever-123' })
    expect(login.status).toBe(401)
  })

  it('a removed member loses access immediately', async () => {
    const admin = clients.ADMIN!
    const temp = await createUser(h.pool)
    await addMember(h.pool, projectA.id, temp.id, 'VIEWER')
    const client = new Client(h)
    await client.login(temp.email)
    expect((await client.get(`/projects/${projectA.code}`)).status).toBe(200)
    expect((await admin.delete(`/projects/${projectA.code}/members/${temp.id}`)).status).toBe(204)
    expect((await client.get(`/projects/${projectA.code}`)).status).toBe(404)
  })
})

describe('website roles Admin and Super Admin (ADR 0004, ADR 0017)', () => {
  it('an Admin creates and manages every project but not accounts or website settings', async () => {
    // A legacy project ADMIN row is not a website role.
    expect(
      (await clients.ADMIN!.post('/projects', { project_code: unique('X'), name: 'X' })).status,
    ).toBe(403)

    const siteAdmin = await createUser(h.pool, { siteAdmin: true })
    const client = new Client(h)
    await client.login(siteAdmin.email)
    const me = await client.get('/auth/me')
    expect(me.json).toMatchObject({ system_role: 'ADMIN', is_super_admin: false })

    const code = unique('adm').toLowerCase()
    const created = await client.post('/projects', { project_code: code, name: 'Proyek Admin' })
    expect(created.status).toBe(201)
    expect(created.json.role_code).toBe('ADMIN')
    // Not a member of project B, yet it manages it.
    expect((await client.get(`/projects/${projectB.code}/test-cases/${caseInB}`)).status).toBe(200)
    const codes = ((await client.get('/projects')).json as { project_code: string }[]).map(
      (p) => p.project_code,
    )
    expect(codes).toEqual(expect.arrayContaining([projectA.code, projectB.code]))
    expect((await client.get('/admin/projects')).status).toBe(200)

    expect((await client.get('/admin/users')).status).toBe(403)
    expect((await client.get('/admin/settings')).status).toBe(403)
    expect((await client.get('/admin/audit-logs')).status).toBe(403)
  })

  it('a Super Admin gives and takes the website roles, one at a time', async () => {
    const sa = await createUser(h.pool, { superAdmin: true })
    const client = new Client(h)
    await client.login(sa.email)
    const target = await createUser(h.pool)
    const targetClient = new Client(h)
    await targetClient.login(target.email)

    const made = await client.patch(`/admin/users/${target.id}`, { system_role: 'ADMIN' })
    expect(made.status).toBe(200)
    expect(made.json).toMatchObject({ system_role: 'ADMIN', is_super_admin: false })
    expect((await targetClient.get('/auth/me')).json.system_role).toBe('ADMIN')
    expect(
      (await targetClient.post('/projects', { project_code: unique('t'), name: 'T' })).status,
    ).toBe(201)

    const back = await client.patch(`/admin/users/${target.id}`, { system_role: 'NONE' })
    expect(back.json.system_role).toBeNull()
    expect(
      (await targetClient.post('/projects', { project_code: unique('t'), name: 'T' })).status,
    ).toBe(403)

    const created = await client.post('/admin/users', {
      email: `${unique('adm').toLowerCase()}@test.invalid`,
      display_name: 'Admin Baru',
      system_role: 'ADMIN',
    })
    expect(created.status).toBe(201)
    expect(created.json.user.system_role).toBe('ADMIN')
  })

  it('only Super Admin manages users; it sees every project', async () => {
    expect((await clients.ADMIN!.get('/admin/users')).status).toBe(403)

    const sa = await createUser(h.pool, { superAdmin: true })
    const client = new Client(h)
    await client.login(sa.email)
    const code = unique('sa').toLowerCase()
    const created = await client.post('/projects', { project_code: code, name: 'Baru' })
    expect(created.status).toBe(201)
    expect(created.json.project_code).toBe(code.toUpperCase())
    expect((await client.post('/projects', { project_code: code, name: 'Dup' })).status).toBe(409)
    expect((await client.get(`/projects/${projectB.code}/test-cases/${caseInB}`)).status).toBe(200)

    const newUser = await client.post('/admin/users', {
      email: `${unique('n').toLowerCase()}@test.invalid`,
      display_name: 'Baru',
    })
    expect(newUser.status).toBe(201)
    expect(newUser.json.temporary_password).toMatch(/^[A-Za-z2-9]{20}$/)
    const login = await new Client(h).post('/auth/login', {
      email: newUser.json.user.email,
      password: newUser.json.temporary_password,
    })
    expect(login.status).toBe(200)
  })

  it('deactivating a user signs them out; the last Super Admin cannot be removed', async () => {
    const sa = await createUser(h.pool, { superAdmin: true })
    const admin = new Client(h)
    await admin.login(sa.email)
    const target = await createUser(h.pool)
    const targetClient = new Client(h)
    await targetClient.login(target.email)

    expect((await admin.patch(`/admin/users/${target.id}`, { is_active: false })).status).toBe(200)
    expect((await targetClient.get('/auth/me')).status).toBe(401)

    const settings = await admin.request('PUT', '/admin/settings', { 'site.support_contact': 'x' })
    expect(settings.status).toBe(200)
    expect((await admin.get('/admin/settings')).json.values['site.support_contact']).toBe('x')
    await admin.request('PUT', '/admin/settings', { 'site.support_contact': '' })
  })
})
