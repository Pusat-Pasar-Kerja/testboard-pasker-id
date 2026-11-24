import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uiPng } from './support/fixtures.js'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

/**
 * Mode Workshop (ADR 0016) inside a UAT (ADR 0019): public UAT, group cards, easy answers,
 * "+1", review, and the project's public Bug Reporting.
 */
const h = createHarness()
afterAll(() => h.pool.end())

let project: { id: string; code: string }
let lead: Client
let cycleId: string
let runId: string
const modules: Record<string, string> = {}
let runCases: { run_case_id: string; test_case_id: string }[] = []
const caseIdsByModule: Record<string, string[]> = { LOKER: [], GIG: [] }
const P = () => `/projects/${project.code}`
const W = () => `${P()}/uats/${runId}`
const hour = 3_600_000
const soon = () => new Date(Date.now() + 24 * hour).toISOString()

async function newTable(name: string, moduleCodes: string[], members: string[] = []) {
  const res = await lead.post(`${W()}/groups`, {
    name,
    module_ids: moduleCodes.map((code) => modules[code]),
    members: members.map((name) => ({ name })),
    valid_from: new Date(Date.now() - hour).toISOString(),
    valid_until: soon(),
  })
  expect(res.status).toBe(201)
  return res.json as { id: string; access_code: string; name: string }
}

async function joined(code: string) {
  const client = new Client(h)
  const res = await client.post('/workshop/join', { code })
  expect(res.status).toBe(200)
  return { client, session: res.json }
}

const runCaseOf = (moduleCode: string, index: number) => {
  const caseId = caseIdsByModule[moduleCode]![index]
  return runCases.find((rc) => rc.test_case_id === caseId)!.run_case_id
}

beforeAll(async () => {
  project = await createProject(h.pool)
  const user = await createUser(h.pool, { name: 'Fasilitator' })
  await addMember(h.pool, project.id, user.id, 'QA_LEAD')
  lead = new Client(h)
  await lead.login(user.email)
  cycleId = (
    await lead.post(`${P()}/cycles`, {
      cycle_code: 'FASE-2',
      title: 'UAT Fase 2',
      status_code: 'ACTIVE',
    })
  ).json.id
  for (const [code, name] of [
    ['LOKER', 'Lapor Loker'],
    ['GIG', 'Gig Workers'],
  ] as const) {
    modules[code] = (await lead.post(`${P()}/modules`, { module_code: code, name })).json.id
    for (const title of ['Buka halaman', 'Isi formulir', 'Simpan data']) {
      const res = await lead.post(`${P()}/test-cases`, {
        module_code: code,
        cycle_id: cycleId,
        title: `${name}: ${title}`,
        test_steps_text: '1. Buka menu\n2. Klik tombol',
        expected_result: 'Data tersimpan',
        case_status: 'READY',
      })
      caseIdsByModule[code]!.push(res.json.id)
    }
  }
  // A UAT for the Fase with both features: its scenarios come along by themselves.
  const uat = await lead.post(`${P()}/uats`, {
    cycle_id: cycleId,
    name: 'Workshop Fase 2',
    module_ids: [modules.LOKER, modules.GIG],
  })
  expect(uat.status).toBe(201)
  runId = uat.json.id
  await lead.post(`${P()}/runs/${runId}/status`, { status_code: 'ACTIVE' })
  runCases = (await lead.get(`${P()}/runs/${runId}`)).json.run_cases
})

describe('public UAT (everything hidden by default)', () => {
  it('shows nothing until the UAT is public, then only the switched-on fields', async () => {
    const anonymous = new Client(h)
    expect(
      (await anonymous.get('/public/uats')).json.some((c: { id: string }) => c.id === runId),
    ).toBe(false)
    expect((await anonymous.get(`/public/uats/${runId}`)).status).toBe(404)

    const saved = await lead.put(`${W()}/public`, {
      is_public: true,
      public_fields: ['bugs.code', 'nonsense'],
      public_intro: 'Workshop 3-4 Desember',
    })
    expect(saved.status).toBe(200)
    // Problems belong to Bug Reporting, unknown keys are ignored.
    expect(saved.json.public_fields).toEqual([])

    const list = await anonymous.get('/public/uats')
    const card = list.json.find((c: { id: string }) => c.id === runId)
    expect(card).toMatchObject({
      name: 'Workshop Fase 2',
      phase: { cycle_code: 'FASE-2', title: 'UAT Fase 2' },
      intro: 'Workshop 3-4 Desember',
      fields: [],
      bug_reporting_public: false,
    })
    expect(card).not.toHaveProperty('progress')
    expect(card).not.toHaveProperty('period')
    const detail = await anonymous.get(`/public/uats/${runId}`)
    expect(detail.json).not.toHaveProperty('features')
    // Old printed links to the Fase find its public UAT.
    expect((await anonymous.get(`/public/cycles/${cycleId}/uat`)).json).toEqual({ id: runId })
    // Bug Reporting stays closed until it is switched on by itself.
    expect((await anonymous.get(`/public/projects/${project.code}/bugs`)).status).toBe(404)
  })
})

