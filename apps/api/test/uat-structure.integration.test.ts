import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

/**
 * The project laid out like Google Drive (ADR 0019): Fase > Fitur > Skenario, UATs built from
 * a Fase with their own people and groups, and Bug Reporting with its own public switch and
 * public report form.
 */
const h = createHarness()
afterAll(() => h.pool.end())

let project: { id: string; code: string }
let lead: Client
let faseA: string
let faseB: string
let draftA: string
let uat1: string
let uat2: string
let sri: { id: string; email: string }
let sriClient: Client
const modules: Record<string, string> = {}
const P = () => `/projects/${project.code}`
const soon = () => new Date(Date.now() + 24 * 3_600_000).toISOString()

async function scenario(
  moduleCode: string,
  title: string,
  cycleId: string | null,
  status: 'READY' | 'DRAFT' = 'READY',
) {
  const res = await lead.post(`${P()}/test-cases`, {
    module_code: moduleCode,
    cycle_id: cycleId,
    title,
    expected_result: 'Berhasil',
    case_status: status,
  })
  expect(res.status).toBe(201)
  return res.json.id as string
}

const uatOf = async (id: string) => (await lead.get(`${P()}/uats/${id}`)).json

beforeAll(async () => {
  project = await createProject(h.pool)
  const user = await createUser(h.pool, { name: 'Pengelola' })
  await addMember(h.pool, project.id, user.id, 'QA_LEAD')
  lead = new Client(h)
  await lead.login(user.email)
  faseA = (
    await lead.post(`${P()}/cycles`, {
      cycle_code: 'FASE-1',
      title: 'Fase 1',
      status_code: 'ACTIVE',
    })
  ).json.id
  faseB = (
    await lead.post(`${P()}/cycles`, {
      cycle_code: 'FASE-2',
      title: 'Fase 2',
      status_code: 'PLANNED',
    })
  ).json.id
})

describe('Fase > Fitur > Skenario', () => {
  it('shows Fase folders with feature folders, and what is not in a Fase yet', async () => {
    // An empty feature folder, new to the project.
    const folder = await lead.post(`${P()}/phases/${faseA}/features`, {
      module_code: 'loker',
      name: 'Lapor Loker',
    })
    expect(folder.status).toBe(201)
    const loker = folder.json.phases
      .find((p: { id: string }) => p.id === faseA)
      .features.find((f: { module: { module_code: string } }) => f.module.module_code === 'LOKER')
    expect(loker).toMatchObject({ scenarios: 0, ready: 0 })
    modules.LOKER = loker.module.id
    // A new feature needs a name; an unknown Fase is not found.
    expect(
      (await lead.post(`${P()}/phases/${faseA}/features`, { module_code: 'GIG' })).status,
    ).toBe(422)
    const gig = await lead.post(`${P()}/phases/${faseA}/features`, {
      module_code: 'GIG',
      name: 'Gig Workers',
    })
    modules.GIG = gig.json.phases
      .find((p: { id: string }) => p.id === faseA)
      .features.find(
        (f: { module: { module_code: string } }) => f.module.module_code === 'GIG',
      ).module.id
    expect((await lead.post(`${P()}/phases/999999/features`, { module_code: 'GIG' })).status).toBe(
      404,
    )

    await scenario('LOKER', 'Buka halaman loker', faseA)
    await scenario('LOKER', 'Isi formulir loker', faseA)
    draftA = await scenario('LOKER', 'Draf yang belum siap', faseA, 'DRAFT')
    await scenario('GIG', 'Daftar pekerjaan gig', faseA)
    await scenario('GIG', 'Belum masuk fase', null)

    const tree = (await lead.get(`${P()}/phases`)).json
    const a = tree.phases.find((p: { id: string }) => p.id === faseA)
    expect(a).toMatchObject({ cycle_code: 'FASE-1', scenarios: 4, uats: 0 })
    expect(
      a.features.map((f: { module: { module_code: string }; scenarios: number; ready: number }) => [
        f.module.module_code,
        f.scenarios,
        f.ready,
      ]),
    ).toEqual([
      ['GIG', 1, 1],
      ['LOKER', 3, 2],
    ])
    expect(tree.phases.find((p: { id: string }) => p.id === faseB)).toMatchObject({
      scenarios: 0,
      features: [],
    })
    expect(tree.unassigned).toMatchObject({ id: null, scenarios: 1 })
    expect(tree.unassigned.features[0].module.module_code).toBe('GIG')

    // The scenario list filters on a Fase, or on "not in a Fase yet".
    const inA = (await lead.get(`${P()}/test-cases?cycle=${faseA}`)).json
    expect(inA.total).toBe(4)
    expect(inA.data[0].cycle).toMatchObject({ id: faseA, cycle_code: 'FASE-1', title: 'Fase 1' })
    const none = (await lead.get(`${P()}/test-cases?cycle=none`)).json
    expect(none.data.map((c: { title: string }) => c.title)).toEqual(['Belum masuk fase'])
  })

  it('copies scenarios to the next Fase (Ready stays Ready) and moves one out', async () => {
    const ids = (await lead.get(`${P()}/test-cases?cycle=${faseA}`)).json.data.map(
      (c: { id: string }) => c.id,
    )
    const copied = await lead.post(`${P()}/test-cases/bulk`, {
      action: 'copy_to_phase',
      case_ids: ids,
      cycle_id: faseB,
    })
    expect(copied.json).toMatchObject({ updated: 4, skipped: [] })
    const inB = (await lead.get(`${P()}/test-cases?cycle=${faseB}`)).json
    expect(inB.total).toBe(4)
    expect(inB.data.filter((c: { case_status: string }) => c.case_status === 'READY')).toHaveLength(
      3,
    )
    // The originals stay in their Fase; the copies get their own codes.
    expect((await lead.get(`${P()}/test-cases?cycle=${faseA}`)).json.total).toBe(4)
    const codes = new Set(
      [...inB.data, ...(await lead.get(`${P()}/test-cases?cycle=${faseA}`)).json.data].map(
        (c: { case_code: string }) => c.case_code,
      ),
    )
    expect(codes.size).toBe(8)

    const draft = inB.data.find((c: { case_status: string }) => c.case_status === 'DRAFT')
    const moved = await lead.post(`${P()}/test-cases/bulk`, {
      action: 'move_to_phase',
      case_ids: [draft.id],
      cycle_id: null,
    })
    expect(moved.json.updated).toBe(1)
    expect((await lead.get(`${P()}/test-cases?cycle=none`)).json.total).toBe(2)
    expect(
      (
        await lead.post(`${P()}/test-cases/bulk`, {
          action: 'copy_to_phase',
          case_ids: ids,
          cycle_id: '999999',
        })
      ).status,
    ).toBe(422)
  })
})

