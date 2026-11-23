import {
  countResult,
  cyclePublicSchema,
  defectReviewSchema,
  emptyCounts,
  normalizePublicFields,
  tableState,
  textCloseness,
  workshopBugSchema,
  workshopConfirmSchema,
  workshopFeatureStateSchema,
  workshopJoinSchema,
  workshopMembersSchema,
  workshopResultSchema,
  workshopTableCreateSchema,
  workshopTableUpdateSchema,
  type ApiErrorCode,
  type CurrentUser,
  type ExecutionStatus,
  type ModuleRef,
  type Permission,
  type PublicBugDto,
  type PublicCycleSummary,
  type PublicField,
  type ResultCounts,
  type WorkshopBoardDto,
  type WorkshopBugDto,
  type WorkshopCaseDto,
  type WorkshopFeatureDto,
  type WorkshopFeatureState,
  type WorkshopSessionDto,
  type WorkshopTableDto,
} from '@testboard/shared'
import type { MockCycle, MockDb, MockDefect, MockExecution, MockProject } from '../mocks/seed'
import { ApiClientError } from './api-client'
import type { DataSource, UploadOptions, UploadResult } from './data-source'

/**
 * Demo version of Mode Workshop (ADR 0016), same rules as the API: public pages show only
 * switched-on fields, table cards sign in with a 6-digit code and only reach Mode Mudah,
 * answers go through the normal test attempts and bugs.
 */
type WorkshopMethods = Pick<
  DataSource,
  | 'listPublicCycles'
  | 'getPublicCycle'
  | 'listPublicBugs'
  | 'publicFileUrl'
  | 'joinWorkshop'
  | 'getWorkshopSession'
  | 'updateWorkshopMembers'
  | 'listWorkshopCases'
  | 'saveWorkshopResult'
  | 'listWorkshopBugs'
  | 'reportWorkshopBug'
  | 'confirmWorkshopBug'
  | 'uploadWorkshopFile'
  | 'getWorkshopFileStatus'
  | 'workshopFileUrl'
  | 'getWorkshopBoard'
  | 'updateCyclePublic'
  | 'updateWorkshopFeature'
  | 'listWorkshopTables'
  | 'createWorkshopTable'
  | 'updateWorkshopTable'
  | 'deleteWorkshopTable'
  | 'getWorkshopSheet'
  | 'listWorkshopInbox'
  | 'reviewWorkshopBug'
>

export interface MockTable {
  id: string
  projectId: string
  cycleId: string
  runId: string | null
  userId: string
  name: string
  members: string[]
  moduleIds: string[]
  code: string
  validFrom: string | null
  validUntil: string
  revokedAt: string | null
}

interface Confirmation {
  defectId: string
  userId: string
  testerName: string | null
  note: string | null
  at: string
}

export interface WorkshopDeps {
  db: MockDb
  delay: <T>(value: () => T) => Promise<T>
  newId: () => string
  now: () => string
  /** Project of the signed-in staff member (404 when not a member). */
  project: (code: string) => MockProject
  requireRole: (projectId: string, permission: Permission) => void
  nextBugCode: (project: MockProject) => string
  storeUpload: (
    projectId: string,
    file: File,
    options: UploadOptions,
    uploadedBy: string,
  ) => Promise<UploadResult>
  fileUrl: (fileId: string) => string
}

const notFound = (): never => {
  throw new ApiClientError(404, 'NOT_FOUND', 'Not found', 'mock-request')
}
const problem = (status: number, code: ApiErrorCode, field: string, message: string): never => {
  throw new ApiClientError(status, code, message, 'mock-request', [{ field, message }])
}
const invalid = (issues: { path: PropertyKey[]; message: string }[]): never => {
  throw new ApiClientError(
    422,
    'VALIDATION_ERROR',
    'The submitted data is invalid.',
    'mock-request',
    issues.map((issue) => ({ field: issue.path.map(String).join('.'), message: issue.message })),
  )
}
const DONE_STATUSES = ['CLOSED', 'VERIFIED', 'WONT_FIX']