describe('table cards and easy answers', () => {
  let meja1: { client: Client; session: Record<string, unknown> }
  let meja1Code: string
  let bugId: string

  it('creates a table card with a 6-digit code and signs in with it', async () => {
    const table = await newTable('Meja 1', ['LOKER'], ['Bu Sri', 'Pak Budi'])
    expect(table.access_code).toMatch(/^\d{6}$/)
    meja1Code = table.access_code

    const wrong = await new Client(h).post('/workshop/join', {
      code: table.access_code === '999999' ? '999998' : '999999',
    })
    expect(wrong.status).toBe(401)
    expect(wrong.json.error.details[0].message).toBe('WRONG_CODE')

    meja1 = await joined(` ${table.access_code.slice(0, 3)} ${table.access_code.slice(3)} `)
    expect(meja1.session).toMatchObject({
      table: { name: 'Meja 1', member_names: ['Bu Sri', 'Pak Budi'] },
      cycle: { cycle_code: 'FASE-2' },
      run: { status_code: 'ACTIVE' },
    })
    const features = meja1.session.features as {
      module: { module_code: string }
      progress: { total: number }
    }[]
    expect(features).toHaveLength(1)
    expect(features[0]).toMatchObject({ module: { module_code: 'LOKER' }, progress: { total: 3 } })
    const me = await meja1.client.get('/auth/me')
    expect(me.json).toMatchObject({ account_kind: 'TABLE', projects: [] })
  })

  it('keeps a table card inside Mode Mudah', async () => {
    expect((await meja1.client.get('/projects')).status).toBe(404)
    expect((await meja1.client.get(`${P()}/test-cases`)).status).toBe(404)
    expect((await meja1.client.get('/admin/users')).status).toBe(404)
    expect((await meja1.client.get('/profile/sessions')).status).toBe(404)
    expect((await meja1.client.get(`/workshop/features/${modules.GIG}/cases`)).status).toBe(404)
  })

  it('answers Sesuai and Tidak sesuai; a failure becomes a problem with the scenario', async () => {
    const cases = await meja1.client.get(`/workshop/features/${modules.LOKER}/cases`)
    expect(cases.json).toHaveLength(3)
    expect(cases.json[0]).toMatchObject({ steps: ['Buka menu', 'Klik tombol'], latest: null })

    const ok = await meja1.client.post(`/workshop/cases/${runCaseOf('LOKER', 0)}/result`, {
      result_status: 'PASSED',
      tester_name: 'Bu Sri',
      client_id: 'abc12345',
    })
    expect(ok.status).toBe(201)
    expect(ok.json.defect).toBeNull()
    // The same submission again (offline retry) is saved once.
    const again = await meja1.client.post(`/workshop/cases/${runCaseOf('LOKER', 0)}/result`, {
      result_status: 'PASSED',
      tester_name: 'Bu Sri',
      client_id: 'abc12345',
    })
    expect(again.json.execution_id).toBe(ok.json.execution_id)

    const noNote = await meja1.client.post(`/workshop/cases/${runCaseOf('LOKER', 1)}/result`, {
      result_status: 'FAILED',
    })
    expect(noNote.status).toBe(422)

    const failed = await meja1.client.post(`/workshop/cases/${runCaseOf('LOKER', 1)}/result`, {
      result_status: 'FAILED',
      note: 'Tombol simpan tidak merespon setelah formulir diisi',
      tester_name: 'Pak Budi',
    })
    expect(failed.status).toBe(201)
    expect(failed.json.defect).toMatchObject({ created: true })
    bugId = failed.json.defect.id

    const after = await meja1.client.get(`/workshop/features/${modules.LOKER}/cases`)
    expect(after.json[0].latest).toMatchObject({
      status: 'PASSED',
      tester_name: 'Bu Sri',
      mine: true,
    })
    expect(after.json[1].bugs).toHaveLength(1)

    const bug = (await lead.get(`${P()}/defects/${bugId}`)).json
    expect(bug).toMatchObject({
      cycle: { id: cycleId },
      module: { module_code: 'LOKER' },
      actual_behavior: 'Tombol simpan tidak merespon setelah formulir diisi',
      legacy_reporter_name: 'Pak Budi',
    })
    expect(bug.title).toContain('Isi formulir')
  })

  it('finds a similar problem and records "+1" instead of a duplicate', async () => {
    const meja2Card = await newTable('Meja 2', ['LOKER'])
    const meja2 = await joined(meja2Card.access_code)
    const search = await meja2.client.get(
      `/workshop/bugs?q=${encodeURIComponent('tombol simpan tidak merespon')}&run_case=${runCaseOf('LOKER', 2)}`,
    )
    expect(search.json[0]).toMatchObject({ id: bugId })
    expect(search.json[0].score).toBeGreaterThan(0.3)

    const same = await meja2.client.post(`/workshop/cases/${runCaseOf('LOKER', 2)}/result`, {
      result_status: 'FAILED',
      same_as_defect_id: bugId,
      tester_name: 'Bu Ani',
    })
    expect(same.status).toBe(201)
    expect(same.json.defect).toMatchObject({ id: bugId, created: false })
    const list = await meja2.client.get('/workshop/bugs')
    expect(list.json.find((b: { id: string }) => b.id === bugId)).toMatchObject({
      confirmations: 1,
      confirmed_by_me: true,
      table_name: 'Meja 1',
      tester_name: 'Pak Budi',
    })

    const blocked = await meja2.client.post(`/workshop/cases/${runCaseOf('LOKER', 0)}/result`, {
      result_status: 'BLOCKED',
    })
    expect(blocked.status).toBe(201)

    const names = await meja2.client.put('/workshop/members', {
      member_names: ['Bu Ani', 'Bu Ani', 'Pak Joko'],
    })
    expect(names.json.table.member_names).toEqual(['Bu Ani', 'Pak Joko'])
  })

  it('shows the live board and lets the facilitator review new problems', async () => {
    const board = await lead.get(`${W()}/board`)
    expect(board.status).toBe(200)
    expect(board.json.tables.map((t: { name: string }) => t.name)).toEqual(['Meja 1', 'Meja 2'])
    expect(board.json.totals).toMatchObject({ total: 6, tried: 3 })
    expect(board.json.bugs).toMatchObject({ total: 1, to_review: 1, confirmations: 1 })
    expect(board.json.recent[0]).toHaveProperty('table_name')

    const inbox = await lead.get(`${W()}/inbox`)
    expect(inbox.json).toHaveLength(1)
    expect(inbox.json[0]).toMatchObject({
      id: bugId,
      scenario: { title: expect.stringContaining('Isi formulir') },
    })

    const reviewed = await lead.post(`${W()}/inbox/${bugId}`, {
      severity_code: 'HIGH',
      reviewed: true,
    })
    expect(reviewed.status).toBe(200)
    expect((await lead.get(`${W()}/inbox`)).json).toHaveLength(0)
    expect((await lead.get(`${P()}/defects/${bugId}`)).json.severity_code).toBe('HIGH')
  })

  it('closes a duplicate report and counts it on the original', async () => {
    const meja3Card = await newTable('Meja 3', ['GIG'])
    const meja3 = await joined(meja3Card.access_code)
    const dup = await meja3.client.post('/workshop/bugs', {
      module_id: modules.GIG,
      note: 'Tombol simpan tidak merespon di halaman gig',
      tester_name: 'Pak Dedi',
    })
    expect(dup.status).toBe(201)
    const marked = await lead.post(`${W()}/inbox/${dup.json.id}`, { duplicate_of_id: bugId })
    expect(marked.json).toMatchObject({ status_code: 'WONT_FIX', duplicate_of: { id: bugId } })
    const list = await meja3.client.get('/workshop/bugs')
    expect(list.json.find((b: { id: string }) => b.id === bugId).confirmations).toBe(2)
    expect(list.json.some((b: { id: string }) => b.id === dup.json.id)).toBe(false)
  })

  it('publishes exactly the chosen fields', async () => {
    await lead.put(`${W()}/public`, {
      is_public: true,
      public_fields: ['features.list', 'features.progress'],
      public_intro: null,
    })
    const settings = await lead.put(`${P()}/bug-reporting`, {
      is_public: true,
      public_fields: ['bugs.list', 'bugs.code', 'bugs.reporter', 'features.list'],
      public_intro: null,
      accept_reports: false,
    })
    // Only problem fields belong to Bug Reporting.
    expect(settings.json.public_fields).toEqual(['bugs.list', 'bugs.code', 'bugs.reporter'])
    const anonymous = new Client(h)
    const detail = (await anonymous.get(`/public/uats/${runId}`)).json
    expect(detail.features.map((f: { module_code: string }) => f.module_code).sort()).toEqual([
      'GIG',
      'LOKER',
    ])
    expect(detail.features[0]).toHaveProperty('progress')
    expect(detail.features[0]).not.toHaveProperty('tables')
    expect(detail.bug_reporting_public).toBe(true)
    // The front page reads the problem totals from the public Bug Reporting.
    const reporting = (await anonymous.get('/public/bug-reporting')).json.find(
      (r: { project: { code: string } }) => r.project.code === project.code,
    )
    expect(reporting).toMatchObject({ bug_count: 1, bug_open: 1, accept_reports: false })
    const bugs = (await anonymous.get(`/public/projects/${project.code}/bugs`)).json
    expect(bugs.total).toBe(1)
    expect(bugs.data[0]).toMatchObject({ reporter: 'Meja 1 · Pak Budi' })
    expect(bugs.data[0].bug_code).toMatch(/^BUG-/)
    expect(bugs.data[0]).not.toHaveProperty('description')
    expect(bugs.data[0]).not.toHaveProperty('severity_code')
    expect(bugs.data[0]).not.toHaveProperty('files')

    await lead.put(`${W()}/features`, { module_id: modules.GIG, state_code: 'HIDDEN' })
    const hidden = (await anonymous.get(`/public/uats/${runId}`)).json
    expect(hidden.features.map((f: { module_code: string }) => f.module_code)).toEqual(['LOKER'])
  })

  it('blocks a card, changes a code and refuses to delete a table with answers', async () => {
    const tables = (await lead.get(`${W()}/groups`)).json as {
      id: string
      name: string
      devices: number
    }[]
    const t1 = tables.find((t) => t.name === 'Meja 1')!
    expect(t1.devices).toBeGreaterThan(0)
    await lead.patch(`${W()}/groups/${t1.id}`, { revoked: true })
    expect((await meja1.client.get('/workshop/session')).status).toBe(401)
    const refused = await new Client(h).post('/workshop/join', { code: meja1Code })
    expect(refused.json.error.details[0].message).toBe('REVOKED')

    const t2 = tables.find((t) => t.name === 'Meja 2')!
    const oldCode = (tables as unknown as { name: string; access_code: string }[]).find(
      (t) => t.name === 'Meja 2',
    )!.access_code
    const renewed = await lead.patch(`${W()}/groups/${t2.id}`, { regenerate_code: true })
    expect(renewed.json.access_code).not.toBe(oldCode)
    expect((await new Client(h).post('/workshop/join', { code: oldCode })).status).toBe(401)

    expect((await lead.delete(`${W()}/groups/${t1.id}`)).status).toBe(409)
    const empty = await newTable('Meja Cadangan', ['GIG'])
    expect((await lead.delete(`${W()}/groups/${empty.id}`)).status).toBe(204)
    expect(
      (
        await lead.post(`${W()}/groups`, {
          name: 'Meja 2',
          module_ids: [],
          valid_until: soon(),
        })
      ).status,
    ).toBe(409)
  })

  it('refuses answers while the run is not active', async () => {
    const meja4 = await joined((await newTable('Meja 4', ['GIG'])).access_code)
    await lead.post(`${P()}/runs/${runId}/status`, { status_code: 'COMPLETED' })
    const res = await meja4.client.post(`/workshop/cases/${runCaseOf('GIG', 0)}/result`, {
      result_status: 'PASSED',
    })
    expect(res.status).toBe(409)
    expect(res.json.error.details[0].message).toBe('RUN_NOT_ACTIVE')
  })
})