describe('UAT', () => {
  it('takes the Ready scenarios of its features and keeps up with the Fase', async () => {
    const created = await lead.post(`${P()}/uats`, {
      cycle_id: faseA,
      name: 'UAT 1',
      module_ids: [modules.LOKER],
    })
    expect(created.status).toBe(201)
    expect(created.json).toMatchObject({
      name: 'UAT 1',
      phase: { id: faseA, cycle_code: 'FASE-1' },
      status_code: 'PLANNED',
      features: 1,
      groups: 0,
      participants: 0,
      progress: { total: 2 },
    })
    uat1 = created.json.id

    // A new Ready scenario of the feature joins by itself; a draft once it is Ready.
    await scenario('LOKER', 'Hapus lowongan', faseA)
    expect((await uatOf(uat1)).progress.total).toBe(3)
    await scenario('GIG', 'Fitur lain tidak ikut', faseA)
    expect((await uatOf(uat1)).progress.total).toBe(3)
    await lead.post(`${P()}/test-cases/bulk`, {
      action: 'set_status',
      case_ids: [draftA],
      case_status: 'READY',
    })
    expect((await uatOf(uat1)).progress.total).toBe(4)

    // More than one UAT per Fase.
    const second = await lead.post(`${P()}/uats`, {
      cycle_id: faseA,
      name: 'UAT 2',
      module_ids: [modules.LOKER, modules.GIG],
    })
    expect(second.json).toMatchObject({ features: 2, progress: { total: 6 } })
    uat2 = second.json.id
    expect(
      (await lead.get(`${P()}/phases`)).json.phases.find((p: { id: string }) => p.id === faseA)
        .uats,
    ).toBe(2)
    expect(
      (await lead.get(`${P()}/uats`)).json.map((u: { name: string }) => u.name).sort(),
    ).toEqual(['UAT 1', 'UAT 2'])

    expect(
      (
        await lead.post(`${P()}/uats`, {
          cycle_id: '999999',
          name: 'Salah',
          module_ids: [modules.LOKER],
        })
      ).status,
    ).toBe(422)
    expect(
      (await lead.post(`${P()}/uats`, { cycle_id: faseA, name: 'Kosong', module_ids: [] })).status,
    ).toBe(422)
  })

  it('changes its features: untried scenarios leave, tried ones stay', async () => {
    await lead.post(`${P()}/runs/${uat2}/status`, { status_code: 'ACTIVE' })
    const runCases = (await lead.get(`${P()}/runs/${uat2}`)).json.run_cases as {
      run_case_id: string
      module_code: string
    }[]
    const tried = runCases.find((rc) => rc.module_code === 'GIG')!
    const saved = await lead.post(`${P()}/run-cases/${tried.run_case_id}/executions`, {
      result_status: 'PASSED',
    })
    expect(saved.status).toBe(201)

    const changed = await lead.patch(`${P()}/uats/${uat2}`, { module_ids: [modules.LOKER] })
    expect(changed.status).toBe(200)
    expect(changed.json).toMatchObject({ features: 1, progress: { total: 5, passed: 1 } })
    expect(changed.json.feature_list.map((f: { module: { id: string } }) => f.module.id)).toEqual([
      modules.LOKER,
    ])
  })
})