export function createMockWorkshop(deps: WorkshopDeps) {
  const { db, delay, newId, now } = deps
  const tables: MockTable[] = []
  const featureStates = new Map<string, WorkshopFeatureState>()
  const confirmations: Confirmation[] = []
  let sessionTableId: string | null = null
  let codeSeed = 314159

  // ---- helpers ----------------------------------------------------------------------------
  const cycleOf = (projectId: string, cycleId: string) =>
    db.cycles.find((c) => c.id === cycleId && c.projectId === projectId) ?? notFound()
  const moduleRef = (moduleId: string | null): ModuleRef | null => {
    const m = db.modules.find((x) => x.id === moduleId)
    return m ? { id: m.id, module_code: m.module_code, name: m.name } : null
  }
  const latestOf = (runCaseId: string): MockExecution | undefined =>
    db.executions
      .filter((e) => e.runCaseId === runCaseId)
      .sort((a, b) => b.attempt_number - a.attempt_number)[0]
  const statusOf = (runCaseId: string): ExecutionStatus =>
    latestOf(runCaseId)?.result_status ?? 'NOT_RUN'
  const caseOf = (caseId: string) => db.cases.find((c) => c.id === caseId)
  const runCasesOfCycle = (cycleId: string) => {
    const runIds = new Set(db.runs.filter((r) => r.cycleId === cycleId).map((r) => r.id))
    return db.runCases.filter((rc) => runIds.has(rc.runId))
  }
  const fields = (cycle: MockCycle): PublicField[] =>
    normalizePublicFields(cycle.public_fields ?? [])
  const tableOfUser = (userId: string) => tables.find((t) => t.userId === userId)
  const stateOf = (t: MockTable) =>
    tableState({ valid_from: t.validFrom, valid_until: t.validUntil, revoked_at: t.revokedAt })

  const tableRunCases = (t: MockTable, moduleId?: string) =>
    db.runCases
      .filter((rc) => rc.runId === t.runId)
      .filter((rc) => {
        const c = caseOf(rc.caseId)
        return c && t.moduleIds.includes(c.moduleId) && (!moduleId || c.moduleId === moduleId)
      })
      .sort((a, b) => a.sort_order - b.sort_order)

  const progressOf = (runCaseIds: string[]): ResultCounts => {
    const counts = emptyCounts()
    for (const id of runCaseIds) countResult(counts, statusOf(id))
    return counts
  }

  const cycleFeatures = (cycleId: string, includeHidden: boolean): WorkshopFeatureDto[] => {
    const byModule = new Map<string, string[]>()
    for (const rc of runCasesOfCycle(cycleId)) {
      const c = caseOf(rc.caseId)
      if (!c) continue
      byModule.set(c.moduleId, [...(byModule.get(c.moduleId) ?? []), rc.id])
    }
    return [...byModule.entries()]
      .map(([moduleId, ids]) => ({
        module: moduleRef(moduleId) ?? { id: moduleId, module_code: '', name: '' },
        state: featureStates.get(`${cycleId}:${moduleId}`) ?? 'OPEN',
        progress: progressOf(ids),
      }))
      .filter((f) => includeHidden || f.state !== 'HIDDEN')
      .sort((a, b) => a.module.name.localeCompare(b.module.name, 'id'))
  }

  const cycleTotals = (cycleId: string) => progressOf(runCasesOfCycle(cycleId).map((rc) => rc.id))

  const tableDto = (t: MockTable): WorkshopTableDto => {
    const cycle = db.cycles.find((c) => c.id === t.cycleId)!
    const run = db.runs.find((r) => r.id === t.runId)
    const bugs = db.defects.filter((d) => d.reportedBy === t.userId)
    const answers = db.executions.filter((e) => e.testerId === t.userId)
    const last = [...bugs.map((b) => b.created_at), ...answers.map((a) => a.tested_at)]
      .sort()
      .at(-1)
    return {
      id: t.id,
      name: t.name,
      cycle: { id: cycle.id, cycle_code: cycle.cycle_code, title: cycle.title },
      run: run
        ? { id: run.id, run_code: run.run_code, name: run.name, status_code: run.status_code }
        : null,
      modules: t.moduleIds.map((id) => moduleRef(id)).filter((m): m is ModuleRef => m !== null),
      member_names: [...t.members],
      access_code: t.code,
      valid_from: t.validFrom,
      valid_until: t.validUntil,
      revoked_at: t.revokedAt,
      state: stateOf(t),
      progress: progressOf(tableRunCases(t).map((rc) => rc.id)),
      open_bugs: bugs.length,
      last_activity_at: last ?? null,
      devices: sessionTableId === t.id ? 1 : 0,
    }
  }

  const confirmationsOf = (d: MockDefect) =>
    confirmations.filter((c) => c.defectId === d.id).length +
    db.defects.filter((x) => x.duplicateOf === d.id).length

  const bugDto = (d: MockDefect, viewer: string | null): WorkshopBugDto => {
    const table = tableOfUser(d.reportedBy)
    return {
      id: d.id,
      bug_code: d.bug_code,
      title: d.title,
      description: d.actual_behavior || d.description || null,
      module: moduleRef(d.moduleId),
      status_code: d.status_code,
      severity_code: d.severity_code,
      reported_at: d.reportedAt ?? d.created_at,
      table_name: table?.name ?? null,
      tester_name: table ? (d.legacyReporterName ?? null) : null,
      confirmations: confirmationsOf(d),
      confirmed_by_me:
        viewer !== null &&
        (d.reportedBy === viewer ||
          confirmations.some((c) => c.defectId === d.id && c.userId === viewer)),
      duplicate_of: d.duplicateOf
        ? {
            id: d.duplicateOf,
            bug_code: db.defects.find((x) => x.id === d.duplicateOf)?.bug_code ?? '',
          }
        : null,
      files: (d.files ?? []).map((link) => {
        const f = db.files.find((x) => x.id === link.fileId)
        return {
          id: link.fileId,
          original_filename: f?.original_filename ?? '',
          ready: f?.processing_status === 'READY' && f.scan_status === 'CLEAN',
        }
      }),
    }
  }

  const cycleBugs = (projectId: string, cycleId: string, includeDuplicates = false) =>
    db.defects
      .filter((d) => d.projectId === projectId && d.cycleId === cycleId)
      .filter((d) => includeDuplicates || !d.duplicateOf)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))

  const tableUser = (t: MockTable): CurrentUser => ({
    id: t.userId,
    display_name: t.name,
    email: '',
    preferred_locale: 'id',
    is_super_admin: false,
    projects: [],
    account_kind: 'TABLE',
  })

  /** Table of the current card session; a closed card ends the session. */
  const ctx = () => {
    const t = tables.find((x) => x.id === sessionTableId)
    const project = db.projects.find((p) => p.id === t?.projectId)
    if (!t || !project || stateOf(t) !== 'ACTIVE' || project.archived) {
      sessionTableId = null
      return problem(401, 'UNAUTHENTICATED', 'table', t ? stateOf(t) : 'REVOKED')
    }
    const cycle = db.cycles.find((c) => c.id === t.cycleId)!
    const run = db.runs.find((r) => r.id === t.runId) ?? null
    return { t, project, cycle, run }
  }

  const sessionDto = (): WorkshopSessionDto => {
    const { t, project, cycle, run } = ctx()
    return {
      table: { id: t.id, name: t.name, member_names: [...t.members] },
      project: { code: project.project_code, name: project.name },
      cycle: { id: cycle.id, cycle_code: cycle.cycle_code, title: cycle.title },
      run: run ? { id: run.id, name: run.name, status_code: run.status_code } : null,
      features: t.moduleIds
        .map((id) => moduleRef(id))
        .filter((m): m is ModuleRef => m !== null)
        .map((module) => ({
          module,
          state: 'OPEN' as const,
          progress: progressOf(tableRunCases(t, module.id).map((rc) => rc.id)),
        })),
      valid_until: t.validUntil,
    }
  }

  const casesOf = (runId: string, moduleId: string, viewer: string | null) =>
    db.runCases
      .filter((rc) => rc.runId === runId && caseOf(rc.caseId)?.moduleId === moduleId)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((rc): WorkshopCaseDto => {
        const c = caseOf(rc.caseId)!
        const snap = rc.snapshot
        const latest = latestOf(rc.id)
        const answeredBy = latest ? tableOfUser(latest.testerId) : undefined
        return {
          run_case_id: rc.id,
          case_code: snap?.case_code ?? c.case_code,
          title: snap?.title ?? c.title,
          actor_label: snap?.actor_label ?? c.actor_label ?? null,
          preconditions: snap?.preconditions ?? c.preconditions ?? null,
          steps: snap?.steps?.length ? snap.steps.map((s) => s.instruction) : [...c.steps],
          expected_result: snap?.expected_result ?? c.expected_result ?? null,
          latest: latest
            ? {
                status: latest.result_status,
                table_name:
                  answeredBy?.name ??
                  db.users.find((u) => u.id === latest.testerId)?.display_name ??
                  null,
                tester_name: latest.legacyTester ?? null,
                note: latest.actual_result ?? latest.notes ?? null,
                at: latest.tested_at,
                mine: viewer !== null && latest.testerId === viewer,
              }
            : null,
          bugs: db.defects
            .filter(
              (d) =>
                !d.duplicateOf &&
                d.executionIds.some(
                  (id) => db.executions.find((e) => e.id === id)?.runCaseId === rc.id,
                ),
            )
            .map((d) => ({
              id: d.id,
              bug_code: d.bug_code,
              title: d.title,
              status_code: d.status_code,
            })),
        }
      })

  const assertFiles = (projectId: string, refs: { file_id: string }[] | undefined) => {
    for (const ref of refs ?? []) {
      const f = db.files.find(
        (x) => x.id === ref.file_id && x.projectId === projectId && !x.deleted,
      )
      if (!f || f.processing_status !== 'READY' || f.scan_status !== 'CLEAN') {
        problem(422, 'VALIDATION_ERROR', 'files', 'File is not ready')
      }
    }
    return (refs ?? []).map((r) => ({ fileId: r.file_id, caption: null, step_number: null }))
  }

  const newDefect = (
    project: MockProject,
    t: MockTable,
    values: Partial<MockDefect> & { title: string; testerName: string | null },
  ): MockDefect => {
    const at = now()
    const defect: MockDefect = {
      id: newId(),
      projectId: project.id,
      moduleId: values.moduleId ?? null,
      cycleId: t.cycleId,
      legacyReporterName: values.testerName,
      bug_code: deps.nextBugCode(project),
      title: values.title,
      description: '',
      steps_to_reproduce: values.steps_to_reproduce ?? '',
      expected_behavior: values.expected_behavior ?? '',
      actual_behavior: values.actual_behavior ?? '',
      severity_code: 'MEDIUM',
      priority_code: 'MEDIUM',
      status_code: 'OPEN',
      source_kind: 'UAT',
      environment_name: '',
      build_version: '',
      browser_name: '',
      fixed_in_version: null,
      reportedBy: t.userId,
      assignedTo: null,
      created_at: at,
      updated_at: at,
      executionIds: values.executionIds ?? [],
      history: [{ from: null, to: 'OPEN', by: t.userId, comment: null, at }],
      comments: [],
      files: values.files ?? [],
    }
    db.defects.push(defect)
    return defect
  }

  const confirm = (
    defect: MockDefect,
    t: MockTable,
    input: {
      note?: string | null
      tester_name?: string | null
      files: { fileId: string; caption: null; step_number: null }[]
    },
  ) => {
    const existing = confirmations.find((c) => c.defectId === defect.id && c.userId === t.userId)
    if (existing) {
      existing.testerName = input.tester_name ?? null
      existing.note = input.note ?? existing.note
    } else {
      confirmations.push({
        defectId: defect.id,
        userId: t.userId,
        testerName: input.tester_name ?? null,
        note: input.note ?? null,
        at: now(),
      })
    }
    defect.files = [
      ...(defect.files ?? []),
      ...input.files.filter((f) => !(defect.files ?? []).some((x) => x.fileId === f.fileId)),
    ]
  }

  const freeCode = () => {
    for (;;) {
      codeSeed = (codeSeed * 9301 + 49297) % 233280
      const code = String(100000 + Math.floor((codeSeed / 233280) * 900000))
      if (!tables.some((t) => t.code === code)) return code
    }
  }

  /** A public Fase, or (preview) any Fase of the demo with the chosen fields. */
  const publicCycle = (cycleId: string, preview?: { fields?: string[] }) => {
    const cycle = db.cycles.find((c) => c.id === cycleId)
    const project = db.projects.find((p) => p.id === cycle?.projectId)
    if (!cycle || !project || project.archived || (!cycle.is_public && !preview)) {
      return notFound()
    }
    const shown = preview?.fields ? normalizePublicFields(preview.fields) : fields(cycle)
    return { cycle, project, shown }
  }

  const summary = (
    cycle: MockCycle,
    project: MockProject,
    f: PublicField[] = fields(cycle),
  ): PublicCycleSummary => {
    return {
      id: cycle.id,
      project: { code: project.project_code, name: project.name },
      cycle_code: cycle.cycle_code,
      title: cycle.title,
      intro: cycle.public_intro ?? null,
      status_code: cycle.status_code ?? 'PLANNED',
      ...(f.includes('cycle.description') ? { description: cycle.description ?? null } : {}),
      ...(f.includes('cycle.period')
        ? { period: { starts_on: cycle.starts_on ?? null, ends_on: cycle.ends_on ?? null } }
        : {}),
      ...(f.includes('cycle.progress') ? { progress: cycleTotals(cycle.id) } : {}),
      fields: f,
    }
  }

  const staffCycle = (code: string, cycleId: string, permission: Permission) => {
    const project = deps.project(code)
    deps.requireRole(project.id, permission)
    return { project, cycle: cycleOf(project.id, cycleId) }
  }

  // ---- methods ---------------------------------------------------------------------------
  const methods: WorkshopMethods = {
    listPublicCycles: () =>
      delay(() =>
        db.cycles
          .filter((c) => c.is_public)
          .map((c) => ({ c, p: db.projects.find((p) => p.id === c.projectId) }))
          .filter((x): x is { c: MockCycle; p: MockProject } => Boolean(x.p && !x.p.archived))
          .map(({ c, p }) => summary(c, p)),
      ),

    getPublicCycle: (cycleId, preview) =>
      delay(() => {
        const { cycle, project, shown } = publicCycle(cycleId, preview)
        const base = summary(cycle, project, shown)
        const has = (f: PublicField) => base.fields.includes(f)
        const out = { ...base } as ReturnType<typeof summary> & {
          features?: unknown
          bug_count?: number
        }
        if (has('features.list')) {
          out.features = cycleFeatures(cycle.id, false).map((feature) => ({
            name: feature.module.name,
            module_code: feature.module.module_code,
            state: feature.state,
            ...(has('features.progress') ? { progress: feature.progress } : {}),
            ...(has('features.cases')
              ? {
                  cases: runCasesOfCycle(cycle.id)
                    .filter((rc) => caseOf(rc.caseId)?.moduleId === feature.module.id)
                    .slice(0, 300)
                    .map((rc) => ({
                      title: caseOf(rc.caseId)?.title ?? '',
                      status: statusOf(rc.id),
                    })),
                }
              : {}),
            ...(has('features.tables')
              ? {
                  tables: tables
                    .filter(
                      (t) =>
                        t.cycleId === cycle.id &&
                        !t.revokedAt &&
                        t.moduleIds.includes(feature.module.id),
                    )
                    .map((t) => ({
                      name: t.name,
                      ...(has('features.members') ? { members: [...t.members] } : {}),
                    })),
                }
              : {}),
          }))
        }
        if (has('bugs.list')) out.bug_count = cycleBugs(project.id, cycle.id).length
        return out as Awaited<ReturnType<DataSource['getPublicCycle']>>
      }),

    listPublicBugs: (cycleId, query = {}, preview) =>
      delay(() => {
        const { cycle, project, shown: f } = publicCycle(cycleId, preview)
        const has = (x: PublicField) => f.includes(x)
        if (!has('bugs.list')) notFound()
        const q = query.q?.trim().toLowerCase() ?? ''
        let rows = cycleBugs(project.id, cycle.id)
        if (q) {
          rows = rows.filter((d) =>
            [
              d.title,
              has('bugs.code') ? d.bug_code : '',
              has('bugs.description') ? d.actual_behavior || d.description : '',
            ]
              .join(' ')
              .toLowerCase()
              .includes(q),
          )
        }
        if (query.feature && has('bugs.feature')) {
          rows = rows.filter((d) => moduleRef(d.moduleId)?.module_code === query.feature)
        }
        if (query.status === 'OPEN')
          rows = rows.filter((d) => !DONE_STATUSES.includes(d.status_code))
        if (query.status === 'DONE')
          rows = rows.filter((d) => DONE_STATUSES.includes(d.status_code))
        const pageSize = Math.min(100, Math.max(1, query.page_size ?? 25))
        const page = Math.max(1, query.page ?? 1)
        const data = rows.slice((page - 1) * pageSize, page * pageSize).map((d): PublicBugDto => {
          const bug: PublicBugDto = { id: d.id, title: d.title, status_code: d.status_code }
          const table = tableOfUser(d.reportedBy)
          if (has('bugs.code')) bug.bug_code = d.bug_code
          if (has('bugs.feature')) bug.feature = moduleRef(d.moduleId)?.name ?? null
          if (has('bugs.description')) bug.description = d.actual_behavior || d.description || null
          if (has('bugs.severity')) bug.severity_code = d.severity_code
          if (has('bugs.priority')) bug.priority_code = d.priority_code
          if (has('bugs.reporter')) {
            bug.reporter = table
              ? [table.name, d.legacyReporterName].filter(Boolean).join(' · ')
              : (db.users.find((u) => u.id === d.reportedBy)?.display_name ??
                d.legacyReporterName ??
                null)
          }
          if (has('bugs.date')) bug.reported_at = d.reportedAt ?? d.created_at
          if (has('bugs.confirmations')) bug.confirmations = confirmationsOf(d)
          if (has('bugs.evidence')) {
            bug.files = (d.files ?? [])
              .map((link) => db.files.find((x) => x.id === link.fileId))
              .filter((x) => x?.processing_status === 'READY')
              .map((x) => ({ id: x!.id, name: x!.original_filename }))
          }
          return bug
        })
        return { data, page, page_size: pageSize, total: rows.length }
      }),

    publicFileUrl: (_cycleId, fileId) => deps.fileUrl(fileId),

    joinWorkshop: (code) =>
      delay(() => {
        const parsed = workshopJoinSchema.safeParse({ code })
        if (!parsed.success) return invalid(parsed.error.issues)
        const t = tables.find((x) => x.code === parsed.data.code)
        if (!t) return problem(401, 'UNAUTHENTICATED', 'code', 'WRONG_CODE')
        const project = db.projects.find((p) => p.id === t.projectId)
        const state = project?.archived ? 'REVOKED' : stateOf(t)
        if (state !== 'ACTIVE') return problem(401, 'UNAUTHENTICATED', 'code', state)
        sessionTableId = t.id
        return sessionDto()
      }),

    getWorkshopSession: () => delay(sessionDto),

    updateWorkshopMembers: (names) =>
      delay(() => {
        const { t } = ctx()
        const parsed = workshopMembersSchema.safeParse({ member_names: names })
        if (!parsed.success) return invalid(parsed.error.issues)
        t.members = parsed.data.member_names
        return sessionDto()
      }),

    listWorkshopCases: (moduleId) =>
      delay(() => {
        const { t } = ctx()
        if (!t.moduleIds.includes(moduleId)) notFound()
        return t.runId ? casesOf(t.runId, moduleId, t.userId) : []
      }),

    saveWorkshopResult: (runCaseId, input) =>
      delay(() => {
        const { t, project, run } = ctx()
        const parsed = workshopResultSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        if (run?.status_code !== 'ACTIVE') problem(409, 'CONFLICT', 'run', 'RUN_NOT_ACTIVE')
        const rc = tableRunCases(t).find((x) => x.id === runCaseId) ?? notFound()
        const c = caseOf(rc.caseId)!
        const files = assertFiles(project.id, data.evidence)
        let sameAs: MockDefect | null = null
        if (data.same_as_defect_id) {
          const found =
            db.defects.find((d) => d.id === data.same_as_defect_id && d.cycleId === t.cycleId) ??
            notFound()
          sameAs = found.duplicateOf
            ? (db.defects.find((d) => d.id === found.duplicateOf) ?? found)
            : found
        }
        const attempt = db.executions.filter((e) => e.runCaseId === rc.id).length + 1
        const execution: MockExecution = {
          id: newId(),
          runCaseId: rc.id,
          attempt_number: attempt,
          execution_kind: attempt === 1 ? 'INITIAL' : 'RETEST',
          result_status: data.result_status,
          actual_result:
            data.result_status === 'FAILED'
              ? (data.note ?? `Sama dengan ${sameAs?.bug_code ?? ''}`)
              : null,
          notes:
            data.result_status === 'BLOCKED'
              ? (data.note ?? 'Tidak bisa dicoba')
              : (data.note ?? null),
          testerId: t.userId,
          tested_at: now(),
          legacyTester: data.tester_name ?? null,
          files,
        }
        db.executions.push(execution)
        let defect: { id: string; bug_code: string; created: boolean } | null = null
        if (data.result_status === 'FAILED') {
          if (sameAs) {
            confirm(sameAs, t, { note: data.note, tester_name: data.tester_name, files })
            if (!sameAs.executionIds.includes(execution.id)) sameAs.executionIds.push(execution.id)
            defect = { id: sameAs.id, bug_code: sameAs.bug_code, created: false }
          } else {
            const created = newDefect(project, t, {
              title: `${c.case_code} - ${c.title}`,
              testerName: data.tester_name ?? null,
              moduleId: c.moduleId,
              actual_behavior: data.note ?? '',
              expected_behavior: c.expected_result,
              steps_to_reproduce: c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
              executionIds: [execution.id],
              files,
            })
            defect = { id: created.id, bug_code: created.bug_code, created: true }
          }
        }
        return { execution_id: execution.id, defect }
      }),

    listWorkshopBugs: (query = {}) =>
      delay(() => {
        const { t, project } = ctx()
        let rows = cycleBugs(project.id, t.cycleId)
        if (query.module) rows = rows.filter((d) => d.moduleId === query.module)
        const q = query.q?.trim() ?? ''
        if (!q) return rows.slice(0, 500).map((d) => bugDto(d, t.userId))
        const sameScenario = new Set(
          db.defects
            .filter((d) =>
              d.executionIds.some(
                (id) => db.executions.find((e) => e.id === id)?.runCaseId === query.run_case,
              ),
            )
            .map((d) => d.id),
        )
        return rows
          .map((d) => ({
            d,
            score: Math.min(
              1,
              textCloseness(q, `${d.title} ${d.actual_behavior || d.description}`) +
                (sameScenario.has(d.id) ? 0.35 : 0),
            ),
          }))
          .filter((x) => x.score >= 0.2)
          .sort((a, b) => b.score - a.score)
          .slice(0, 8)
          .map((x) => ({ ...bugDto(x.d, t.userId), score: Math.round(x.score * 100) / 100 }))
      }),

    reportWorkshopBug: (input) =>
      delay(() => {
        const { t, project } = ctx()
        const parsed = workshopBugSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        if (data.module_id && !t.moduleIds.includes(data.module_id)) {
          problem(422, 'VALIDATION_ERROR', 'module_id', 'Not a feature of this table')
        }
        const firstLine = data.note.split('\n')[0]?.trim() ?? ''
        const created = newDefect(project, t, {
          title:
            data.title ?? (firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine),
          testerName: data.tester_name ?? null,
          moduleId: data.module_id,
          actual_behavior: data.note,
          files: assertFiles(project.id, data.evidence),
        })
        return { id: created.id, bug_code: created.bug_code }
      }),

    confirmWorkshopBug: (defectId, input) =>
      delay(() => {
        const { t, project } = ctx()
        const parsed = workshopConfirmSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const found =
          db.defects.find((d) => d.id === defectId && d.cycleId === t.cycleId) ?? notFound()
        const target = found.duplicateOf
          ? (db.defects.find((d) => d.id === found.duplicateOf) ?? found)
          : found
        confirm(target, t, {
          note: parsed.data.note,
          tester_name: parsed.data.tester_name,
          files: assertFiles(project.id, parsed.data.evidence),
        })
        return bugDto(target, t.userId)
      }),

    uploadWorkshopFile: async (file, options = {}) => {
      const { t } = ctx()
      return deps.storeUpload(t.projectId, file, options, t.userId)
    },

    getWorkshopFileStatus: (fileId) =>
      delay(() => {
        const { t } = ctx()
        const f = db.files.find((x) => x.id === fileId && x.projectId === t.projectId) ?? notFound()
        return { processing_status: f.processing_status, scan_status: f.scan_status }
      }),

    workshopFileUrl: (fileId) => deps.fileUrl(fileId),

    getWorkshopBoard: (code, cycleId) =>
      delay((): WorkshopBoardDto => {
        const { project, cycle } = staffCycle(code, cycleId, 'project.read')
        const all = cycleBugs(project.id, cycle.id)
        const cycleTables = tables.filter((t) => t.cycleId === cycle.id).map(tableDto)
        const tableUsers = new Set(
          tables.filter((t) => t.cycleId === cycle.id).map((t) => t.userId),
        )
        const recent: WorkshopBoardDto['recent'] = [
          ...db.executions
            .filter((e) => tableUsers.has(e.testerId))
            .map((e) => ({
              at: e.tested_at,
              kind: 'RESULT' as const,
              table_name: tableOfUser(e.testerId)?.name ?? null,
              tester_name: e.legacyTester ?? null,
              title:
                caseOf(db.runCases.find((rc) => rc.id === e.runCaseId)?.caseId ?? '')?.title ?? '',
              status: e.result_status,
            })),
          ...all
            .filter((d) => tableUsers.has(d.reportedBy))
            .map((d) => ({
              at: d.created_at,
              kind: 'BUG' as const,
              table_name: tableOfUser(d.reportedBy)?.name ?? null,
              tester_name: d.legacyReporterName ?? null,
              title: d.title,
              status: null,
            })),
          ...confirmations
            .filter((c) => tableUsers.has(c.userId))
            .map((c) => ({
              at: c.at,
              kind: 'CONFIRM' as const,
              table_name: tableOfUser(c.userId)?.name ?? null,
              tester_name: c.testerName,
              title: db.defects.find((d) => d.id === c.defectId)?.title ?? '',
              status: null,
            })),
        ]
          .sort((a, b) => b.at.localeCompare(a.at))
          .slice(0, 15)
        return {
          cycle: {
            id: cycle.id,
            cycle_code: cycle.cycle_code,
            title: cycle.title,
            is_public: Boolean(cycle.is_public),
            public_fields: fields(cycle),
            public_intro: cycle.public_intro ?? null,
          },
          totals: cycleTotals(cycle.id),
          bugs: {
            total: all.length,
            to_review: all.filter((d) => tableOfUser(d.reportedBy) && !d.reviewedAt).length,
            confirmations: confirmations.filter((c) =>
              db.defects.some((d) => d.id === c.defectId && d.cycleId === cycle.id),
            ).length,
          },
          tables: cycleTables.map((t) => ({
            id: t.id,
            name: t.name,
            member_names: t.member_names,
            state: t.state,
            modules: t.modules,
            progress: t.progress,
            bugs: t.open_bugs,
            last_activity_at: t.last_activity_at,
          })),
          features: cycleFeatures(cycle.id, true),
          recent,
        }
      }),

    updateCyclePublic: (code, cycleId, input) =>
      delay(() => {
        const { cycle } = staffCycle(code, cycleId, 'run.write')
        const parsed = cyclePublicSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        cycle.is_public = parsed.data.is_public
        cycle.public_fields = normalizePublicFields(parsed.data.public_fields)
        cycle.public_intro = parsed.data.public_intro ?? null
        return {
          is_public: cycle.is_public,
          public_fields: cycle.public_fields as PublicField[],
          public_intro: cycle.public_intro,
        }
      }),

    updateWorkshopFeature: (code, cycleId, input) =>
      delay(() => {
        const { cycle } = staffCycle(code, cycleId, 'run.write')
        const parsed = workshopFeatureStateSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        featureStates.set(`${cycle.id}:${parsed.data.module_id}`, parsed.data.state_code)
        return cycleFeatures(cycle.id, true)
      }),

    listWorkshopTables: (code, cycleId) =>
      delay(() => {
        const { cycle } = staffCycle(code, cycleId, 'run.write')
        return tables
          .filter((t) => t.cycleId === cycle.id)
          .sort((a, b) => a.name.length - b.name.length || a.name.localeCompare(b.name))
          .map(tableDto)
      }),

    createWorkshopTable: (code, cycleId, input) =>
      delay(() => {
        const { project, cycle } = staffCycle(code, cycleId, 'run.write')
        const parsed = workshopTableCreateSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        if (data.run_id && !db.runs.some((r) => r.id === data.run_id && r.cycleId === cycle.id)) {
          problem(422, 'VALIDATION_ERROR', 'run_id', 'Run not found in this cycle')
        }
        if (tables.some((t) => t.cycleId === cycle.id && t.name === data.name)) {
          problem(409, 'CONFLICT', 'name', 'Already used')
        }
        const userId = newId()
        db.users.push({
          id: userId,
          display_name: data.name,
          email: `meja-${userId}@meja.invalid`,
          kind: 'TABLE',
        })
        const t: MockTable = {
          id: newId(),
          projectId: project.id,
          cycleId: cycle.id,
          runId: data.run_id,
          userId,
          name: data.name,
          members: data.member_names,
          moduleIds: [...new Set(data.module_ids)],
          code: freeCode(),
          validFrom: data.valid_from ?? null,
          validUntil: data.valid_until,
          revokedAt: null,
        }
        tables.push(t)
        return tableDto(t)
      }),

    updateWorkshopTable: (code, cycleId, tableId, input) =>
      delay(() => {
        const { cycle } = staffCycle(code, cycleId, 'run.write')
        const parsed = workshopTableUpdateSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        const t = tables.find((x) => x.id === tableId && x.cycleId === cycle.id) ?? notFound()
        if (
          data.name &&
          data.name !== t.name &&
          tables.some((x) => x.cycleId === cycle.id && x.name === data.name)
        ) {
          problem(409, 'CONFLICT', 'name', 'Already used')
        }
        if (data.name) {
          t.name = data.name
          const user = db.users.find((u) => u.id === t.userId)
          if (user) user.display_name = data.name
        }
        if (data.run_id !== undefined) t.runId = data.run_id
        if (data.module_ids) t.moduleIds = [...new Set(data.module_ids)]
        if (data.member_names) t.members = data.member_names
        if (data.valid_from !== undefined) t.validFrom = data.valid_from
        if (data.valid_until) t.validUntil = data.valid_until
        if (data.regenerate_code) {
          t.code = freeCode()
          if (sessionTableId === t.id) sessionTableId = null
        }
        if (data.revoked === true) {
          t.revokedAt = t.revokedAt ?? now()
          if (sessionTableId === t.id) sessionTableId = null
        }
        if (data.revoked === false) t.revokedAt = null
        return tableDto(t)
      }),

    deleteWorkshopTable: (code, cycleId, tableId) =>
      delay(() => {
        const { cycle } = staffCycle(code, cycleId, 'run.write')
        const index = tables.findIndex((x) => x.id === tableId && x.cycleId === cycle.id)
        if (index < 0) notFound()
        const t = tables[index]!
        const used =
          db.executions.some((e) => e.testerId === t.userId) ||
          db.defects.some((d) => d.reportedBy === t.userId) ||
          confirmations.some((c) => c.userId === t.userId)
        if (used) problem(409, 'CONFLICT', 'table', 'HAS_ACTIVITY')
        tables.splice(index, 1)
        if (sessionTableId === t.id) sessionTableId = null
      }),

    getWorkshopSheet: (code, cycleId, tableId) =>
      delay(() => {
        const { cycle } = staffCycle(code, cycleId, 'run.write')
        const t = tables.find((x) => x.id === tableId && x.cycleId === cycle.id) ?? notFound()
        const table = tableDto(t)
        return {
          table,
          features: table.modules.map((module) => ({
            module,
            cases: t.runId ? casesOf(t.runId, module.id, null) : [],
          })),
        }
      }),

    listWorkshopInbox: (code, cycleId) =>
      delay(() => {
        const { project, cycle } = staffCycle(code, cycleId, 'project.read')
        const all = cycleBugs(project.id, cycle.id)
        return all
          .filter((d) => tableOfUser(d.reportedBy) && !d.reviewedAt)
          .map((d) => {
            const text = `${d.title} ${d.actual_behavior || d.description}`
            const exec = db.executions.find((e) => d.executionIds.includes(e.id))
            const rc = db.runCases.find((x) => x.id === exec?.runCaseId)
            const c = rc ? caseOf(rc.caseId) : undefined
            return {
              ...bugDto(d, null),
              priority_code: d.priority_code,
              scenario:
                rc && c ? { run_case_id: rc.id, case_code: c.case_code, title: c.title } : null,
              similar: all
                .filter((o) => o.id !== d.id)
                .map((o) => ({
                  id: o.id,
                  bug_code: o.bug_code,
                  title: o.title,
                  score:
                    Math.round(
                      textCloseness(text, `${o.title} ${o.actual_behavior || o.description}`) * 100,
                    ) / 100,
                }))
                .filter((s) => s.score >= 0.3)
                .sort((a, b) => b.score - a.score)
                .slice(0, 3),
            }
          })
      }),

    reviewWorkshopBug: (code, cycleId, defectId, input) =>
      delay(() => {
        const { project, cycle } = staffCycle(code, cycleId, 'run.write')
        const parsed = defectReviewSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        const d =
          db.defects.find(
            (x) => x.id === defectId && x.projectId === project.id && x.cycleId === cycle.id,
          ) ?? notFound()
        if (data.severity_code) d.severity_code = data.severity_code
        if (data.priority_code) d.priority_code = data.priority_code
        if (data.duplicate_of_id !== undefined) {
          if (data.duplicate_of_id) {
            const target = db.defects.find(
              (x) => x.id === data.duplicate_of_id && x.cycleId === cycle.id,
            )
            if (!target || target.duplicateOf || target.id === d.id) {
              problem(
                422,
                'VALIDATION_ERROR',
                'duplicate_of_id',
                'Choose a bug that is not itself a duplicate',
              )
            }
            d.duplicateOf = target!.id
            for (const id of d.executionIds)
              if (!target!.executionIds.includes(id)) target!.executionIds.push(id)
            for (const other of db.defects)
              if (other.duplicateOf === d.id) other.duplicateOf = target!.id
            if (['OPEN', 'IN_PROGRESS', 'REOPENED'].includes(d.status_code)) {
              d.history.push({
                from: d.status_code,
                to: 'WONT_FIX',
                by: db.currentUserId,
                comment: `Duplikat dari ${target!.bug_code}`,
                at: now(),
              })
              d.status_code = 'WONT_FIX'
            }
          } else {
            d.duplicateOf = null
          }
        }
        if (data.reviewed === true || data.duplicate_of_id) d.reviewedAt = d.reviewedAt ?? now()
        if (data.reviewed === false) d.reviewedAt = null
        d.updated_at = now()
        return bugDto(d, null)
      }),
  }

  return {
    methods,
    /** The card session overrides the staff user while it is active. */
    currentUser: (): CurrentUser | null => {
      const t = tables.find((x) => x.id === sessionTableId)
      return t ? tableUser(t) : null
    },
    signOut: () => {
      sessionTableId = null
    },
    /** Demo data: the main cycle is public and has three tables (ADR 0016). */
    seedDemo: () => {
      const project = db.projects[0]
      const cycle = db.cycles.find((c) => c.projectId === project?.id)
      const run = db.runs.find((r) => r.cycleId === cycle?.id && r.status_code === 'ACTIVE')
      if (!project || !cycle || !run) return
      cycle.is_public = true
      cycle.public_fields = [
        'cycle.description',
        'cycle.period',
        'cycle.progress',
        'features.list',
        'features.progress',
        'features.tables',
        'bugs.list',
        'bugs.feature',
        'bugs.code',
      ]
      cycle.public_intro = 'Forum workshop UAT bersama. Peserta masuk dengan kartu meja.'
      // Demo bugs of this project belong to its Fase, so the public problem list has content.
      for (const d of db.defects) if (d.projectId === project.id && !d.cycleId) d.cycleId = cycle.id
      const moduleIds = [
        ...new Set(
          db.runCases
            .filter((rc) => rc.runId === run.id)
            .map((rc) => caseOf(rc.caseId)?.moduleId)
            .filter((x): x is string => Boolean(x)),
        ),
      ]
      const groups = [moduleIds.slice(0, 2), moduleIds.slice(2, 4), moduleIds.slice(4)]
      const names = [
        ['Bu Sri', 'Pak Budi', 'Bu Ani'],
        ['Pak Joko', 'Bu Rina'],
        ['Pak Dedi', 'Bu Wati', 'Pak Agus'],
      ]
      groups.forEach((ids, index) => {
        if (ids.length === 0) return
        const userId = newId()
        db.users.push({
          id: userId,
          display_name: `Meja ${index + 1}`,
          email: `meja-${userId}@meja.invalid`,
          kind: 'TABLE',
        })
        tables.push({
          id: newId(),
          projectId: project.id,
          cycleId: cycle.id,
          runId: run.id,
          userId,
          name: `Meja ${index + 1}`,
          members: names[index] ?? [],
          moduleIds: ids,
          code: ['246810', '135791', '112233'][index] ?? freeCode(),
          validFrom: null,
          validUntil: '2099-12-31T16:59:00.000Z',
          revokedAt: null,
        })
      })
    },
  }
}
