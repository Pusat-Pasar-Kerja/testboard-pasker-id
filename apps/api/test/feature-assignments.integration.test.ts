import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

/**
 * Who works on which feature of a UAT (ADR 0020): groups and people listed per feature, and
 * only they answer its scenarios. Whole feature folders move or copy between Fase.
 */
const h = createHarness()
afterAll(() => h.pool.end())

let project: { id: string; code: string }
let lead: Client
let faseA: string
let faseB: string
let uatId: string
let sri: Client
let sriMember: string
let budi: Client
let meja1: string
const modules: Record<string, string> = {}
let runCases: { run_case_id: string; module_code: string }[] = []
const P = () => `/projects/${project.code}`
const U = () => `${P()}/uats/${uatId}`
const soon = () => new Date(Date.now() + 24 * 3_600_000).toISOString()
const caseOf = (code: string) => runCases.find((rc) => rc.module_code === code)!.run_case_id
const answer = (client: Client, runCaseId: string) =>
  client.post(`${P()}/run-cases/${runCaseId}/executions`, { result_status: 'PASSED' })

async function scenario(moduleCode: string, title: string, cycleId: string) {
  const res = await lead.post(`${P()}/test-cases`, {
    module_code: moduleCode,
    cycle_id: cycleId,
    title,
    expected_result: 'Berhasil',
    case_status: 'READY',
  })
  expect(res.status).toBe(201)
}

async function signIn(name: string) {
  const user = await createUser(h.pool, { name })
  const client = new Client(h)
  await client.login(user.email)
  return { user, client }
}

beforeAll(async () => {
  project = await createProject(h.pool)
  const admin = await createUser(h.pool, { name: 'Pengelola' })
  await addMember(h.pool, project.id, admin.id, 'QA_LEAD')
  lead = new Client(h)
  await lead.login(admin.email)
  faseA = (
    await lead.post(`${P()}/cycles`, {
      cycle_code: 'FASE-A',
      title: 'Fase A',
      status_code: 'ACTIVE',
    })
  ).json.id
  faseB = (
    await lead.post(`${P()}/cycles`, {
      cycle_code: 'FASE-B',
      title: 'Fase B',
      status_code: 'PLANNED',
    })
  ).json.id
  for (const [code, name] of [
    ['LOKER', 'Lapor Loker'],
    ['GIG', 'Gig Workers'],
  ] as const) {
    modules[code] = (await lead.post(`${P()}/modules`, { module_code: code, name })).json.id
  }
  await scenario('LOKER', 'Buka halaman loker', faseA)
  await scenario('LOKER', 'Simpan loker', faseA)
  await scenario('GIG', 'Daftar gig', faseA)
  uatId = (
    await lead.post(`${P()}/uats`, {
      cycle_id: faseA,
      name: 'UAT 1',
      module_ids: [modules.LOKER, modules.GIG],
    })
  ).json.id
  await lead.post(`${P()}/runs/${uatId}/status`, { status_code: 'ACTIVE' })
  runCases = (await lead.get(`${P()}/runs/${uatId}`)).json.run_cases

  const sriAccount = await signIn('Bu Sri')
  sri = sriAccount.client
  const added = await lead.post(`${U()}/participants`, {
    people: [{ name: 'Bu Sri', email: sriAccount.user.email }],
  })
  sriMember = added.json.find((p: { name: string }) => p.name === 'Bu Sri').id
  const budiAccount = await signIn('Pak Budi')
  budi = budiAccount.client
  const group = await lead.post(`${U()}/groups`, {
    name: 'Meja 1',
    table_number: 1,
    module_ids: [],
    members: [{ name: 'Pak Budi', email: budiAccount.user.email }],
    valid_until: soon(),
  })
  expect(group.status).toBe(201)
  meja1 = group.json.id
})

