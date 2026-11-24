import {
  cyclePublicSchema,
  defectReviewSchema,
  normalizePublicFields,
  phaseFeatureSchema,
  uatCreateSchema,
  uatFeatureAssigneesSchema,
  uatParticipantsAddSchema,
  uatParticipantUpdateSchema,
  uatUpdateSchema,
  workshopFeatureStateSchema,
  workshopTableCreateSchema,
  workshopTableUpdateSchema,
  type ModuleRef,
  type PhaseDto,
  type PhaseFeatureDto,
  type PhaseTreeDto,
  type UatDetailDto,
  type UatFeatureAssignmentDto,
  type UatGroupRef,
  type UatParticipantDto,
  type UatRef,
  type UatSummaryDto,
  type WorkshopBoardDto,
  type WorkshopInboxItem,
} from '@testboard/shared'
import type { MockCase, MockDb, MockParticipant, MockRun, MockTable } from '../mocks/seed'
import type { DataSource } from './data-source'
import {
  byNumericId,
  invalid,
  notFound,
  personFeatureIds,
  problem,
  refuse,
  removeParticipants,
  removeWhere,
  tableOrder,
  uatOrder,
  type WorkshopCore,
  type WorkshopDeps,
} from './mock-workshop'

/**
 * Demo version of the Drive-like structure (ADR 0019), same rules as the API: Fase > Fitur >
 * Skenario, UATs that keep up with the Ready scenarios of their Fase, their people and groups
 * (meja with a table number), the live board and "Masalah masuk". A Pengguna only reaches the
 * UATs they take part in; managing a UAT needs an Admin.
 */
type UatMethods = Pick<
  DataSource,
  | 'getPhaseTree'
  | 'addPhaseFeature'
  | 'listUats'
  | 'getUat'
  | 'createUat'
  | 'updateUat'
  | 'listUatParticipants'
  | 'addUatParticipants'
  | 'updateUatParticipant'
  | 'removeUatParticipant'
  | 'listUatAssignments'
  | 'setFeatureAssignees'
  | 'getWorkshopBoard'
  | 'updateUatPublic'
  | 'updateWorkshopFeature'
  | 'listWorkshopTables'
  | 'createWorkshopTable'
  | 'updateWorkshopTable'
  | 'deleteWorkshopTable'
  | 'getWorkshopSheet'
  | 'listWorkshopInbox'
  | 'reviewWorkshopBug'
>

const OPEN_RUN_STATUSES: readonly string[] = ['PLANNED', 'ACTIVE']

/**
 * Taking part in a UAT: listed as a participant, or given scenarios of it the old way
 * (migration 0015 turned those into participants; an Admin may still assign scenarios).
 */
export function takesPart(db: MockDb, runId: string, userId: string): boolean {
  return (
    db.participants.some((p) => p.runId === runId && p.userId === userId) ||
    db.runCases.some((rc) => rc.runId === runId && rc.assignedTo === userId)
  )
}

/**
 * Recording a result (ADR 0020, "only those listed in the assignment"): a Pengguna answers a
 * scenario assigned to them, or one of a feature of their group or assigned to them by name.
 * Someone without a group no longer gets every feature.
 */
export function mayAnswer(
  db: MockDb,
  projectId: string,
  runCaseId: string,
  userId: string,
): boolean {
  const rc = db.runCases.find((x) => x.id === runCaseId)
  const run = rc ? db.runs.find((r) => r.id === rc.runId && r.projectId === projectId) : undefined
  if (!rc || !run) return false
  if (rc.assignedTo === userId) return true
  const moduleId = db.cases.find((c) => c.id === rc.caseId)?.moduleId
  return Boolean(moduleId) && personFeatureIds(db, run.id, userId).has(moduleId ?? '')
}

/** Empty values first, like MariaDB sorts NULL in ascending order. */
const nullsFirst = (a: string | null | undefined, b: string | null | undefined) =>
  a === b ? 0 : a == null ? -1 : b == null ? 1 : a.localeCompare(b)