describe('people of a UAT', () => {
  it('adds people by name or account; each Pengguna sees only their own UATs', async () => {
    const sriUser = await createUser(h.pool, { name: 'Bu Sri' })
    sri = { id: sriUser.id, email: sriUser.email }
    const budi = await createUser(h.pool, { name: 'Pak Budi' })
    await addMember(h.pool, project.id, budi.id, 'TESTER')

    const added = await lead.post(`${P()}/uats/${uat1}/participants`, {
      people: [{ name: 'Bu Sri', email: sri.email }, { name: 'Pak Anton' }],
    })
    expect(added.status).toBe(201)
    expect(added.json.map((p: { name: string }) => p.name).sort()).toEqual(['Bu Sri', 'Pak Anton'])
    expect(added.json.find((p: { name: string }) => p.name === 'Bu Sri')).toMatchObject({
      user_id: sri.id,
      email: sri.email,
      group: null,
    })
    // Listing the same people again never adds them twice.
    const again = await lead.post(`${P()}/uats/${uat1}/participants`, {
      people: [{ name: 'pak anton' }, { name: 'Bu Sri', email: sri.email }],
    })
    expect(again.json).toHaveLength(2)
    const dup = await lead.post(`${P()}/uats/${uat1}/participants`, {
      people: [{ name: 'Bu Ani' }, { name: 'bu ani' }],
    })
    expect(dup.status).toBe(422)
    expect((await uatOf(uat1)).participants).toBe(2)

    sriClient = new Client(h)
    await sriClient.login(sri.email)
    const mine = (await sriClient.get(`${P()}/uats`)).json
    expect(mine.map((u: { id: string }) => u.id)).toEqual([uat1])
    expect(mine[0].my_group).toBeNull()
    expect((await sriClient.get(`${P()}/uats/${uat1}`)).status).toBe(200)
    expect((await sriClient.get(`${P()}/uats/${uat2}`)).status).toBe(404)
    expect((await sriClient.get(`${P()}/runs/${uat2}`)).status).toBe(404)
    // The project overview counts only her own UAT; the report page is for managers.
    const summary = (await sriClient.get(`${P()}/reports/summary`)).json
    expect(summary.runs.map((r: { id: string }) => r.id)).toEqual([uat1])
    expect((await sriClient.get(`${P()}/reports/overview`)).status).toBe(403)
    // Taking part is not managing.
    expect((await sriClient.get(`${P()}/uats/${uat1}/participants`)).status).toBe(403)
    expect(
      (
        await sriClient.post(`${P()}/uats/${uat1}/participants`, {
          people: [{ name: 'Teman Sri' }],
        })
      ).status,
    ).toBe(403)

    const budiClient = new Client(h)
    await budiClient.login(budi.email)
    expect((await budiClient.get(`${P()}/uats`)).json).toEqual([])
    expect((await budiClient.get(`${P()}/uats/${uat1}`)).status).toBe(404)
  })

  it('puts people in a numbered group and back out', async () => {
    const group = await lead.post(`${P()}/uats/${uat1}/groups`, {
      name: 'Kelompok A',
      table_number: 3,
      module_ids: [modules.LOKER],
      members: [{ name: 'Pak Anton' }],
      valid_until: soon(),
    })
    expect(group.status).toBe(201)
    const people = (await lead.get(`${P()}/uats/${uat1}/participants`)).json as {
      id: string
      name: string
      group: { id: string; name: string; table_number: number | null } | null
    }[]
    const anton = people.find((p) => p.name === 'Pak Anton')!
    expect(anton.group).toEqual({ id: group.json.id, name: 'Kelompok A', table_number: 3 })

    const sriRow = people.find((p) => p.name === 'Bu Sri')!
    const moved = await lead.patch(`${P()}/uats/${uat1}/participants/${sriRow.id}`, {
      group_id: group.json.id,
    })
    expect(moved.json.group).toMatchObject({ name: 'Kelompok A', table_number: 3 })
    expect((await sriClient.get(`${P()}/uats`)).json[0].my_group).toMatchObject({
      name: 'Kelompok A',
      table_number: 3,
      modules: [{ id: modules.LOKER, module_code: 'LOKER' }],
    })
    // Listed again without a group: she keeps her group.
    await lead.post(`${P()}/uats/${uat1}/participants`, {
      people: [{ name: 'Bu Sri', email: sri.email }],
    })
    const after = (await lead.get(`${P()}/uats/${uat1}/participants`)).json as typeof people
    expect(after.find((p) => p.name === 'Bu Sri')!.group?.id).toBe(group.json.id)

    const out = await lead.patch(`${P()}/uats/${uat1}/participants/${anton.id}`, {
      group_id: null,
    })
    expect(out.json.group).toBeNull()
    expect((await lead.delete(`${P()}/uats/${uat1}/participants/${anton.id}`)).status).toBe(204)
    expect(
      (await lead.get(`${P()}/uats/${uat1}/participants`)).json.map(
        (p: { name: string }) => p.name,
      ),
    ).toEqual(['Bu Sri'])
    // A group or person of another UAT is refused.
    expect(
      (
        await lead.patch(`${P()}/uats/${uat2}/participants/${sriRow.id}`, {
          group_id: group.json.id,
        })
      ).status,
    ).toBe(404)
    expect(
      (
        await lead.post(`${P()}/uats/${uat2}/participants`, {
          people: [{ name: 'Orang Baru', group_id: group.json.id }],
        })
      ).status,
    ).toBe(422)
  })
})

