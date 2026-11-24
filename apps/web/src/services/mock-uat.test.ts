import { describe, expect, it } from 'vitest'
import { createMockDb, tableNumberOf } from '../mocks/seed'
import { createMockDataSource } from './mock-data-source'

/** The Drive-like structure of ADR 0019 in the demo data: same rules as the API. */
const MAIN = 'DEMO-KARIR'
const OTHER = 'DEMO-LATIH'
const SOON = '2099-01-01T00:00:00.000Z'

function setup(currentUserId = '1', superAdmin = true) {
  const db = createMockDb()
  db.currentUserId = currentUserId
  const source = createMockDataSource({ latencyMs: 0, db, superAdmin })
  const main = db.projects.find((p) => p.project_code === MAIN)!
  const fase = db.cycles.find((c) => c.projectId === main.id)!
  const runOf = (code: string) => db.runs.find((r) => r.run_code === code)!
  const moduleOf = (code: string) =>
    db.modules.find((m) => m.projectId === main.id && m.module_code === code)!
  const tableOf = (name: string) => db.tables.find((t) => t.name === name)!
  return { db, source, main, fase, runOf, moduleOf, tableOf }
}

describe('demo data, filled like migration 0015', () => {
  it('puts every scenario in a Fase and keeps only three kinds of people', () => {
    const db = createMockDb()
    for (const c of db.cases) {
      expect(c.cycleId).toBe(db.cycles.find((cy) => cy.projectId === c.projectId)?.id)
    }
    const roles = new Set(db.projects.flatMap((p) => p.members.map((m) => m.role)))
    expect([...roles].sort()).toEqual(['ADMIN', 'QA_LEAD', 'TESTER'])
  })

  it('gives every UAT its features, public view, people and numbered groups', () => {
    const db = createMockDb()
    const s2 = db.runs.find((r) => r.run_code === 'RUN-S2-20261109')!
    const codes = db.uatFeatures
      .filter((f) => f.runId === s2.id)
      .map((f) => db.modules.find((m) => m.id === f.moduleId)?.module_code)
    expect(codes).toEqual(['AUTH', 'LOKER', 'PROFIL', 'LAMAR', 'ADM'])
    expect(db.tables.map((t) => [t.name, t.tableNumber, t.code, t.runId])).toEqual([
      ['Meja 1', 1, '246810', s2.id],
      ['Meja 2', 2, '135791', s2.id],
      ['Meja 3', 3, '112233', s2.id],
    ])
    const people = db.participants.filter((p) => p.runId === s2.id)
    expect(people.filter((p) => p.tableId !== null)).toHaveLength(8)
    // Pengguna who were given scenarios take part without a group; managers never are listed.
    expect(people.filter((p) => p.tableId === null).map((p) => [p.name, p.userId])).toEqual([
      ['Demo Penguji 1', '3'],
      ['Demo Penguji 2', '4'],
    ])
    // The public workshop Fase: its UATs carry the view, its problem list is Bug Reporting.
    const mainRuns = db.runs.filter((r) => r.projectId === '1')
    expect(mainRuns.map((r) => r.is_public)).toEqual([true, true, true])
    expect(mainRuns.flatMap((r) => r.public_fields ?? []).some((f) => f.startsWith('bugs.'))).toBe(
      false,
    )
    expect(db.bugReporting).toEqual([
      {
        projectId: '1',
        is_public: true,
        public_fields: ['bugs.list', 'bugs.code', 'bugs.feature'],
        public_intro: null,
        accept_reports: false,
      },
    ])
  })

  it('reads a table number from a name', () => {
    expect(tableNumberOf('Meja 12')).toBe(12)
    expect(tableNumberOf('Kelompok A')).toBeNull()
  })
})