export function createMockUat(deps: WorkshopDeps, core: WorkshopCore) {
  const { db, delay, newId, now } = deps

  const iso = (value: string | null | undefined) => (value ? new Date(value).toISOString() : null)

  /** Managing a UAT (people, groups, board) needs run.write; a missing UAT answers 404. */
  const staffUat = (code: string, uatId: string) => {
    const project = deps.project(code)
    deps.requireRole(project.id, 'run.write')
    const run = db.runs.find((r) => r.id === uatId && r.projectId === project.id) ?? notFound()
    return { project, run }
  }

  /** Managers see every UAT; a Pengguna only the ones they take part in (with their group). */
  const viewerIn = (projectId: string) =>
    deps.manages(projectId) ? undefined : deps.people.currentUserId()

  const assertModules = (projectId: string, moduleIds: string[]) => {
    const ids = [...new Set(moduleIds)]
    if (ids.some((id) => !db.modules.some((m) => m.id === id && m.projectId === projectId))) {
      problem(422, 'VALIDATION_ERROR', 'module_ids', 'Module not found in this project')
    }
    return ids
  }

  const nextRunCode = (projectId: string) => {
    const prefix = `RUN-${now().slice(0, 10).replace(/-/g, '')}-`
    const max = db.runs
      .filter((r) => r.projectId === projectId && r.run_code.startsWith(prefix))
      .reduce((m, r) => Math.max(m, Number.parseInt(r.run_code.slice(prefix.length), 10) || 0), 0)
    return `${prefix}${max + 1}`
  }

  // ---- Fase > Fitur > Skenario -------------------------------------------------------------
  const phaseTree = (projectId: string): PhaseTreeDto => {
    const cases = db.cases.filter((c) => c.projectId === projectId && c.case_status !== 'ARCHIVED')
    const runs = db.runs.filter((r) => r.projectId === projectId)
    const phase = (
      id: string | null,
      info: Pick<PhaseDto, 'cycle_code' | 'title' | 'status_code' | 'starts_on' | 'ends_on'>,
    ): PhaseDto => {
      const inPhase = cases.filter((c) => (c.cycleId ?? null) === id)
      const features = new Map<string, PhaseFeatureDto>()
      for (const c of inPhase) {
        const module = core.moduleRef(c.moduleId)
        if (!module) continue
        const feature = features.get(module.id) ?? { module, scenarios: 0, ready: 0 }
        feature.scenarios += 1
        if (c.case_status === 'READY') feature.ready += 1
        features.set(module.id, feature)
      }
      // Empty feature folders an Admin created in this Fase.
      for (const link of db.phaseFeatures.filter((f) => id !== null && f.cycleId === id)) {
        const module = core.moduleRef(link.moduleId)
        if (module && !features.has(module.id)) {
          features.set(module.id, { module, scenarios: 0, ready: 0 })
        }
      }
      const list = [...features.values()].sort((a, b) =>
        a.module.name.localeCompare(b.module.name, 'id'),
      )
      const loose = inPhase.filter((c) => !core.moduleRef(c.moduleId)).length
      return {
        id,
        ...info,
        scenarios: list.reduce((sum, f) => sum + f.scenarios, 0) + loose,
        unsorted: loose,
        uats: runs.filter((r) => (r.cycleId || null) === id).length,
        features: list,
      }
    }
    const cycles = db.cycles
      .filter((cy) => cy.projectId === projectId)
      .sort(
        (a, b) =>
          (a.starts_on ? 0 : 1) - (b.starts_on ? 0 : 1) ||
          (a.starts_on ?? '').localeCompare(b.starts_on ?? '') ||
          byNumericId(a.id, b.id),
      )
    return {
      phases: cycles.map((cy) =>
        phase(cy.id, {
          cycle_code: cy.cycle_code,
          title: cy.title,
          status_code: cy.status_code ?? 'ACTIVE',
          starts_on: cy.starts_on ?? null,
          ends_on: cy.ends_on ?? null,
        }),
      ),
      unassigned: phase(null, {
        cycle_code: null,
        title: null,
        status_code: null,
        starts_on: null,
        ends_on: null,
      }),
    }
  }

  // ---- UATs keep up with their Fase ----------------------------------------------------------
  /**
   * Bring an open UAT up to date: every Ready scenario of its features in its Fase that is not
   * in it yet is added (frozen as a snapshot). A finished or locked UAT never changes.
   */
  const syncUatCases = (runId: string): number => {
    const run = db.runs.find((r) => r.id === runId)
    if (!run || !run.cycleId || !OPEN_RUN_STATUSES.includes(run.status_code)) return 0
    const features = new Set(db.uatFeatures.filter((f) => f.runId === runId).map((f) => f.moduleId))
    const inRun = new Set(db.runCases.filter((rc) => rc.runId === runId).map((rc) => rc.caseId))
    const moduleName = (c: MockCase) => core.moduleRef(c.moduleId)?.name ?? ''
    const cases = db.cases
      .filter(
        (c) =>
          c.cycleId === run.cycleId &&
          c.case_status === 'READY' &&
          features.has(c.moduleId) &&
          !inRun.has(c.id),
      )
      .sort(
        (a, b) =>
          moduleName(a).localeCompare(moduleName(b)) || a.case_code.localeCompare(b.case_code),
      )
    let order = db.runCases
      .filter((rc) => rc.runId === runId)
      .reduce((max, rc) => Math.max(max, rc.sort_order), 0)
    for (const c of cases) {
      order += 1
      db.runCases.push({
        id: newId(),
        runId,
        caseId: c.id,
        assignedTo: null,
        case_version: c.current_version,
        sort_order: order,
        snapshot: deps.snapshotOfCase(c),
      })
    }
    return cases.length
  }

  /** After scenarios of a Fase change: every open UAT of that Fase follows. */
  const syncPhaseUats = (projectId: string, cycleId: string | null) => {
    if (!cycleId) return
    for (const run of db.runs) {
      if (
        run.projectId === projectId &&
        run.cycleId === cycleId &&
        OPEN_RUN_STATUSES.includes(run.status_code)
      ) {
        syncUatCases(run.id)
      }
    }
  }

  /**
   * The features of a UAT: kept features keep their state, removed ones take their untried
   * scenarios with them (scenarios with results always stay), new ones bring their scenarios.
   * A removed feature is no longer assigned to any group or person of the UAT (ADR 0020); a
   * new one is assigned to nobody until an Admin says who works on it.
   */
  const setUatFeatures = (runId: string, moduleIds: string[]) => {
    const wanted = [...new Set(moduleIds)]
    const dropped = new Set(
      db.uatFeatures
        .filter((f) => f.runId === runId && !wanted.includes(f.moduleId))
        .map((f) => f.moduleId),
    )
    removeWhere(db.uatFeatures, (f) => f.runId === runId && dropped.has(f.moduleId))
    if (dropped.size > 0) {
      for (const t of db.tables) {
        if (t.runId === runId) t.moduleIds = t.moduleIds.filter((id) => !dropped.has(id))
      }
      const people = new Set(db.participants.filter((p) => p.runId === runId).map((p) => p.id))
      removeWhere(db.featurePeople, (f) => people.has(f.memberId) && dropped.has(f.moduleId))
    }
    for (const moduleId of wanted) {
      if (!db.uatFeatures.some((f) => f.runId === runId && f.moduleId === moduleId)) {
        db.uatFeatures.push({ runId, moduleId, state: 'OPEN' })
      }
    }
    const tried = new Set(db.executions.map((e) => e.runCaseId))
    removeWhere(
      db.runCases,
      (rc) =>
        rc.runId === runId &&
        !wanted.includes(core.caseOf(rc.caseId)?.moduleId ?? '') &&
        !tried.has(rc.id),
    )
    syncUatCases(runId)
  }

  /**
   * After a scenario lands in a Fase: its feature becomes a folder of that Fase, and every
   * open UAT of the Fase that tests the feature picks it up once it is Ready.
   */
  const followPhase = (testCase: MockCase) => {
    const cycleId = testCase.cycleId
    if (!cycleId) return
    if (
      testCase.moduleId &&
      !db.phaseFeatures.some((f) => f.cycleId === cycleId && f.moduleId === testCase.moduleId)
    ) {
      db.phaseFeatures.push({ cycleId, moduleId: testCase.moduleId })
    }
    if (testCase.case_status === 'READY') syncPhaseUats(testCase.projectId, cycleId)
  }

  // ---- summaries -----------------------------------------------------------------------------
  const uatRef = (run: MockRun): UatRef => {
    const cycle = db.cycles.find((c) => c.id === run.cycleId)
    return {
      id: run.id,
      name: run.name,
      run_code: run.run_code,
      status_code: run.status_code,
      phase: run.cycleId
        ? { id: run.cycleId, cycle_code: cycle?.cycle_code ?? '', title: cycle?.title ?? '' }
        : null,
    }
  }

  const myGroupOf = (run: MockRun, userId: string) => {
    const seat = db.participants.find(
      (p) => p.runId === run.id && p.userId === userId && p.tableId !== null,
    )
    const group = seat ? db.tables.find((t) => t.id === seat.tableId) : undefined
    return group
      ? {
          id: group.id,
          name: group.name,
          table_number: group.tableNumber,
          // The features this group works on (its scenarios are the ones to try).
          modules: core.tableModules(group),
        }
      : null
  }

  const byName = (a: ModuleRef, b: ModuleRef) => a.name.localeCompare(b.name, 'id')

  /** The features a Pengguna works on here: their group's and the ones assigned by name. */
  const myFeaturesOf = (run: MockRun, userId: string): ModuleRef[] =>
    [...personFeatureIds(db, run.id, userId)]
      .map((id) => core.moduleRef(id))
      .filter((m): m is ModuleRef => m !== null)
      .sort(byName)

  const summaryOf = (run: MockRun, viewer?: string): UatSummaryDto => ({
    ...uatRef(run),
    starts_at: run.starts_at,
    ends_at: run.ends_at,
    is_public: Boolean(run.is_public),
    features: db.uatFeatures.filter((f) => f.runId === run.id).length,
    groups: db.tables.filter((t) => t.runId === run.id).length,
    participants: db.participants.filter((p) => p.runId === run.id).length,
    progress: core.uatTotals(run.id),
    ...(viewer ? { my_group: myGroupOf(run, viewer), my_features: myFeaturesOf(run, viewer) } : {}),
  })

  /** One UAT as its page shows it (for a Pengguna: with their own group). */
  const detailOf = (run: MockRun, viewer?: string): UatDetailDto => ({
    ...summaryOf(run, viewer),
    environment_name: run.environment_name || null,
    build_version: run.build_version || null,
    public_fields: core.uatPublicFields(run),
    public_intro: run.public_intro ?? null,
    feature_list: core.uatFeatures(run.id, true),
  })

  // ---- people of a UAT -----------------------------------------------------------------------
  const participantDto = (p: MockParticipant): UatParticipantDto => {
    const group = p.tableId ? db.tables.find((t) => t.id === p.tableId) : undefined
    return {
      id: p.id,
      name: p.name,
      email: p.userId ? deps.people.emailOf(p.userId) : null,
      user_id: p.userId,
      account: core.memberAccount(p),
      group: group ? { id: group.id, name: group.name, table_number: group.tableNumber } : null,
    }
  }

  /** Numbered groups first, then by group, then the order on the group form, then the name. */
  const participantsOf = (runId: string) =>
    db.participants
      .filter((p) => p.runId === runId)
      .map((p) => ({ p, t: p.tableId ? db.tables.find((t) => t.id === p.tableId) : undefined }))
      .sort((a, b) => {
        const an = a.t?.tableNumber ?? null
        const bn = b.t?.tableNumber ?? null
        return (
          (an === null ? 1 : 0) - (bn === null ? 1 : 0) ||
          (an ?? 0) - (bn ?? 0) ||
          nullsFirst(a.t?.name, b.t?.name) ||
          a.p.sortOrder - b.p.sortOrder ||
          a.p.name.localeCompare(b.p.name)
        )
      })
      .map((x) => participantDto(x.p))

  /** A table card's e-mail is never a person (checked before anything is saved). */
  const assertPeople = (people: { email?: string | null }[]) => {
    for (const person of people) {
      const email = person.email?.trim().toLowerCase()
      if (email && db.users.some((u) => u.email === email && u.kind === 'TABLE')) {
        problem(422, 'VALIDATION_ERROR', 'email', 'NOT_A_PERSON')
      }
    }
  }

  /**
   * Put one person into a UAT (and a group): matched by their account when an e-mail is
   * given, otherwise by name. Someone already in the UAT is moved, never added twice; listed
   * again without a group (group_id left out) they keep the group they are in.
   */
  const placeParticipant = (
    projectId: string,
    runId: string,
    person: { name: string; email?: string | null; group_id?: string | null },
    sortOrder = 0,
  ): string => {
    if (person.group_id && !db.tables.some((t) => t.id === person.group_id && t.runId === runId)) {
      problem(422, 'VALIDATION_ERROR', 'group_id', 'Group not found in this UAT')
    }
    const name = person.name.trim().slice(0, 100)
    const userId = person.email ? deps.people.ensurePerson(person.email, name, projectId) : null
    const existing = db.participants.find((p) =>
      userId
        ? p.runId === runId && p.userId === userId
        : p.runId === runId && p.userId === null && p.name.toLowerCase() === name.toLowerCase(),
    )
    if (existing) {
      if (person.group_id !== undefined) {
        existing.tableId = person.group_id ?? null
        existing.sortOrder = sortOrder
      }
      if (existing.userId === null) existing.name = name
      return existing.id
    }
    const created: MockParticipant = {
      id: newId(),
      runId,
      tableId: person.group_id ?? null,
      sortOrder,
      name,
      userId,
    }
    db.participants.push(created)
    return created.id
  }

  /**
   * The people of one group as an Admin lists them: listed people are put in the group (added
   * to the UAT when new); people no longer listed stay in the UAT without a group.
   */
  const saveGroupMembers = (
    projectId: string,
    runId: string,
    tableId: string,
    members: { name: string; email?: string | null }[],
  ) => {
    const kept = members.map((member, index) =>
      placeParticipant(
        projectId,
        runId,
        { name: member.name, email: member.email ?? null, group_id: tableId },
        index,
      ),
    )
    for (const p of db.participants) {
      if (p.tableId === tableId && !kept.includes(p.id)) p.tableId = null
    }
  }

  // ---- who works on each feature (ADR 0020) --------------------------------------------------
  const groupRef = (t: MockTable): UatGroupRef => ({
    id: t.id,
    name: t.name,
    table_number: t.tableNumber,
  })
  /** By table number (none last), then by name. */
  const byNumberThenName = (a: MockTable, b: MockTable) =>
    (a.tableNumber === null ? 1 : 0) - (b.tableNumber === null ? 1 : 0) ||
    (a.tableNumber ?? 0) - (b.tableNumber ?? 0) ||
    a.name.localeCompare(b.name)

  const assignmentOf = (runId: string, module: ModuleRef): UatFeatureAssignmentDto => {
    const listed = new Set(
      db.featurePeople.filter((f) => f.moduleId === module.id).map((f) => f.memberId),
    )
    return {
      module,
      groups: db.tables
        .filter((t) => t.runId === runId && t.moduleIds.includes(module.id))
        .sort(byNumberThenName)
        .map(groupRef),
      people: db.participants
        .filter((p) => p.runId === runId && listed.has(p.id))
        .sort((a, b) => a.name.localeCompare(b.name) || byNumericId(a.id, b.id))
        .map((p) => {
          const group = p.tableId ? db.tables.find((t) => t.id === p.tableId) : undefined
          return {
            id: p.id,
            name: p.name,
            user_id: p.userId,
            group: group ? groupRef(group) : null,
          }
        }),
    }
  }

  /** The features of a UAT that still exist, by name. */
  const uatModules = (runId: string) =>
    db.uatFeatures
      .filter((f) => f.runId === runId)
      .map((f) => core.moduleRef(f.moduleId))
      .filter((m): m is ModuleRef => m !== null)
      .sort(byName)

  // ---- groups (kelompok / meja) --------------------------------------------------------------
  const groupsOf = (runId: string) => db.tables.filter((t) => t.runId === runId).sort(tableOrder)
  const groupIn = (runId: string, tableId: string) =>
    db.tables.find((t) => t.id === tableId && t.runId === runId) ?? notFound()
  /** Group names are unique per UAT (case does not matter, like the database). */
  const assertFreeName = (runId: string, name: string, self?: string) => {
    const key = name.toLowerCase()
    if (db.tables.some((t) => t.runId === runId && t.id !== self && t.name.toLowerCase() === key)) {
      problem(409, 'CONFLICT', 'name', 'Already used')
    }
  }

  /** Last answers, problems and "+1" from the groups of this UAT (newest first). */
  const recentOf = (runId: string): WorkshopBoardDto['recent'] => {
    const groups = db.tables.filter((t) => t.runId === runId)
    const users = new Set(groups.map((t) => t.userId))
    const nameOf = (userId: string) => groups.find((t) => t.userId === userId)?.name ?? null
    const latest15 = <T extends { at: string; key: string }>(items: T[]) =>
      items.sort((a, b) => b.at.localeCompare(a.at) || byNumericId(b.key, a.key)).slice(0, 15)
    const results = latest15(
      db.executions
        .filter((e) => users.has(e.testerId))
        .map((e) => ({
          key: e.id,
          at: e.tested_at,
          kind: 'RESULT' as const,
          table_name: nameOf(e.testerId),
          tester_name: e.legacyTester ?? null,
          title: core.caseOf(core.runCaseOf(e.runCaseId)?.caseId)?.title ?? '',
          status: e.result_status,
        })),
    )
    const bugs = latest15(
      db.defects
        .filter((d) => users.has(d.reportedBy))
        .map((d) => ({
          key: d.id,
          at: d.created_at,
          kind: 'BUG' as const,
          table_name: nameOf(d.reportedBy),
          tester_name: d.legacyReporterName ?? null,
          title: d.title,
          status: null,
        })),
    )
    const confirms = latest15(
      core.confirmationsBy(users).map((c, index) => ({
        key: String(index),
        at: c.at,
        kind: 'CONFIRM' as const,
        table_name: nameOf(c.userId),
        tester_name: c.testerName,
        title: db.defects.find((d) => d.id === c.defectId)?.title ?? '',
        status: null,
      })),
    )
    return [...results, ...bugs, ...confirms]
      .map(({ key: _key, ...item }) => item)
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, 15)
  }

  // ---- methods -------------------------------------------------------------------------------
  const methods: UatMethods = {
    getPhaseTree: (code) =>
      delay(() => {
        const project = deps.project(code)
        deps.requireRole(project.id, 'case.read')
        return phaseTree(project.id)
      }),

    /** A feature folder in a Fase: an existing feature of the project, or a new one. */
    addPhaseFeature: (code, cycleId, input) =>
      delay(() => {
        const project = deps.project(code)
        deps.requireRole(project.id, 'module.manage')
        const parsed = phaseFeatureSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        if (!db.cycles.some((cy) => cy.id === cycleId && cy.projectId === project.id)) notFound()
        let feature = db.modules.find(
          (m) => m.projectId === project.id && m.module_code === data.module_code,
        )
        if (!feature) {
          if (!data.name) {
            return problem(422, 'VALIDATION_ERROR', 'name', 'A new feature needs a name')
          }
          feature = {
            id: newId(),
            projectId: project.id,
            module_code: data.module_code,
            name: data.name,
          }
          db.modules.push(feature)
        }
        const moduleId = feature.id
        if (!db.phaseFeatures.some((f) => f.cycleId === cycleId && f.moduleId === moduleId)) {
          db.phaseFeatures.push({ cycleId, moduleId })
        }
        return phaseTree(project.id)
      }),

    listUats: (code) =>
      delay(() => {
        const project = deps.project(code)
        deps.requireRole(project.id, 'project.read')
        const viewer = viewerIn(project.id)
        return db.runs
          .filter((r) => r.projectId === project.id && (!viewer || takesPart(db, r.id, viewer)))
          .sort(uatOrder)
          .map((run) => summaryOf(run, viewer))
      }),

    getUat: (code, uatId) =>
      delay(() => {
        const project = deps.project(code)
        deps.requireRole(project.id, 'project.read')
        const viewer = viewerIn(project.id)
        const run = db.runs.find((r) => r.id === uatId && r.projectId === project.id)
        // Someone else's UAT answers like a missing one (no existence leak).
        if (!run || (viewer && !takesPart(db, run.id, viewer))) return notFound()
        return detailOf(run, viewer)
      }),

    createUat: (code, input) =>
      delay(() => {
        const project = deps.project(code)
        deps.requireRole(project.id, 'run.write')
        const parsed = uatCreateSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        if (!db.cycles.some((cy) => cy.id === data.cycle_id && cy.projectId === project.id)) {
          problem(422, 'VALIDATION_ERROR', 'cycle_id', 'Cycle not found in this project')
        }
        const moduleIds = assertModules(project.id, data.module_ids)
        const run: MockRun = {
          id: newId(),
          projectId: project.id,
          cycleId: data.cycle_id,
          run_code: nextRunCode(project.id),
          name: data.name,
          environment_name: '',
          build_version: '',
          environment_url: '',
          status_code: 'PLANNED',
          starts_at: iso(data.starts_at),
          ends_at: iso(data.ends_at),
          is_public: false,
          public_fields: [],
          public_intro: null,
        }
        db.runs.push(run)
        setUatFeatures(run.id, moduleIds)
        return detailOf(run)
      }),

    updateUat: (code, uatId, input) =>
      delay(() => {
        const project = deps.project(code)
        deps.requireRole(project.id, 'run.write')
        const parsed = uatUpdateSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        const moduleIds = data.module_ids ? assertModules(project.id, data.module_ids) : null
        const run = db.runs.find((r) => r.id === uatId && r.projectId === project.id) ?? notFound()
        if (run.status_code === 'LOCKED') {
          refuse(409, 'CONFLICT', 'The UAT is locked and cannot be changed.')
        }
        if (data.name) run.name = data.name
        if (data.starts_at !== undefined) run.starts_at = iso(data.starts_at)
        if (data.ends_at !== undefined) run.ends_at = iso(data.ends_at)
        if (moduleIds) setUatFeatures(run.id, moduleIds)
        return detailOf(run)
      }),

    listUatParticipants: (code, uatId) => delay(() => participantsOf(staffUat(code, uatId).run.id)),

    addUatParticipants: (code, uatId, input) =>
      delay(() => {
        const { project, run } = staffUat(code, uatId)
        const parsed = uatParticipantsAddSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        assertPeople(parsed.data.people)
        parsed.data.people.forEach((person, index) => {
          placeParticipant(project.id, run.id, person, index)
        })
        return participantsOf(run.id)
      }),

    updateUatParticipant: (code, uatId, participantId, input) =>
      delay(() => {
        const { run } = staffUat(code, uatId)
        const parsed = uatParticipantUpdateSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        const p =
          db.participants.find((x) => x.id === participantId && x.runId === run.id) ?? notFound()
        if (data.group_id && !db.tables.some((t) => t.id === data.group_id && t.runId === run.id)) {
          problem(422, 'VALIDATION_ERROR', 'group_id', 'Group not found in this UAT')
        }
        if (data.group_id !== undefined) p.tableId = data.group_id ?? null
        if (data.name !== undefined && p.userId === null) p.name = data.name
        return participantDto(p)
      }),

    removeUatParticipant: (code, uatId, participantId) =>
      delay(() => {
        const { run } = staffUat(code, uatId)
        const p =
          db.participants.find((x) => x.id === participantId && x.runId === run.id) ?? notFound()
        // Their features assigned by name go with them.
        removeParticipants(db, (x) => x.id === p.id)
      }),

    /** Who works on each feature of a UAT: groups and people (ADR 0020). */
    listUatAssignments: (code, uatId) =>
      delay(() => {
        const { run } = staffUat(code, uatId)
        return uatModules(run.id).map((module) => assignmentOf(run.id, module))
      }),

    /**
     * The whole assignment of one feature, like sharing a folder: the groups and people listed
     * work on it, everyone else of the UAT no longer does.
     */
    setFeatureAssignees: (code, uatId, moduleId, input) =>
      delay(() => {
        const { run } = staffUat(code, uatId)
        const parsed = uatFeatureAssigneesSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const module =
          (db.uatFeatures.some((f) => f.runId === run.id && f.moduleId === moduleId)
            ? core.moduleRef(moduleId)
            : null) ?? problem(422, 'VALIDATION_ERROR', 'module_id', 'Feature not in this UAT')
        const groupIds = new Set(parsed.data.group_ids)
        const memberIds = new Set(parsed.data.member_ids)
        const groups = db.tables.filter((t) => t.runId === run.id)
        const people = db.participants.filter((p) => p.runId === run.id)
        if ([...groupIds].some((id) => !groups.some((t) => t.id === id))) {
          problem(422, 'VALIDATION_ERROR', 'group_ids', 'Group not found in this UAT')
        }
        if ([...memberIds].some((id) => !people.some((p) => p.id === id))) {
          problem(422, 'VALIDATION_ERROR', 'member_ids', 'Person not found in this UAT')
        }
        for (const t of groups) {
          const has = t.moduleIds.includes(module.id)
          if (groupIds.has(t.id) && !has) t.moduleIds = [...t.moduleIds, module.id]
          if (!groupIds.has(t.id) && has) t.moduleIds = t.moduleIds.filter((id) => id !== module.id)
        }
        const everyone = new Set(people.map((p) => p.id))
        removeWhere(
          db.featurePeople,
          (f) => f.moduleId === module.id && everyone.has(f.memberId) && !memberIds.has(f.memberId),
        )
        for (const memberId of memberIds) {
          if (!db.featurePeople.some((f) => f.memberId === memberId && f.moduleId === module.id)) {
            db.featurePeople.push({ memberId, moduleId: module.id })
          }
        }
        return assignmentOf(run.id, module)
      }),

    getWorkshopBoard: (code, uatId) =>
      delay((): WorkshopBoardDto => {
        const { project, run } = staffUat(code, uatId)
        const groups = groupsOf(run.id)
        const users = new Set(groups.map((t) => t.userId))
        const bugs = core.uatBugs(project.id, run.id)
        return {
          uat: {
            ...uatRef(run),
            is_public: Boolean(run.is_public),
            public_fields: core.uatPublicFields(run),
            public_intro: run.public_intro ?? null,
          },
          totals: core.uatTotals(run.id),
          bugs: {
            total: bugs.length,
            to_review: bugs.filter((d) => core.tableOfUser(d.reportedBy) && !d.reviewedAt).length,
            confirmations: core.confirmationsBy(users).length,
          },
          tables: groups.map(core.tableDto).map((t) => ({
            id: t.id,
            name: t.name,
            table_number: t.table_number,
            member_names: t.member_names,
            state: t.state,
            modules: t.modules,
            progress: t.progress,
            bugs: t.open_bugs,
            last_activity_at: t.last_activity_at,
          })),
          features: core.uatFeatures(run.id, true),
          recent: recentOf(run.id),
        }
      }),

    updateUatPublic: (code, uatId, input) =>
      delay(() => {
        const { run } = staffUat(code, uatId)
        const parsed = cyclePublicSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        // Problems are shown by Bug Reporting now; a UAT keeps its own fields only.
        const fields = normalizePublicFields(parsed.data.public_fields).filter(
          (f) => !f.startsWith('bugs.'),
        )
        run.is_public = parsed.data.is_public
        run.public_fields = fields
        run.public_intro = parsed.data.public_intro ?? null
        return {
          is_public: parsed.data.is_public,
          public_fields: fields,
          public_intro: run.public_intro,
        }
      }),

    updateWorkshopFeature: (code, uatId, input) =>
      delay(() => {
        const { run } = staffUat(code, uatId)
        const parsed = workshopFeatureStateSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const feature =
          db.uatFeatures.find((f) => f.runId === run.id && f.moduleId === parsed.data.module_id) ??
          problem(422, 'VALIDATION_ERROR', 'module_id', 'Feature not in this UAT')
        feature.state = parsed.data.state_code
        return core.uatFeatures(run.id, true)
      }),

    listWorkshopTables: (code, uatId) =>
      delay(() => groupsOf(staffUat(code, uatId).run.id).map(core.tableDto)),

    createWorkshopTable: (code, uatId, input) =>
      delay(() => {
        const { project, run } = staffUat(code, uatId)
        // A group needs its UAT to sit in a Fase.
        const cycleId =
          run.cycleId || problem(422, 'VALIDATION_ERROR', 'cycle_id', 'This UAT has no Fase')
        const parsed = workshopTableCreateSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        const moduleIds = assertModules(project.id, data.module_ids)
        assertFreeName(run.id, data.name)
        assertPeople(data.members)
        // The group signs in as its own account: no password, no e-mail login (ADR 0016).
        const userId = newId()
        const t: MockTable = {
          id: newId(),
          projectId: project.id,
          cycleId,
          runId: run.id,
          userId,
          name: data.name,
          tableNumber: data.table_number ?? null,
          moduleIds,
          code: core.freeCode(),
          validFrom: iso(data.valid_from),
          validUntil: iso(data.valid_until) ?? data.valid_until,
          revokedAt: null,
        }
        db.tables.push(t)
        core.ensureCardAccount(t)
        // People with an e-mail become User accounts right here (ADR 0018).
        saveGroupMembers(project.id, run.id, t.id, data.members)
        return core.tableDto(t)
      }),

    updateWorkshopTable: (code, uatId, tableId, input) =>
      delay(() => {
        const { project, run } = staffUat(code, uatId)
        const parsed = workshopTableUpdateSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        const moduleIds = data.module_ids ? assertModules(project.id, data.module_ids) : null
        const t = groupIn(run.id, tableId)
        const validFrom = data.valid_from === undefined ? t.validFrom : iso(data.valid_from)
        const validUntil = (data.valid_until && iso(data.valid_until)) || t.validUntil
        if (validFrom && Date.parse(validFrom) >= Date.parse(validUntil)) {
          problem(422, 'VALIDATION_ERROR', 'valid_until', 'The card must end after it starts')
        }
        if (data.name) assertFreeName(run.id, data.name, t.id)
        if (data.members) assertPeople(data.members)
        if (data.name) {
          t.name = data.name
          const account = db.users.find((u) => u.id === t.userId)
          if (account) account.display_name = data.name
        }
        if (data.table_number !== undefined) t.tableNumber = data.table_number ?? null
        if (moduleIds) t.moduleIds = moduleIds
        t.validFrom = validFrom
        t.validUntil = validUntil
        // A new code or a blocked card signs every device of this group out right away.
        if (data.regenerate_code) {
          t.code = core.freeCode()
          core.endSessionOf(t.id)
        }
        if (data.revoked === true) {
          t.revokedAt = t.revokedAt ?? now()
          core.endSessionOf(t.id)
        }
        if (data.revoked === false) t.revokedAt = null
        if (data.members) saveGroupMembers(project.id, run.id, t.id, data.members)
        return core.tableDto(t)
      }),

    /** Remove a group that never answered anything; one with answers can only be blocked. */
    deleteWorkshopTable: (code, uatId, tableId) =>
      delay(() => {
        const { run } = staffUat(code, uatId)
        const t = groupIn(run.id, tableId)
        const used =
          db.executions.some((e) => e.testerId === t.userId) ||
          db.defects.some((d) => d.reportedBy === t.userId) ||
          core.confirmationsBy(new Set([t.userId])).length > 0
        if (used) problem(409, 'CONFLICT', 'table', 'HAS_ACTIVITY')
        // Its people stay in the UAT without a group; the card's account goes with the group.
        for (const p of db.participants) if (p.tableId === t.id) p.tableId = null
        removeWhere(db.tables, (x) => x.id === t.id)
        removeWhere(db.users, (u) => u.id === t.userId && u.kind === 'TABLE')
        core.endSessionOf(t.id)
      }),

    /** Everything a paper backup sheet for one group needs (cetak lembar cadangan). */
    getWorkshopSheet: (code, uatId, tableId) =>
      delay(() => {
        const { run } = staffUat(code, uatId)
        const table = core.tableDto(groupIn(run.id, tableId))
        return {
          table,
          features: table.modules.map((module) => ({
            module,
            cases: core.casesOf(run.id, module.id, null),
          })),
        }
      }),

    /** "Masalah masuk": problems from groups waiting for a facilitator. */
    listWorkshopInbox: (code, uatId) =>
      delay(() => {
        const { project, run } = staffUat(code, uatId)
        const all = core.uatBugs(project.id, run.id)
        const runCaseIds = new Set(core.runCasesOf(run.id).map((rc) => rc.id))
        return all
          .filter((d) => core.tableOfUser(d.reportedBy) && !d.reviewedAt)
          .slice(0, 200)
          .map((d): WorkshopInboxItem => {
            const rc = d.executionIds
              .map((id) => core.runCaseOf(db.executions.find((e) => e.id === id)?.runCaseId))
              .find((x) => x !== undefined && runCaseIds.has(x.id))
            const c = rc ? core.caseOf(rc.caseId) : undefined
            return {
              ...core.bugDto(d, null),
              priority_code: d.priority_code,
              scenario:
                rc && c ? { run_case_id: rc.id, case_code: c.case_code, title: c.title } : null,
              similar: core.similarTo(core.bugText(d), all, d.id),
            }
          })
      }),

    reviewWorkshopBug: (code, uatId, defectId, input) =>
      delay(() => {
        const { project, run } = staffUat(code, uatId)
        const parsed = defectReviewSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        core.reviewDefect(project.id, defectId, parsed.data)
        const d =
          core.uatBugs(project.id, run.id, true).find((x) => x.id === defectId) ?? notFound()
        return core.bugDto(d, null)
      }),
  }

  return { methods, followPhase, syncPhaseUats }
}