describe('feature assignments: only those listed work on a feature', () => {
  it('gives someone without an assignment nothing to answer yet', async () => {
    expect((await answer(sri, caseOf('LOKER'))).status).toBe(403)
    expect((await answer(budi, caseOf('GIG'))).status).toBe(403)
    const mine = (await sri.get(`${P()}/uats`)).json[0]
    expect(mine.my_features).toEqual([])
  })

  it('assigns a feature to a person by name and to a group', async () => {
    const loker = await lead.put(`${U()}/features/${modules.LOKER}/assignees`, {
      group_ids: [],
      member_ids: [sriMember],
    })
    expect(loker.status).toBe(200)
    expect(loker.json).toMatchObject({
      module: { module_code: 'LOKER' },
      groups: [],
      people: [{ id: sriMember, name: 'Bu Sri', group: null }],
    })
    const gig = await lead.put(`${U()}/features/${modules.GIG}/assignees`, {
      group_ids: [meja1],
      member_ids: [],
    })
    expect(gig.json.groups).toEqual([{ id: meja1, name: 'Meja 1', table_number: 1 }])

    // Sri answers LOKER only; Budi answers GIG through Meja 1 only.
    expect((await answer(sri, caseOf('LOKER'))).status).toBe(201)
    expect((await answer(sri, caseOf('GIG'))).status).toBe(403)
    expect((await answer(budi, caseOf('GIG'))).status).toBe(201)
    expect((await answer(budi, caseOf('LOKER'))).status).toBe(403)

    const list = (await lead.get(`${U()}/assignments`)).json
    expect(
      list.map((a: { module: { module_code: string } }) => a.module.module_code).sort(),
    ).toEqual(['GIG', 'LOKER'])
    // The group form shows the same: Meja 1 now works on GIG.
    const tables = (await lead.get(`${U()}/groups`)).json as {
      id: string
      modules: { id: string }[]
    }[]
    expect(tables.find((t) => t.id === meja1)!.modules.map((m) => m.id)).toEqual([modules.GIG])
  })

  it('tells each Pengguna their own features, and counts only those in "Tugas saya"', async () => {
    const mine = (await sri.get(`${P()}/uats`)).json[0]
    expect(mine.my_features.map((m: { module_code: string }) => m.module_code)).toEqual(['LOKER'])
    const tasks = (await sri.get('/me/tasks')).json
    expect(tasks.runs[0]).toMatchObject({ assigned: 2, done: 1 })
    const budiUat = (await budi.get(`${P()}/uats`)).json[0]
    expect(budiUat.my_features.map((m: { module_code: string }) => m.module_code)).toEqual(['GIG'])
    expect(budiUat.my_group).toMatchObject({ name: 'Meja 1', table_number: 1 })
  })

  it('refuses groups, people or features outside the UAT, and keeps it for managers', async () => {
    const other = await lead.post(`${P()}/uats`, {
      cycle_id: faseA,
      name: 'UAT 2',
      module_ids: [modules.LOKER],
    })
    const otherGroup = await lead.post(`${P()}/uats/${other.json.id}/groups`, {
      name: 'Meja Lain',
      module_ids: [],
      valid_until: soon(),
    })
    expect(
      (
        await lead.put(`${U()}/features/${modules.LOKER}/assignees`, {
          group_ids: [otherGroup.json.id],
          member_ids: [],
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await lead.put(`${P()}/uats/${other.json.id}/features/${modules.GIG}/assignees`, {
          group_ids: [],
          member_ids: [],
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await sri.put(`${U()}/features/${modules.LOKER}/assignees`, {
          group_ids: [],
          member_ids: [sriMember],
        })
      ).status,
    ).toBe(403)
    expect((await sri.get(`${U()}/assignments`)).status).toBe(403)
  })

  it('takes the assignments away with a feature that leaves the UAT', async () => {
    await lead.patch(U(), { module_ids: [modules.LOKER] })
    const list = (await lead.get(`${U()}/assignments`)).json
    expect(list.map((a: { module: { module_code: string } }) => a.module.module_code)).toEqual([
      'LOKER',
    ])
    const tables = (await lead.get(`${U()}/groups`)).json as {
      id: string
      modules: unknown[]
    }[]
    expect(tables.find((t) => t.id === meja1)!.modules).toEqual([])
    // Results already recorded stay.
    const run = (await lead.get(`${P()}/runs/${uatId}`)).json
    expect(run.run_cases.some((rc: { module_code: string }) => rc.module_code === 'GIG')).toBe(true)
  })
})

describe('moving whole feature folders between Fase', () => {
  it('copies a feature folder to the next Fase, where its open UAT picks it up', async () => {
    const next = await lead.post(`${P()}/uats`, {
      cycle_id: faseB,
      name: 'UAT Fase B',
      module_ids: [modules.LOKER],
    })
    expect(next.json.progress.total).toBe(0)
    const copied = await lead.post(`${P()}/phases/transfer`, {
      from_cycle_id: faseA,
      to_cycle_id: faseB,
      module_ids: [modules.LOKER],
      mode: 'copy',
    })
    expect(copied.status).toBe(200)
    expect(copied.json).toEqual({ features: 1, scenarios: 2 })
    const tree = (await lead.get(`${P()}/phases`)).json
    const b = tree.phases.find((p: { id: string }) => p.id === faseB)
    expect(b.features).toEqual([
      expect.objectContaining({
        module: expect.objectContaining({ module_code: 'LOKER' }),
        scenarios: 2,
        ready: 2,
      }),
    ])
    // The originals stay in Fase A.
    const a = tree.phases.find((p: { id: string }) => p.id === faseA)
    expect(
      a.features.find((f: { module: { module_code: string } }) => f.module.module_code === 'LOKER')
        .scenarios,
    ).toBe(2)
    expect((await lead.get(`${P()}/uats/${next.json.id}`)).json.progress.total).toBe(2)
  })

  it('moves a feature folder out of a Fase, folder and all', async () => {
    const moved = await lead.post(`${P()}/phases/transfer`, {
      from_cycle_id: faseA,
      to_cycle_id: null,
      module_ids: [modules.GIG],
      mode: 'move',
    })
    expect(moved.json).toEqual({ features: 1, scenarios: 1 })
    const tree = (await lead.get(`${P()}/phases`)).json
    const a = tree.phases.find((p: { id: string }) => p.id === faseA)
    expect(
      a.features.map((f: { module: { module_code: string } }) => f.module.module_code),
    ).toEqual(['LOKER'])
    expect(
      tree.unassigned.features.map(
        (f: { module: { module_code: string } }) => f.module.module_code,
      ),
    ).toEqual(['GIG'])
  })

  it('refuses the same Fase, a copy without a Fase, and Pengguna', async () => {
    const send = (client: Client, body: unknown) => client.post(`${P()}/phases/transfer`, body)
    expect(
      (
        await send(lead, {
          from_cycle_id: faseA,
          to_cycle_id: faseA,
          module_ids: [modules.LOKER],
          mode: 'move',
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await send(lead, {
          from_cycle_id: faseA,
          to_cycle_id: null,
          module_ids: [modules.LOKER],
          mode: 'copy',
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await send(lead, {
          from_cycle_id: faseA,
          to_cycle_id: '999999',
          module_ids: [modules.LOKER],
          mode: 'move',
        })
      ).status,
    ).toBe(422)
    expect(
      (
        await send(sri, {
          from_cycle_id: faseA,
          to_cycle_id: faseB,
          module_ids: [modules.LOKER],
          mode: 'copy',
        })
      ).status,
    ).toBe(403)
  })
})
