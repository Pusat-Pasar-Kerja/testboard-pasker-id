import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { uiPng } from './support/fixtures.js'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

/** Mode Workshop (ADR 0016): public Fase, table cards, easy answers, "+1", review. */
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
const W = () => `${P()}/cycles/${cycleId}`
const hour = 3_600_000
const soon = () => new Date(Date.now() + 24 * hour).toISOString()

async function newTable(name: string, moduleCodes: string[], members: string[] = []) {
  const res = await lead.post(`${W()}/tables`, {
    name,
    run_id: runId,
    module_ids: moduleCodes.map((code) => modules[code]),
    member_names: members,
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
  for (const [code, name] of [
    ['LOKER', 'Lapor Loker'],
    ['GIG', 'Gig Workers'],
  ] as const) {
    modules[code] = (await lead.post(`${P()}/modules`, { module_code: code, name })).json.id
    for (const title of ['Buka halaman', 'Isi formulir', 'Simpan data']) {
      const res = await lead.post(`${P()}/test-cases`, {
        module_code: code,
        title: `${name}: ${title}`,
        test_steps_text: '1. Buka menu\n2. Klik tombol',
        expected_result: 'Data tersimpan',
        case_status: 'READY',
      })
      caseIdsByModule[code]!.push(res.json.id)
    }
  }
  cycleId = (
    await lead.post(`${P()}/cycles`, {
      cycle_code: 'FASE-2',
      title: 'UAT Fase 2',
      status_code: 'ACTIVE',
    })
  ).json.id
  const run = await lead.post(`${P()}/runs`, { name: 'Workshop Fase 2', cycle_id: cycleId })
  runId = run.json.id
  await lead.post(`${P()}/runs/${runId}/cases`, {
    test_case_ids: [...caseIdsByModule.LOKER!, ...caseIdsByModule.GIG!],
  })
  await lead.post(`${P()}/runs/${runId}/status`, { status_code: 'ACTIVE' })
  runCases = (await lead.get(`${P()}/runs/${runId}`)).json.run_cases
})

describe('public Fase (everything hidden by default)', () => {
  it('shows nothing until the Fase is public, then only the switched-on fields', async () => {
    const anonymous = new Client(h)
    expect(
      (await anonymous.get('/public/cycles')).json.some((c: { id: string }) => c.id === cycleId),
    ).toBe(false)
    expect((await anonymous.get(`/public/cycles/${cycleId}`)).status).toBe(404)

    const saved = await lead.put(`${W()}/public`, {
      is_public: true,
      public_fields: ['bugs.code', 'nonsense'],
      public_intro: 'Workshop 3-4 Desember',
    })
    expect(saved.status).toBe(200)
    // A field without its base field is dropped; unknown keys are ignored.
    expect(saved.json.public_fields).toEqual([])

    const list = await anonymous.get('/public/cycles')
    const card = list.json.find((c: { id: string }) => c.id === cycleId)
    expect(card).toMatchObject({ title: 'UAT Fase 2', intro: 'Workshop 3-4 Desember', fields: [] })
    expect(card).not.toHaveProperty('progress')
    expect(card).not.toHaveProperty('period')
    const detail = await anonymous.get(`/public/cycles/${cycleId}`)
    expect(detail.json).not.toHaveProperty('features')
    expect((await anonymous.get(`/public/cycles/${cycleId}/bugs`)).status).toBe(404)
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
    const board = await lead.get(`${W()}/workshop`)
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
      public_fields: [
        'features.list',
        'features.progress',
        'bugs.list',
        'bugs.code',
        'bugs.reporter',
      ],
      public_intro: null,
    })
    const anonymous = new Client(h)
    const detail = (await anonymous.get(`/public/cycles/${cycleId}`)).json
    expect(detail.features.map((f: { module_code: string }) => f.module_code).sort()).toEqual([
      'GIG',
      'LOKER',
    ])
    expect(detail.features[0]).toHaveProperty('progress')
    expect(detail.features[0]).not.toHaveProperty('tables')
    expect(detail.bug_count).toBe(1)
    const bugs = (await anonymous.get(`/public/cycles/${cycleId}/bugs`)).json
    expect(bugs.total).toBe(1)
    expect(bugs.data[0]).toMatchObject({ reporter: 'Meja 1 · Pak Budi' })
    expect(bugs.data[0].bug_code).toMatch(/^BUG-/)
    expect(bugs.data[0]).not.toHaveProperty('description')
    expect(bugs.data[0]).not.toHaveProperty('severity_code')
    expect(bugs.data[0]).not.toHaveProperty('files')

    await lead.put(`${W()}/features`, { module_id: modules.GIG, state_code: 'HIDDEN' })
    const hidden = (await anonymous.get(`/public/cycles/${cycleId}`)).json
    expect(hidden.features.map((f: { module_code: string }) => f.module_code)).toEqual(['LOKER'])
  })

  it('blocks a card, changes a code and refuses to delete a table with answers', async () => {
    const tables = (await lead.get(`${W()}/tables`)).json as {
      id: string
      name: string
      devices: number
    }[]
    const t1 = tables.find((t) => t.name === 'Meja 1')!
    expect(t1.devices).toBeGreaterThan(0)
    await lead.patch(`${W()}/tables/${t1.id}`, { revoked: true })
    expect((await meja1.client.get('/workshop/session')).status).toBe(401)
    const refused = await new Client(h).post('/workshop/join', { code: meja1Code })
    expect(refused.json.error.details[0].message).toBe('REVOKED')

    const t2 = tables.find((t) => t.name === 'Meja 2')!
    const oldCode = (tables as unknown as { name: string; access_code: string }[]).find(
      (t) => t.name === 'Meja 2',
    )!.access_code
    const renewed = await lead.patch(`${W()}/tables/${t2.id}`, { regenerate_code: true })
    expect(renewed.json.access_code).not.toBe(oldCode)
    expect((await new Client(h).post('/workshop/join', { code: oldCode })).status).toBe(401)

    expect((await lead.delete(`${W()}/tables/${t1.id}`)).status).toBe(409)
    const empty = await newTable('Meja Cadangan', ['GIG'])
    expect((await lead.delete(`${W()}/tables/${empty.id}`)).status).toBe(204)
    expect(
      (
        await lead.post(`${W()}/tables`, {
          name: 'Meja 2',
          run_id: runId,
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
    const publicPath = `/public/cycles/${cycleId}/files/${fileId}/thumbnail`
    expect((await anonymous.raw(publicPath)).status).toBe(404)
    await lead.put(`${W()}/public`, {
      is_public: true,
      public_fields: ['bugs.list', 'bugs.evidence'],
      public_intro: null,
    })
    expect((await anonymous.raw(publicPath)).status).toBe(200)
    const bugs = (await anonymous.get(`/public/cycles/${cycleId}/bugs`)).json
    expect(bugs.data.find((b: { files?: unknown[] }) => b.files?.length)).toBeTruthy()
  })
})

describe('preview of the public page (before publishing)', () => {
  it('lets a lead see the public page of a closed Fase, with unsaved field choices', async () => {
    await lead.put(`${W()}/public`, { is_public: false, public_fields: [], public_intro: null })
    const anonymous = new Client(h)
    expect((await anonymous.get(`/public/cycles/${cycleId}`)).status).toBe(404)
    expect((await anonymous.get(`/public/cycles/${cycleId}?preview=1`)).status).toBe(404)

    const preview = await lead.get(
      `/public/cycles/${cycleId}?preview=1&fields=features.list,features.progress,bugs.list`,
    )
    expect(preview.status).toBe(200)
    expect(preview.json.fields).toEqual(['features.list', 'features.progress', 'bugs.list'])
    expect(preview.json.features.length).toBeGreaterThan(0)
    expect(preview.json.features[0]).toHaveProperty('progress')
    const bugs = await lead.get(`/public/cycles/${cycleId}/bugs?preview=1&fields=bugs.list`)
    expect(bugs.status).toBe(200)
    expect(bugs.json.data[0]).not.toHaveProperty('bug_code')

    // Someone who cannot manage runs gets nothing, not even in preview.
    const user = await createUser(h.pool)
    await addMember(h.pool, project.id, user.id, 'TESTER')
    const tester = new Client(h)
    await tester.login(user.email)
    expect((await tester.get(`/public/cycles/${cycleId}?preview=1`)).status).toBe(404)
  })
})