describe('people at a table with their own User account (ADR 0018)', () => {
  it('turns an e-mail into a Penguji account, activates it at the table and opens "Tugas saya"', async () => {
    const email = `budi.${Date.now()}@test.invalid`
    const created = await lead.post(`${W()}/groups`, {
      name: 'Meja Akun',
      table_number: 7,
      module_ids: [modules.LOKER],
      members: [
        { name: 'Pak Budi', email },
        { name: 'Bu Sari', email: '' },
      ],
      valid_from: new Date(Date.now() - hour).toISOString(),
      valid_until: soon(),
    })
    expect(created.status).toBe(201)
    expect(created.json.member_names).toEqual(['Pak Budi', 'Bu Sari'])
    expect(created.json.members).toMatchObject([
      { name: 'Pak Budi', email, account: 'NOT_ACTIVATED' },
      { name: 'Bu Sari', email: null, account: 'NONE', user_id: null },
    ])
    const budiId = created.json.members[0].user_id as string
    // The e-mail made him a Penguji of the project, not activated yet.
    const members = (await lead.get(`${P()}/members`)).json as {
      user: { id: string; has_password: boolean }
      role_code: string
    }[]
    expect(members.find((m) => m.user.id === budiId)).toMatchObject({
      role_code: 'TESTER',
      user: { has_password: false },
    })

    // At the table: the table never sees the full e-mail.
    const table = await joined(created.json.access_code)
    const listed = table.session.table.members as {
      id: string
      name: string
      account: string
      email_hint: string | null
    }[]
    expect(listed[0]).toMatchObject({ name: 'Pak Budi', account: 'NOT_ACTIVATED' })
    expect(listed[0]!.email_hint).toMatch(/^b\*\*\*@test\.invalid$/)
    expect(JSON.stringify(table.session)).not.toContain(email)

    // Names typed at the table never remove or rename someone with an account.
    const names = await table.client.put('/workshop/members', { member_names: ['Bu Tini'] })
    expect(names.json.table.member_names).toEqual(['Pak Budi', 'Bu Tini'])

    // "Aktifkan akun saya": once, and only for a listed member without a password.
    const activate = await table.client.post(`/workshop/members/${listed[0]!.id}/activate`, {
      password: 'Kata-Sandi-Budi-9',
    })
    expect(activate.status).toBe(200)
    expect(activate.json.table.members[0].account).toBe('ACTIVE')
    const again = await table.client.post(`/workshop/members/${listed[0]!.id}/activate`, {
      password: 'Kata-Sandi-Lain-9',
    })
    expect(again.status).toBe(409)

    // Budi signs in himself and finds his table under "Tugas saya".
    const budi = new Client(h)
    expect((await budi.post('/auth/login', { email, password: 'Kata-Sandi-Budi-9' })).status).toBe(
      200,
    )
    const tasks = await budi.get('/me/tasks')
    expect(tasks.status).toBe(200)
    expect(tasks.json.tables).toEqual([
      expect.objectContaining({
        table: { id: created.json.id, name: 'Meja Akun', table_number: 7 },
        uat: { id: runId, name: 'Workshop Fase 2' },
        member: expect.objectContaining({ name: 'Pak Budi' }),
        state: 'ACTIVE',
      }),
    ])
    // ... and opens it without the card code: the device becomes the table, his name chosen.
    const opened = await budi.post('/workshop/join-member', { table_id: created.json.id })
    expect(opened.status).toBe(200)
    expect(opened.json.member_name).toBe('Pak Budi')
    expect((await budi.get('/auth/me')).json.account_kind).toBe('TABLE')

    // Someone not listed at that table cannot open it that way.
    const stranger = await createUser(h.pool)
    const strangerClient = new Client(h)
    await strangerClient.login(stranger.email)
    expect(
      (await strangerClient.post('/workshop/join-member', { table_id: created.json.id })).status,
    ).toBe(404)
  })

  it('gives an Admin a one-time activation link for a member who has no password yet', async () => {
    // Members and their tasks are managed by the website role Admin (ADR 0017).
    const siteAdmin = await createUser(h.pool, { siteAdmin: true })
    const admin = new Client(h)
    await admin.login(siteAdmin.email)
    const email = `sari.${Date.now()}@test.invalid`
    const added = await admin.post(`${P()}/members`, {
      email,
      display_name: 'Bu Sari',
      role_code: 'TESTER',
    })
    expect(added.status).toBe(201)
    const userId = added.json.user.id as string
    const link = await admin.post(`${P()}/members/${userId}/activation-link`, {})
    expect(link.status).toBe(201)
    expect(link.json.token).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    const anonymous = new Client(h)
    const check = await anonymous.post('/auth/reset-password/check', { token: link.json.token })
    expect(check.json).toMatchObject({ email, display_name: 'Bu Sari', activation: true })
    const set = await anonymous.post('/auth/reset-password', {
      token: link.json.token,
      new_password: 'Sari-Punya-Akun-7',
    })
    expect(set.status).toBe(204)
    expect(
      (await new Client(h).post('/auth/login', { email, password: 'Sari-Punya-Akun-7' })).status,
    ).toBe(200)
    // An active account gets no activation link (the Super Admin handles forgotten passwords).
    expect((await admin.post(`${P()}/members/${userId}/activation-link`, {})).status).toBe(409)
  })
})