describe('Fase > Fitur > Skenario', () => {
  it('shows Fase folders with feature folders and adds an empty one', async () => {
    const { source, fase } = setup()
    const tree = await source.getPhaseTree(MAIN)
    const phase = tree.phases.find((p) => p.id === fase.id)!
    // 29 scenarios, one archived; no scenario without a feature.
    expect(phase).toMatchObject({
      cycle_code: 'SIKLUS-1-2026',
      scenarios: 28,
      unsorted: 0,
      uats: 3,
    })
    expect(phase.features.map((f) => f.module.module_code)).toEqual([
      'AUTH',
      'ADM',
      'LAMAR',
      'LOKER',
      'PROFIL',
    ])
    expect(phase.features.find((f) => f.module.module_code === 'ADM')).toMatchObject({
      scenarios: 4,
      ready: 3,
    })
    expect(tree.unassigned).toMatchObject({ id: null, scenarios: 0, uats: 0, features: [] })

    await expect(
      source.addPhaseFeature(MAIN, fase.id, { module_code: 'gig' }),
    ).rejects.toMatchObject({ status: 422 })
    const after = await source.addPhaseFeature(MAIN, fase.id, {
      module_code: 'gig',
      name: 'Gig Workers',
    })
    expect(after.phases[0]?.features.find((f) => f.module.module_code === 'GIG')).toMatchObject({
      scenarios: 0,
      ready: 0,
    })
    await expect(
      source.addPhaseFeature(MAIN, '999999', { module_code: 'GIG' }),
    ).rejects.toMatchObject({ status: 404 })
  })

  it('filters scenarios by Fase, and keeps the library for the people who manage', async () => {
    const { db, source, fase } = setup()
    const inFase = await source.listTestCases(MAIN, { cycle: fase.id, page_size: 100 })
    expect(inFase.total).toBe(28)
    expect(inFase.data[0]?.cycle).toEqual({
      id: fase.id,
      cycle_code: 'SIKLUS-1-2026',
      title: 'Siklus UAT 1 - 2026',
    })
    expect((await source.listTestCases(MAIN, { cycle: 'none' })).total).toBe(0)

    db.currentUserId = '3'
    await expect(source.listTestCases(MAIN)).rejects.toMatchObject({ status: 403 })
    await expect(source.getPhaseTree(MAIN)).rejects.toMatchObject({ status: 403 })
    await expect(source.getTestCase(MAIN, inFase.data[0]!.id)).rejects.toMatchObject({
      status: 403,
    })
  })

  it('copies scenarios to another Fase (Ready stays Ready) and moves one out', async () => {
    const { source, fase } = setup()
    const next = await source.createCycle(MAIN, {
      cycle_code: 'SIKLUS-2-2026',
      title: 'Siklus UAT 2 - 2026',
    })
    const ids = (await source.listTestCases(MAIN, { module: 'ADM' })).data.map((c) => c.id)
    expect(ids).toHaveLength(4)
    const copied = await source.bulkTestCases(MAIN, {
      action: 'copy_to_phase',
      case_ids: ids,
      cycle_id: next.id,
    })
    expect(copied).toMatchObject({ updated: 4, skipped: [] })
    const inNext = await source.listTestCases(MAIN, { cycle: next.id })
    expect(inNext.total).toBe(4)
    expect(inNext.data.filter((c) => c.case_status === 'READY')).toHaveLength(3)
    // The originals stay where they are; the copies get their own codes.
    expect((await source.listTestCases(MAIN, { cycle: fase.id, page_size: 100 })).total).toBe(28)
    expect(inNext.data.map((c) => c.case_code)).toEqual([
      'UAT-ADM-006',
      'UAT-ADM-007',
      'UAT-ADM-008',
      'UAT-ADM-009',
    ])

    const draft = inNext.data.find((c) => c.case_status === 'DRAFT')!
    const moved = await source.bulkTestCases(MAIN, {
      action: 'move_to_phase',
      case_ids: [draft.id],
      cycle_id: null,
    })
    expect(moved.updated).toBe(1)
    expect((await source.listTestCases(MAIN, { cycle: 'none' })).data.map((c) => c.id)).toEqual([
      draft.id,
    ])
    await expect(
      source.bulkTestCases(MAIN, { action: 'copy_to_phase', case_ids: ids, cycle_id: '999999' }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('adds a Ready scenario of a Fase to the open UATs that test its feature', async () => {
    const { db, source, fase, runOf } = setup()
    const count = (code: string) => db.runCases.filter((rc) => rc.runId === runOf(code).id).length
    const before = { s1: count('RUN-S1-20261012'), s2: count('RUN-S2-20261109') }
    const input = {
      module_code: 'AUTH',
      title: 'Masuk dengan kode sekali pakai',
      expected_result: 'Berhasil masuk',
      case_status: 'READY' as const,
      cycle_id: fase.id,
    }
    const created = await source.createTestCase(MAIN, input)
    expect(created.cycle?.id).toBe(fase.id)
    expect(count('RUN-S2-20261109')).toBe(before.s2 + 1)
    // A finished UAT never changes.
    expect(count('RUN-S1-20261012')).toBe(before.s1)

    // The draft of the main project joins once it is Ready.
    const draft = db.cases.find((c) => c.projectId === '1' && c.case_status === 'DRAFT')!
    await source.bulkTestCases(MAIN, {
      action: 'set_status',
      case_ids: [draft.id],
      case_status: 'READY',
    })
    for (const code of ['RUN-S2-20261109', 'RUN-REG-20261130']) {
      const added = db.runCases.find((rc) => rc.runId === runOf(code).id && rc.caseId === draft.id)
      expect(added?.snapshot?.case_code).toBe(draft.case_code)
    }
  })
})

describe('UAT', () => {
  it('takes the Ready scenarios of its features and follows feature changes', async () => {
    const { db, source, fase, moduleOf } = setup()
    const created = await source.createUat(MAIN, {
      cycle_id: fase.id,
      name: 'UAT Gelombang 2',
      module_ids: [moduleOf('AUTH').id],
    })
    expect(created).toMatchObject({
      name: 'UAT Gelombang 2',
      status_code: 'PLANNED',
      phase: { id: fase.id, cycle_code: 'SIKLUS-1-2026' },
      features: 1,
      groups: 0,
      participants: 0,
      is_public: false,
      progress: { total: 6 },
    })
    expect(created.run_code).toMatch(/^RUN-\d{8}-1$/)
    expect(created).not.toHaveProperty('my_group')

    const wider = await source.updateUat(MAIN, created.id, {
      module_ids: [moduleOf('AUTH').id, moduleOf('ADM').id],
    })
    expect(wider).toMatchObject({ features: 2, progress: { total: 9 } })

    // Untried scenarios leave with their feature; tried ones stay.
    await source.changeRunStatus(MAIN, created.id, 'ACTIVE')
    const tried = db.runCases.find(
      (rc) =>
        rc.runId === created.id &&
        db.cases.find((c) => c.id === rc.caseId)?.moduleId === moduleOf('AUTH').id,
    )!
    await source.createExecution(MAIN, tried.id, { result_status: 'PASSED' }, 'uat-1')
    const narrowed = await source.updateUat(MAIN, created.id, { module_ids: [moduleOf('ADM').id] })
    expect(narrowed).toMatchObject({ features: 1, progress: { total: 4, passed: 1 } })
    expect(narrowed.feature_list.map((f) => f.module.module_code)).toEqual(['ADM'])

    await expect(
      source.createUat(MAIN, {
        cycle_id: '999999',
        name: 'Salah',
        module_ids: [moduleOf('ADM').id],
      }),
    ).rejects.toMatchObject({ status: 422, details: [{ field: 'cycle_id' }] })
    await expect(
      source.createUat(MAIN, { cycle_id: fase.id, name: 'Kosong', module_ids: [] }),
    ).rejects.toMatchObject({ status: 422 })
    db.runs.find((r) => r.id === created.id)!.status_code = 'LOCKED'
    await expect(source.updateUat(MAIN, created.id, { name: 'Baru' })).rejects.toMatchObject({
      status: 409,
    })
  })

  it('shows a Pengguna only the UATs they take part in, with their own group', async () => {
    const { db, source, runOf, tableOf } = setup('3', false)
    const mine = await source.listUats(MAIN)
    expect(mine.map((u) => u.run_code)).toEqual([
      'RUN-S2-20261109',
      'RUN-REG-20261130',
      'RUN-S1-20261012',
    ])
    expect(mine[0]).toMatchObject({ groups: 3, participants: 10, my_group: null })

    const s2 = runOf('RUN-S2-20261109')
    const meja2 = tableOf('Meja 2')
    db.participants.find((p) => p.runId === s2.id && p.userId === '3')!.tableId = meja2.id
    expect((await source.getUat(MAIN, s2.id)).my_group).toEqual({
      id: meja2.id,
      name: 'Meja 2',
      table_number: 2,
      modules: [
        expect.objectContaining({ module_code: 'LAMAR', name: 'Lamaran' }),
        expect.objectContaining({ module_code: 'PROFIL', name: 'Profil Pencari Kerja' }),
      ],
    })
    expect((await source.listUats(MAIN))[0]?.my_group?.name).toBe('Meja 2')
    // Taking part is not managing.
    await expect(source.listUatParticipants(MAIN, s2.id)).rejects.toMatchObject({ status: 403 })
    await expect(source.getWorkshopBoard(MAIN, s2.id)).rejects.toMatchObject({ status: 403 })
    await expect(source.getBugReporting(MAIN)).rejects.toMatchObject({ status: 403 })

    // The former Developer takes part in nothing: no UAT, no run, no scenario.
    db.currentUserId = '5'
    expect(await source.listUats(MAIN)).toEqual([])
    expect(await source.listRuns(MAIN)).toEqual([])
    await expect(source.getUat(MAIN, s2.id)).rejects.toMatchObject({ status: 404 })
    await expect(source.getRun(MAIN, s2.id)).rejects.toMatchObject({ status: 404 })
    const runCase = db.runCases.find((rc) => rc.runId === s2.id)!
    await expect(source.getRunCase(MAIN, runCase.id)).rejects.toMatchObject({ status: 404 })
  })

  it('adds people by name or account and moves them in and out of a numbered group', async () => {
    const { db, source, runOf, moduleOf } = setup()
    const reg = runOf('RUN-REG-20261130')
    const added = await source.addUatParticipants(MAIN, reg.id, {
      people: [{ name: 'Bu Lina', email: 'lina.uat@demo.invalid' }, { name: 'Pak Anton' }],
    })
    expect(added).toHaveLength(4)
    const lina = added.find((p) => p.name === 'Bu Lina')!
    expect(lina).toMatchObject({
      email: 'lina.uat@demo.invalid',
      account: 'NOT_ACTIVATED',
      group: null,
    })
    expect(db.projects[0]?.members.find((m) => m.userId === lina.user_id)?.role).toBe('TESTER')
    // Listing the same people again never adds them twice; one list may not repeat a name.
    const again = await source.addUatParticipants(MAIN, reg.id, {
      people: [{ name: 'pak anton' }, { name: 'Bu Lina', email: 'lina.uat@demo.invalid' }],
    })
    expect(again).toHaveLength(4)
    await expect(
      source.addUatParticipants(MAIN, reg.id, { people: [{ name: 'Bu Ani' }, { name: 'bu ani' }] }),
    ).rejects.toMatchObject({ status: 422 })
    const card = db.users.find((u) => u.kind === 'TABLE')!
    await expect(
      source.addUatParticipants(MAIN, reg.id, { people: [{ name: 'Kartu', email: card.email }] }),
    ).rejects.toMatchObject({ status: 422, details: [{ field: 'email', message: 'NOT_A_PERSON' }] })

    const group = await source.createWorkshopTable(MAIN, reg.id, {
      name: 'Kelompok A',
      table_number: 7,
      module_ids: [moduleOf('AUTH').id],
      members: [{ name: 'Pak Anton' }],
      valid_until: SOON,
    })
    expect(group).toMatchObject({
      name: 'Kelompok A',
      table_number: 7,
      member_names: ['Pak Anton'],
      run: { id: reg.id },
    })
    const people = await source.listUatParticipants(MAIN, reg.id)
    expect(people).toHaveLength(4)
    // Numbered groups first.
    expect(people[0]).toMatchObject({
      name: 'Pak Anton',
      group: { id: group.id, name: 'Kelompok A', table_number: 7 },
    })

    const moved = await source.updateUatParticipant(MAIN, reg.id, lina.id, { group_id: group.id })
    expect(moved.group?.id).toBe(group.id)
    // Listed again without a group: she keeps her group.
    await source.addUatParticipants(MAIN, reg.id, {
      people: [{ name: 'Bu Lina', email: 'lina.uat@demo.invalid' }],
    })
    const kept = await source.listUatParticipants(MAIN, reg.id)
    expect(kept.find((p) => p.id === lina.id)?.group?.id).toBe(group.id)

    expect(
      (await source.updateUatParticipant(MAIN, reg.id, lina.id, { group_id: null })).group,
    ).toBe(null)
    await source.removeUatParticipant(MAIN, reg.id, lina.id)
    expect((await source.listUatParticipants(MAIN, reg.id)).some((p) => p.id === lina.id)).toBe(
      false,
    )
    // A person or group of another UAT is refused.
    const s2 = runOf('RUN-S2-20261109')
    const other = kept.find((p) => p.name === 'Demo Penguji 1')!
    await expect(
      source.updateUatParticipant(MAIN, s2.id, other.id, { group_id: null }),
    ).rejects.toMatchObject({ status: 404 })
    await expect(
      source.addUatParticipants(MAIN, s2.id, {
        people: [{ name: 'Orang Baru', group_id: group.id }],
      }),
    ).rejects.toMatchObject({ status: 422 })
  })

  it('manages groups: numbers, unique names, people who stay when a group goes', async () => {
    const { db, source, runOf } = setup()
    const s2 = runOf('RUN-S2-20261109')
    const groups = await source.listWorkshopTables(MAIN, s2.id)
    expect(groups.map((t) => [t.name, t.table_number, t.access_code])).toEqual([
      ['Meja 1', 1, '246810'],
      ['Meja 2', 2, '135791'],
      ['Meja 3', 3, '112233'],
    ])
    expect(groups[0]).toMatchObject({
      member_names: ['Bu Sri', 'Pak Budi', 'Bu Ani'],
      state: 'ACTIVE',
      cycle: { cycle_code: 'SIKLUS-1-2026' },
      modules: [{ module_code: 'AUTH' }, { module_code: 'LOKER' }],
    })
    await expect(
      source.createWorkshopTable(MAIN, s2.id, {
        name: 'meja 1',
        module_ids: [],
        valid_until: SOON,
      }),
    ).rejects.toMatchObject({ status: 409 })

    const guest = await source.createWorkshopTable(MAIN, s2.id, {
      name: 'Meja Tamu',
      module_ids: [],
      members: [{ name: 'Tamu Satu' }],
      valid_until: SOON,
    })
    expect(guest).toMatchObject({
      table_number: null,
      state: 'ACTIVE',
      member_names: ['Tamu Satu'],
    })
    expect(guest.access_code).toMatch(/^\d{6}$/)
    expect((await source.listWorkshopTables(MAIN, s2.id)).at(-1)?.id).toBe(guest.id)
    await source.deleteWorkshopTable(MAIN, s2.id, guest.id)
    expect(db.participants.find((p) => p.name === 'Tamu Satu')).toMatchObject({
      runId: s2.id,
      tableId: null,
    })

    // A group with answers can only be blocked.
    await source.joinWorkshop('246810')
    const feature = (await source.getWorkshopSession()).features[0]!
    const scenario = (await source.listWorkshopCases(feature.module.id))[0]!
    await source.saveWorkshopResult(scenario.run_case_id, { result_status: 'PASSED' })
    await source.logout()
    await expect(source.deleteWorkshopTable(MAIN, s2.id, groups[0]!.id)).rejects.toMatchObject({
      status: 409,
    })
    const blocked = await source.updateWorkshopTable(MAIN, s2.id, groups[0]!.id, {
      revoked: true,
      table_number: 11,
    })
    expect(blocked).toMatchObject({ state: 'REVOKED', table_number: 11 })
    await expect(source.joinWorkshop('246810')).rejects.toMatchObject({ status: 401 })
  })

  it('lets a person listed with an e-mail activate their account at the table', async () => {
    const { db, source, runOf, tableOf } = setup()
    const s2 = runOf('RUN-S2-20261109')
    const saved = await source.updateWorkshopTable(MAIN, s2.id, tableOf('Meja 1').id, {
      members: [
        { name: 'Pak Budi', email: 'budi.meja@demo.invalid' },
        { name: 'Bu Sri', email: null },
      ],
    })
    expect(saved.members.map((m) => [m.name, m.account])).toEqual([
      ['Pak Budi', 'NOT_ACTIVATED'],
      ['Bu Sri', 'NONE'],
    ])
    // Bu Ani is not listed any more: she stays in the UAT without a group.
    expect(db.participants.find((p) => p.name === 'Bu Ani')).toMatchObject({
      runId: s2.id,
      tableId: null,
    })

    const session = await source.joinWorkshop(saved.access_code)
    expect(session.table).toMatchObject({ name: 'Meja 1', table_number: 1 })
    const budi = session.table.members.find((m) => m.name === 'Pak Budi')!
    expect(budi.email_hint).toBe('b***@demo.invalid')
    await expect(source.activateTableMember(budi.id, 'budi.meja-123')).rejects.toMatchObject({
      status: 422,
    })
    const after = await source.activateTableMember(budi.id, 'Rahasia-Kuat-9')
    expect(after.table.members.find((m) => m.name === 'Pak Budi')?.account).toBe('ACTIVE')
    // Names typed at the table never remove a person with an account.
    const typed = await source.updateWorkshopMembers(['Bu Sri', 'Pak Eko'])
    expect(typed.table.member_names).toEqual(['Pak Budi', 'Bu Sri', 'Pak Eko'])
  })

  it('shows the live board and reviews the problems sent by its groups', async () => {
    const { db, source, runOf } = setup()
    const s2 = runOf('RUN-S2-20261109')
    await source.joinWorkshop('246810')
    const feature = (await source.getWorkshopSession()).features[0]!
    const scenario = (await source.listWorkshopCases(feature.module.id))[0]!
    const saved = await source.saveWorkshopResult(scenario.run_case_id, {
      result_status: 'FAILED',
      note: 'Muncul pesan error merah',
      tester_name: 'Bu Sri',
      client_id: 'hp-1',
    })
    // The offline outbox sends again: saved once.
    const retry = await source.saveWorkshopResult(scenario.run_case_id, {
      result_status: 'FAILED',
      note: 'Muncul pesan error merah',
      tester_name: 'Bu Sri',
      client_id: 'hp-1',
    })
    expect(retry).toEqual(saved)
    await source.logout()

    const board = await source.getWorkshopBoard(MAIN, s2.id)
    expect(board.uat).toMatchObject({
      id: s2.id,
      run_code: 'RUN-S2-20261109',
      phase: { cycle_code: 'SIKLUS-1-2026' },
      is_public: true,
    })
    expect(board.tables.map((t) => t.table_number)).toEqual([1, 2, 3])
    expect(board.bugs.to_review).toBe(1)
    expect(board.recent.map((r) => r.kind).sort()).toEqual(['BUG', 'RESULT'])

    const inbox = await source.listWorkshopInbox(MAIN, s2.id)
    expect(inbox).toHaveLength(1)
    expect(inbox[0]).toMatchObject({
      id: saved.defect?.id,
      table_name: 'Meja 1',
      tester_name: 'Bu Sri',
      scenario: { run_case_id: scenario.run_case_id },
    })
    const reviewed = await source.reviewWorkshopBug(MAIN, s2.id, saved.defect!.id, {
      severity_code: 'HIGH',
      reviewed: true,
    })
    expect(reviewed.severity_code).toBe('HIGH')
    expect(await source.listWorkshopInbox(MAIN, s2.id)).toEqual([])

    const other = db.defects.find(
      (d) => d.projectId === '1' && d.id !== saved.defect!.id && !d.duplicateOf,
    )!
    const duplicate = await source.reviewWorkshopBug(MAIN, s2.id, saved.defect!.id, {
      duplicate_of_id: other.id,
    })
    expect(duplicate).toMatchObject({
      duplicate_of: { id: other.id },
      status_code: 'WONT_FIX',
    })
  })

  it('switches the public view of a UAT and what it shows of a feature', async () => {
    const { source, runOf, moduleOf } = setup()
    const s1 = runOf('RUN-S1-20261012')
    const saved = await source.updateUatPublic(MAIN, s1.id, {
      is_public: false,
      public_fields: ['features.list', 'bugs.list'],
      public_intro: '',
    })
    // Problems are shown by Bug Reporting now.
    expect(saved).toEqual({
      is_public: false,
      public_fields: ['features.list'],
      public_intro: null,
    })
    const features = await source.updateWorkshopFeature(MAIN, s1.id, {
      module_id: moduleOf('ADM').id,
      state_code: 'HIDDEN',
    })
    expect(features.find((f) => f.module.module_code === 'ADM')?.state).toBe('HIDDEN')
    await expect(
      source.updateWorkshopFeature(MAIN, s1.id, { module_id: '999999', state_code: 'DONE' }),
    ).rejects.toMatchObject({ status: 422 })
  })
})

describe('public pages', () => {
  it('lists the public UATs and shows only the switched-on data', async () => {
    const { source, fase, runOf } = setup()
    const list = await source.listPublicUats()
    expect(list.map((u) => u.name)).toEqual(['UAT Sprint 2', 'Regresi Rilis 1.1', 'UAT Sprint 1'])
    expect(list[0]).toMatchObject({
      project: { code: MAIN },
      phase: { cycle_code: 'SIKLUS-1-2026' },
      intro: expect.stringContaining('Forum workshop'),
      status_code: 'ACTIVE',
      period: { starts_on: '2026-11-09', ends_on: null },
      bug_reporting_public: true,
    })
    const detail = await source.getPublicUat(list[0]!.id)
    expect(detail.features?.map((f) => f.module_code)).toEqual([
      'AUTH',
      'ADM',
      'LAMAR',
      'LOKER',
      'PROFIL',
    ])
    expect(detail.features?.[0]?.tables).toEqual([{ name: 'Meja 1' }])
    expect(detail.features?.[0]).not.toHaveProperty('cases')

    // A closed UAT is not found, except in an Admin's preview with unsaved choices.
    const s2 = runOf('RUN-S2-20261109')
    s2.is_public = false
    await expect(source.getPublicUat(s2.id)).rejects.toMatchObject({ status: 404 })
    const preview = await source.getPublicUat(s2.id, {
      fields: ['features.list', 'features.cases'],
    })
    expect(preview.fields).toEqual(['features.list', 'features.cases'])
    expect(preview.features?.[0]?.cases?.length).toBeGreaterThan(0)
    // Links printed for a Fase open its latest public UAT.
    expect(await source.findPublicUatOfCycle(fase.id)).toEqual({
      id: runOf('RUN-REG-20261130').id,
    })
  })

  it('never previews for a Pengguna', async () => {
    const { source, runOf } = setup('3', false)
    const s2 = runOf('RUN-S2-20261109')
    s2.is_public = false
    await expect(source.getPublicUat(s2.id, {})).rejects.toMatchObject({ status: 404 })
    await expect(source.getPublicBugReporting(OTHER, true)).rejects.toMatchObject({ status: 404 })
  })

  it('shows the public Bug Reporting of a project with its feature filter', async () => {
    const { db, source } = setup()
    expect((await source.listPublicBugReporting()).map((b) => b.project.code)).toEqual([MAIN])
    const one = await source.getPublicBugReporting(MAIN)
    const bugs = db.defects.filter((d) => d.projectId === '1')
    expect(one).toMatchObject({
      project: { code: MAIN, name: 'Demo Portal Karier' },
      fields: ['bugs.list', 'bugs.code', 'bugs.feature'],
      accept_reports: false,
      bug_count: bugs.length,
    })
    const names = [
      ...new Set(
        bugs.map((d) => db.modules.find((m) => m.id === d.moduleId)?.name).filter(Boolean),
      ),
    ].sort()
    expect(one.features).toEqual(names)
    await expect(source.getPublicBugReporting(OTHER)).rejects.toMatchObject({ status: 404 })

    const page = await source.listPublicBugs(MAIN, { page_size: 100 })
    expect(page.total).toBe(bugs.length)
    expect(page.data[0]).toHaveProperty('bug_code')
    expect(page.data[0]).not.toHaveProperty('reporter')
    const feature = names[0]!
    const filtered = await source.listPublicBugs(MAIN, { feature })
    expect(filtered.total).toBeGreaterThan(0)
    expect(filtered.data.every((b) => b.feature === feature)).toBe(true)
  })

  it('takes public reports once switched on; they show only after an Admin reviewed them', async () => {
    const { db, source } = setup()
    const report = {
      title: 'Tombol daftar tidak bisa diklik',
      description: 'Di halaman daftar akun, tombolnya diam saja.',
      feature: 'Lowongan Kerja',
      reporter_name: 'Warga',
      contact: 'warga@contoh.invalid',
    }
    await expect(source.sendPublicBugReport(MAIN, report)).rejects.toMatchObject({ status: 404 })
    const settings = await source.updateBugReporting(MAIN, {
      is_public: true,
      public_fields: ['bugs.list', 'bugs.reporter', 'features.progress'],
      public_intro: 'Laporkan kendala di sini',
      accept_reports: true,
    })
    expect(settings).toEqual({
      is_public: true,
      public_fields: ['bugs.list', 'bugs.reporter'],
      public_intro: 'Laporkan kendala di sini',
      accept_reports: true,
    })
    expect(await source.getBugReporting(MAIN)).toEqual(settings)
    await expect(
      source.sendPublicBugReport(MAIN, { ...report, title: 'abc' }),
    ).rejects.toMatchObject({ status: 422 })
    const before = (await source.listPublicBugs(MAIN)).total
    expect(await source.sendPublicBugReport(MAIN, report)).toEqual({ received: true })
    expect((await source.listPublicBugs(MAIN)).total).toBe(before)
    const waiting = await source.listPublicReports(MAIN)
    expect(waiting).toHaveLength(1)
    expect(waiting[0]).toMatchObject({
      title: report.title,
      reporter: 'Warga',
      contact: 'warga@contoh.invalid',
      module: { module_code: 'LOKER' },
      scenario: null,
    })
    // A robot filling the hidden field gets the same answer, and nothing is kept.
    await source.sendPublicBugReport(MAIN, { ...report, website: 'http://spam.invalid' })
    expect(await source.listPublicReports(MAIN)).toHaveLength(1)

    await source.reviewPublicReport(MAIN, waiting[0]!.id, { reviewed: true })
    const after = await source.listPublicBugs(MAIN, { page_size: 100 })
    expect(after.total).toBe(before + 1)
    const shown = after.data.find((b) => b.id === waiting[0]!.id)
    expect(shown).toMatchObject({ title: report.title, reporter: 'Warga' })
    expect(shown).not.toHaveProperty('contact')
    // Reviewed, it is a real problem now: not thrown away from here.
    await expect(source.deletePublicReport(MAIN, waiting[0]!.id)).rejects.toMatchObject({
      status: 404,
    })

    await source.sendPublicBugReport(MAIN, {
      title: 'Coba coba saja',
      description: 'Hanya mencoba formulir.',
    })
    const [test] = await source.listPublicReports(MAIN)
    await source.deletePublicReport(MAIN, test!.id)
    expect(await source.listPublicReports(MAIN)).toEqual([])
    expect(db.defects.some((d) => d.id === test!.id)).toBe(false)
  })

  it('slows down a flood of public reports from one device', async () => {
    const { source } = setup()
    await source.updateBugReporting(MAIN, {
      is_public: true,
      public_fields: ['bugs.list'],
      public_intro: null,
      accept_reports: true,
    })
    for (let i = 1; i <= 5; i += 1) {
      await source.sendPublicBugReport(MAIN, {
        title: `Laporan nomor ${i}`,
        description: 'Isi laporan yang cukup panjang.',
      })
    }
    await expect(
      source.sendPublicBugReport(MAIN, {
        title: 'Laporan keenam',
        description: 'Isi laporan yang cukup panjang.',
      }),
    ).rejects.toMatchObject({ status: 429, code: 'RATE_LIMITED' })
  })
})

describe('"Tugas saya"', () => {
  it('lists the open UATs a person takes part in and the group they sit in', async () => {
    const { db, source, tableOf } = setup('3', false)
    const tasks = await source.getMyTasks()
    expect(tasks.runs.map((r) => r.run.name)).toEqual([
      'UAT Pendaftaran',
      'UAT Sprint 2',
      'Regresi Rilis 1.1',
    ])
    expect(tasks.tables).toEqual([])

    // Seated at Meja 3: only the scenarios of its feature, and the table to open.
    const meja3 = tableOf('Meja 3')
    db.participants.find((p) => p.runId === meja3.runId && p.userId === '3')!.tableId = meja3.id
    const seated = await source.getMyTasks()
    expect(seated.tables).toEqual([
      expect.objectContaining({
        table: { id: meja3.id, name: 'Meja 3', table_number: 3 },
        member: expect.objectContaining({ name: 'Demo Penguji 1' }),
        uat: { id: meja3.runId, name: 'UAT Sprint 2' },
        state: 'ACTIVE',
      }),
    ])
    expect(seated.runs.find((r) => r.run.name === 'UAT Sprint 2')?.assigned).toBe(3)
    const opened = await source.joinWorkshopAsMember(meja3.id)
    expect(opened).toMatchObject({
      member_name: 'Demo Penguji 1',
      session: { table: { name: 'Meja 3' } },
    })
  })
})

describe('dashboard and reports', () => {
  it('counts only the UATs a Pengguna takes part in; bug numbers stay project-wide', async () => {
    const { db, source, fase } = setup()
    const all = await source.getDashboard(MAIN)
    // A UAT the Pengguna has nothing to do with.
    const other = await source.createUat(MAIN, {
      cycle_id: fase.id,
      name: 'UAT Tanpa Saya',
      module_ids: [db.modules.find((m) => m.module_code === 'AUTH')!.id],
    })
    db.currentUserId = '3'
    const mine = await source.getDashboard(MAIN)
    expect(mine.runs.map((r) => r.name).sort()).toEqual(all.runs.map((r) => r.name).sort())
    expect(mine.runs.some((r) => r.id === other.id)).toBe(false)
    expect(mine.total_run_cases).toBe(all.total_run_cases)
    expect(mine.open_defects).toBe(all.open_defects)
    await expect(source.getDashboard(MAIN, { run_id: other.id })).rejects.toMatchObject({
      status: 404,
    })
    // The report page is for the people who manage the project.
    await expect(source.getReportOverview(MAIN, {})).rejects.toMatchObject({ status: 403 })

    db.currentUserId = '5'
    const none = await source.getDashboard(MAIN)
    expect(none).toMatchObject({ runs: [], total_run_cases: 0, open_defects: all.open_defects })
  })
})