describe('Bug Reporting (public switch and public report form)', () => {
  const report = {
    title: 'Tombol daftar tidak bisa diklik',
    description: 'Di halaman daftar akun, tombolnya diam saja.',
    feature: 'Lapor Loker',
    reporter_name: 'Warga',
    contact: 'warga@contoh.invalid',
  }
  const send = (client: Client, body: unknown, ip = '198.51.100.7') =>
    client.request('POST', `/public/projects/${project.code}/reports`, body, {
      'X-Forwarded-For': ip,
    })

  it('is closed by default, and only Admins change it', async () => {
    expect((await lead.get(`${P()}/bug-reporting`)).json).toEqual({
      is_public: false,
      public_fields: [],
      public_intro: null,
      accept_reports: false,
    })
    const anonymous = new Client(h)
    expect((await anonymous.get(`/public/projects/${project.code}/bug-reporting`)).status).toBe(404)
    expect((await send(anonymous, report)).status).toBe(404)
    expect((await sriClient.get(`${P()}/bug-reporting`)).status).toBe(403)
    expect(
      (
        await sriClient.put(`${P()}/bug-reporting`, {
          is_public: true,
          public_fields: ['bugs.list'],
          public_intro: null,
          accept_reports: true,
        })
      ).status,
    ).toBe(403)
  })

  it('takes reports from the public; they show only after an Admin reviewed them', async () => {
    const saved = await lead.put(`${P()}/bug-reporting`, {
      is_public: true,
      public_fields: ['bugs.list', 'bugs.reporter', 'features.progress'],
      public_intro: 'Laporkan kendala di sini',
      accept_reports: true,
    })
    expect(saved.json.public_fields).toEqual(['bugs.list', 'bugs.reporter'])
    const anonymous = new Client(h)
    expect(
      (await anonymous.get(`/public/projects/${project.code}/bug-reporting`)).json,
    ).toMatchObject({
      project: { code: project.code },
      intro: 'Laporkan kendala di sini',
      accept_reports: true,
      bug_count: 0,
    })
    expect(
      (await anonymous.get('/public/bug-reporting')).json.some(
        (r: { project: { code: string } }) => r.project.code === project.code,
      ),
    ).toBe(true)

    expect((await send(anonymous, { ...report, title: 'abc' })).status).toBe(422)
    expect((await send(anonymous, report)).status).toBe(201)
    expect((await anonymous.get(`/public/projects/${project.code}/bugs`)).json.total).toBe(0)
    const waiting = (await lead.get(`${P()}/bug-reporting/reports`)).json
    expect(waiting).toHaveLength(1)
    expect(waiting[0]).toMatchObject({
      title: report.title,
      reporter: 'Warga',
      contact: 'warga@contoh.invalid',
    })
    // A robot filling the hidden field gets a friendly answer, and nothing is saved.
    expect((await send(anonymous, { ...report, website: 'http://spam.invalid' })).status).toBe(201)
    expect((await lead.get(`${P()}/bug-reporting/reports`)).json).toHaveLength(1)

    expect(
      (await lead.post(`${P()}/bug-reporting/reports/${waiting[0].id}`, { reviewed: true })).status,
    ).toBe(204)
    const bugs = (await anonymous.get(`/public/projects/${project.code}/bugs`)).json
    expect(bugs.total).toBe(1)
    expect(bugs.data[0]).toMatchObject({ title: report.title, reporter: 'Warga' })
    expect(bugs.data[0]).not.toHaveProperty('contact')
    expect((await lead.get(`${P()}/bug-reporting/reports`)).json).toHaveLength(0)
    // Reviewed, it is a real problem now: not thrown away from here.
    expect((await lead.delete(`${P()}/bug-reporting/reports/${waiting[0].id}`)).status).toBe(404)

    // With "Fitur" switched on, visitors can filter by the feature's name.
    await lead.put(`${P()}/bug-reporting`, {
      is_public: true,
      public_fields: ['bugs.list', 'bugs.feature'],
      public_intro: null,
      accept_reports: true,
    })
    expect(
      (await anonymous.get(`/public/projects/${project.code}/bug-reporting`)).json.features,
    ).toEqual(['Lapor Loker'])
    const byFeature = await anonymous.get(
      `/public/projects/${project.code}/bugs?feature=${encodeURIComponent('Lapor Loker')}`,
    )
    expect(byFeature.json.data.map((b: { feature: string }) => b.feature)).toEqual(['Lapor Loker'])
    expect(
      (await anonymous.get(`/public/projects/${project.code}/bugs?feature=Lainnya`)).json.total,
    ).toBe(0)
  })

  it('throws away a report that is not a problem, and slows down a flood', async () => {
    const anonymous = new Client(h)
    const ip = '203.0.113.9'
    expect(
      (
        await send(
          anonymous,
          { title: 'Coba coba saja', description: 'Hanya mencoba formulir.' },
          ip,
        )
      ).status,
    ).toBe(201)
    const [item] = (await lead.get(`${P()}/bug-reporting/reports`)).json
    expect((await lead.delete(`${P()}/bug-reporting/reports/${item.id}`)).status).toBe(204)
    expect((await lead.get(`${P()}/bug-reporting/reports`)).json).toHaveLength(0)
    for (let i = 1; i <= 4; i++) {
      const res = await send(
        anonymous,
        { title: `Laporan nomor ${i}`, description: 'Isi laporan yang cukup panjang.' },
        ip,
      )
      expect(res.status).toBe(201)
    }
    const flood = await send(
      anonymous,
      { title: 'Laporan keenam', description: 'Isi laporan yang cukup panjang.' },
      ip,
    )
    expect(flood.status).toBe(429)
    // Another device is not slowed down.
    expect(
      (
        await send(
          anonymous,
          { title: 'Dari perangkat lain', description: 'Isi laporan yang cukup panjang.' },
          '203.0.113.10',
        )
      ).status,
    ).toBe(201)
  })

  it('stops taking reports when the form is switched off', async () => {
    await lead.put(`${P()}/bug-reporting`, {
      is_public: true,
      public_fields: ['bugs.list'],
      public_intro: null,
      accept_reports: false,
    })
    const anonymous = new Client(h)
    expect((await send(anonymous, report, '192.0.2.44')).status).toBe(404)
    expect(
      (await anonymous.get(`/public/projects/${project.code}/bug-reporting`)).json.accept_reports,
    ).toBe(false)
  })
})