describe('photos from a table', () => {
  it('uploads a screen photo, attaches it to the problem and shows it only where allowed', async () => {
    await lead.post(`${P()}/runs/${runId}/status`, { status_code: 'ACTIVE' })
    const meja = await joined((await newTable('Meja Foto', ['GIG'])).access_code)
    const upload = await meja.client.upload('/workshop/files', [
      { name: 'layar.png', data: await uiPng() },
    ])
    expect(upload.status).toBe(202)
    await h.files.idle()
    const fileId = upload.json.files[0].id as string
    expect((await meja.client.get(`/workshop/files/${fileId}/status`)).json).toMatchObject({
      processing_status: 'READY',
      scan_status: 'CLEAN',
    })
    const failed = await meja.client.post(`/workshop/cases/${runCaseOf('GIG', 1)}/result`, {
      result_status: 'FAILED',
      note: 'Gambar profil tidak muncul',
      evidence: [{ file_id: fileId }],
    })
    expect(failed.status).toBe(201)
    // Flat screenshots may have no smaller thumbnail: the picture itself is served.
    const thumb = await meja.client.raw(`/workshop/files/${fileId}/thumbnail`)
    expect(thumb.status).toBe(200)
    expect(thumb.headers.get('Content-Type')).toMatch(/^image\//)

    const anonymous = new Client(h)
    const publicPath = `/public/projects/${project.code}/files/${fileId}/thumbnail`
    expect((await anonymous.raw(publicPath)).status).toBe(404)
    await lead.put(`${P()}/bug-reporting`, {
      is_public: true,
      public_fields: ['bugs.list', 'bugs.evidence'],
      public_intro: null,
      accept_reports: false,
    })
    expect((await anonymous.raw(publicPath)).status).toBe(200)
    const bugs = (await anonymous.get(`/public/projects/${project.code}/bugs`)).json
    expect(bugs.data.find((b: { files?: unknown[] }) => b.files?.length)).toBeTruthy()
  })
})

describe('preview of the public page (before publishing)', () => {
  it('lets a lead see the public page of a closed UAT, with unsaved field choices', async () => {
    await lead.put(`${W()}/public`, { is_public: false, public_fields: [], public_intro: null })
    await lead.put(`${P()}/bug-reporting`, {
      is_public: false,
      public_fields: ['bugs.list'],
      public_intro: null,
      accept_reports: false,
    })
    const anonymous = new Client(h)
    expect((await anonymous.get(`/public/uats/${runId}`)).status).toBe(404)
    expect((await anonymous.get(`/public/uats/${runId}?preview=1`)).status).toBe(404)

    const preview = await lead.get(
      `/public/uats/${runId}?preview=1&fields=features.list,features.progress`,
    )
    expect(preview.status).toBe(200)
    expect(preview.json.fields).toEqual(['features.list', 'features.progress'])
    expect(preview.json.features.length).toBeGreaterThan(0)
    expect(preview.json.features[0]).toHaveProperty('progress')
    expect((await anonymous.get(`/public/projects/${project.code}/bugs`)).status).toBe(404)
    const bugs = await lead.get(`/public/projects/${project.code}/bugs?preview=1`)
    expect(bugs.status).toBe(200)
    expect(bugs.json.data[0]).not.toHaveProperty('bug_code')

    // Someone who cannot manage runs gets nothing, not even in preview.
    const user = await createUser(h.pool)
    await addMember(h.pool, project.id, user.id, 'TESTER')
    const tester = new Client(h)
    await tester.login(user.email)
    expect((await tester.get(`/public/uats/${runId}?preview=1`)).status).toBe(404)
    expect((await tester.get(`/public/projects/${project.code}/bugs?preview=1`)).status).toBe(404)
  })
})
