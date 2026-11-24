import {
  BUG_PUBLIC_FIELDS,
  bugReportingSettingsSchema,
  canTransitionDefect,
  countResult,
  defectReviewSchema,
  emptyCounts,
  normalizePublicFields,
  PUBLIC_DONE_STATUSES,
  publicBugReportSchema,
  tableState,
  textCloseness,
  workshopActivateSchema,
  workshopBugSchema,
  workshopConfirmSchema,
  workshopJoinSchema,
  workshopMembersSchema,
  workshopResultSchema,
  type ApiErrorCode,
  type BugReportingSettings,
  type CaseSnapshot,
  type CurrentUser,
  type DefectReviewInput,
  type ExecutionStatus,
  type ModuleRef,
  type MyTasksDto,
  type Permission,
  type PublicBugDto,
  type PublicBugReportingDto,
  type PublicFeatureDto,
  type PublicField,
  type PublicReportItem,
  type PublicUatDetail,
  type PublicUatSummary,
  type ResultCounts,
  type TableMemberAccount,
  type TableMemberDto,
  type TableSessionMember,
  type WorkshopBugDto,
  type WorkshopCaseDto,
  type WorkshopFeatureDto,
  type WorkshopResultSaved,
  type WorkshopSessionDto,
  type WorkshopTableDto,
} from '@testboard/shared'
import type {
  MockCase,
  MockDb,
  MockDefect,
  MockExecution,
  MockParticipant,
  MockProject,
  MockRun,
  MockTable,
} from '../mocks/seed'
import { ApiClientError } from './api-client'
import type { DataSource, PublicPreview, UploadOptions, UploadResult } from './data-source'

/**
 * Demo version of Mode Workshop (ADR 0016) and of the public pages of ADR 0019, same rules as
 * the API: a public UAT and a project's Bug Reporting show only switched-on fields, the public
 * report form waits for an Admin, table cards sign in with a 6-digit code and only reach Mode
 * Mudah, answers go through the normal test attempts and bugs. The UAT side (people, groups,
 * board) lives in mock-uat.ts and shares the helpers in `core`.
 */
type WorkshopMethods = Pick<
  DataSource,
  | 'listPublicUats'
  | 'getPublicUat'
  | 'findPublicUatOfCycle'
  | 'listPublicBugReporting'
  | 'getPublicBugReporting'
  | 'listPublicBugs'
  | 'publicFileUrl'
  | 'sendPublicBugReport'
  | 'joinWorkshop'
  | 'getWorkshopSession'
  | 'updateWorkshopMembers'
  | 'activateTableMember'
  | 'joinWorkshopAsMember'
  | 'getMyTasks'
  | 'listWorkshopCases'
  | 'saveWorkshopResult'
  | 'listWorkshopBugs'
  | 'reportWorkshopBug'
  | 'confirmWorkshopBug'
  | 'uploadWorkshopFile'
  | 'getWorkshopFileStatus'
  | 'workshopFileUrl'
  | 'getBugReporting'
  | 'updateBugReporting'
  | 'listPublicReports'
  | 'reviewPublicReport'
  | 'deletePublicReport'
>

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
  /** 403 when the signed-in person's role in the project lacks the permission. */
  requireRole: (projectId: string, permission: Permission) => void
  /** The signed-in person manages the project (Admin, Super Admin or a legacy lead row). */
  manages: (projectId: string) => boolean
  nextBugCode: (project: MockProject) => string
  storeUpload: (
    projectId: string,
    file: File,
    options: UploadOptions,
    uploadedBy: string,
  ) => Promise<UploadResult>
  fileUrl: (fileId: string) => string
  /** A scenario frozen as it is now, for a run (ADR 0006). */
  snapshotOfCase: (testCase: MockCase) => CaseSnapshot
  people: {
    /** An e-mail becomes a User account (Pengguna of the project); 422 for a table card. */
    ensurePerson: (email: string, name: string, projectId: string) => string
    isActivated: (userId: string) => boolean
    activate: (userId: string) => void
    emailOf: (userId: string) => string | null
    currentUserId: () => string
  }
}

// ---- errors shaped like the API's ----------------------------------------------------------
export const notFound = (): never => {
  throw new ApiClientError(404, 'NOT_FOUND', 'Not found', 'mock-request')
}
export const problem = (
  status: number,
  code: ApiErrorCode,
  field: string,
  message: string,
): never => {
  throw new ApiClientError(status, code, message, 'mock-request', [{ field, message }])
}
export const refuse = (status: number, code: ApiErrorCode, message: string): never => {
  throw new ApiClientError(status, code, message, 'mock-request')
}
export const invalid = (issues: { path: PropertyKey[]; message: string }[]): never => {
  throw new ApiClientError(
    422,
    'VALIDATION_ERROR',
    'The submitted data is invalid.',
    'mock-request',
    issues.map((issue) => ({ field: issue.path.map(String).join('.'), message: issue.message })),
  )
}

// ---- ordering like the SQL of the API ------------------------------------------------------
export const byNumericId = (a: string, b: string) => Number(a) - Number(b)

/** Newest first with empty values last (MariaDB sorts NULL as the lowest value). */
const newestFirst = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : b.localeCompare(a)

const STATUS_ORDER = ['ACTIVE', 'PLANNED', 'COMPLETED', 'LOCKED']

/** UAT lists: running first, then planned, finished and locked; the latest start first. */
export const uatOrder = (a: MockRun, b: MockRun) =>
  STATUS_ORDER.indexOf(a.status_code) - STATUS_ORDER.indexOf(b.status_code) ||
  newestFirst(a.starts_at, b.starts_at) ||
  byNumericId(b.id, a.id)

/** Groups: by table number (none last), then short names first ("Meja 2" before "Meja 10"). */
export const tableOrder = (a: MockTable, b: MockTable) =>
  (a.tableNumber === null ? 1 : 0) - (b.tableNumber === null ? 1 : 0) ||
  (a.tableNumber ?? 0) - (b.tableNumber ?? 0) ||
  a.name.length - b.name.length ||
  a.name.localeCompare(b.name)

const newestCreatedFirst = (a: MockDefect, b: MockDefect) =>
  b.created_at.localeCompare(a.created_at) || byNumericId(b.id, a.id)

/** Remove every matching item in place (other code keeps the same array). */
export function removeWhere<T>(items: T[], predicate: (item: T) => boolean): void {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index] as T)) items.splice(index, 1)
  }
}

const maskEmail = (email: string) => {
  const at = email.indexOf('@')
  return at <= 0 ? '***' : `${email.slice(0, 1)}***${email.slice(at)}`
}
const DONE_STATUSES = PUBLIC_DONE_STATUSES as readonly string[]
const isDone = (status: string) => DONE_STATUSES.includes(status)
/** Bug Reporting keeps only the "bugs.*" fields (bug-reporting.ts). */
const onlyBugFields = (fields: readonly string[]): PublicField[] =>
  normalizePublicFields(fields).filter((field) => BUG_PUBLIC_FIELDS.includes(field))
/** DATE columns as YYYY-MM-DD. */
const dateOf = (value: string | null | undefined) => (value ? value.slice(0, 10) : null)

export function createMockWorkshop(deps: WorkshopDeps) {
  const { db, delay, newId, now } = deps
  const confirmations: Confirmation[] = []
  let sessionTableId: string | null = null
  let codeSeed = 314159
  /** When this device sent public reports (the API limits per address). */
  let reportTimes: number[] = []

  /** Answers already given for a client-generated id (offline outbox retries save once). */
  const replays = new Map<string, unknown>()

  // ---- lookups ------------------------------------------------------------------------------
  const projectById = (projectId: string) => db.projects.find((p) => p.id === projectId)
  /** Public pages never show archived projects. */
  const isOpenProject = (projectId: string) => {
    const project = projectById(projectId)
    return Boolean(project && !project.archived)
  }
  const moduleRef = (moduleId: string | null | undefined): ModuleRef | null => {
    const m = db.modules.find((x) => x.id === moduleId)
    return m ? { id: m.id, module_code: m.module_code, name: m.name } : null
  }
  const byModuleName = (a: ModuleRef, b: ModuleRef) => a.name.localeCompare(b.name, 'id')
  const caseOf = (caseId: string | undefined) => db.cases.find((c) => c.id === caseId)
  const runCaseOf = (runCaseId: string | undefined) => db.runCases.find((rc) => rc.id === runCaseId)
  const latestOf = (runCaseId: string): MockExecution | undefined =>
    db.executions
      .filter((e) => e.runCaseId === runCaseId)
      .sort((a, b) => b.attempt_number - a.attempt_number)[0]
  const statusOf = (runCaseId: string): ExecutionStatus =>
    latestOf(runCaseId)?.result_status ?? 'NOT_RUN'
  const progressOf = (runCaseIds: string[]): ResultCounts => {
    const counts = emptyCounts()
    for (const id of runCaseIds) countResult(counts, statusOf(id))
    return counts
  }
  const runCasesOf = (runId: string | null) =>
    db.runCases
      .filter((rc) => runId !== null && rc.runId === runId)
      .sort((a, b) => a.sort_order - b.sort_order || byNumericId(a.id, b.id))
  const tableOfUser = (userId: string) => db.tables.find((t) => t.userId === userId)
  const stateOf = (t: MockTable) =>
    tableState({ valid_from: t.validFrom, valid_until: t.validUntil, revoked_at: t.revokedAt })
  const userName = (userId: string) => db.users.find((u) => u.id === userId)?.display_name ?? null

  // ---- people of a group (participants with this table) --------------------------------------
  const membersOf = (t: MockTable) =>
    db.participants
      .filter((p) => p.tableId === t.id)
      .sort((a, b) => a.sortOrder - b.sortOrder || byNumericId(a.id, b.id))
  const memberAccount = (p: MockParticipant): TableMemberAccount => {
    if (!p.userId) return 'NONE'
    return deps.people.isActivated(p.userId) ? 'ACTIVE' : 'NOT_ACTIVATED'
  }
  const emailOf = (p: MockParticipant) => (p.userId ? deps.people.emailOf(p.userId) : null)
  const adminMember = (p: MockParticipant): TableMemberDto => ({
    id: p.id,
    name: p.name,
    email: emailOf(p),
    user_id: p.userId,
    account: memberAccount(p),
  })
  /** For the table itself: only a masked e-mail. */
  const sessionMember = (p: MockParticipant): TableSessionMember => {
    const email = emailOf(p)
    return {
      id: p.id,
      name: p.name,
      account: memberAccount(p),
      email_hint: email ? maskEmail(email) : null,
    }
  }

  // ---- groups (meja) -------------------------------------------------------------------------
  /** A card signs in as its own WORKSHOP account; seeded cards get theirs here. */
  const ensureCardAccount = (t: MockTable) => {
    if (db.users.some((u) => u.id === t.userId)) return
    db.users.push({
      id: t.userId,
      display_name: t.name,
      email: `meja-${t.userId}@meja.invalid`,
      kind: 'TABLE',
    })
  }
  for (const t of db.tables) ensureCardAccount(t)

  const tableModules = (t: MockTable) =>
    t.moduleIds
      .map((id) => moduleRef(id))
      .filter((m): m is ModuleRef => m !== null)
      .sort(byModuleName)
  /** Scenarios of the group's UAT that belong to the group's features. */
  const tableRunCases = (t: MockTable, moduleId?: string) =>
    runCasesOf(t.runId).filter((rc) => {
      const c = caseOf(rc.caseId)
      return Boolean(
        c && t.moduleIds.includes(c.moduleId) && (!moduleId || c.moduleId === moduleId),
      )
    })

  const tableDto = (t: MockTable): WorkshopTableDto => {
    const cycle = db.cycles.find((c) => c.id === t.cycleId)
    const run = db.runs.find((r) => r.id === t.runId)
    const bugs = db.defects.filter((d) => d.reportedBy === t.userId)
    const answers = db.executions.filter((e) => e.testerId === t.userId)
    const last = [...bugs.map((b) => b.created_at), ...answers.map((a) => a.tested_at)]
      .sort()
      .at(-1)
    const members = membersOf(t)
    return {
      id: t.id,
      name: t.name,
      table_number: t.tableNumber,
      cycle: { id: t.cycleId, cycle_code: cycle?.cycle_code ?? '', title: cycle?.title ?? '' },
      run: run
        ? { id: run.id, run_code: run.run_code, name: run.name, status_code: run.status_code }
        : null,
      modules: tableModules(t),
      member_names: members.map((m) => m.name),
      members: members.map(adminMember),
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

  const freeCode = () => {
    for (;;) {
      codeSeed = (codeSeed * 9301 + 49297) % 233280
      const code = String(100000 + Math.floor((codeSeed / 233280) * 900000))
      if (!db.tables.some((t) => t.code === code)) return code
    }
  }

  // ---- problems ------------------------------------------------------------------------------
  const confirmationsOf = (d: MockDefect) =>
    confirmations.filter((c) => c.defectId === d.id).length +
    db.defects.filter((x) => x.duplicateOf === d.id).length

  const filesOf = (d: MockDefect) =>
    (d.files ?? []).flatMap((link) => {
      const f = db.files.find((x) => x.id === link.fileId && !x.deleted)
      return f
        ? [
            {
              id: f.id,
              original_filename: f.original_filename,
              ready: f.processing_status === 'READY' && f.scan_status === 'CLEAN',
            },
          ]
        : []
    })

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
      files: filesOf(d),
    }
  }

  /** Problems of a Fase (the table pages search these for "Sama dengan ini?"). */
  const cycleBugs = (projectId: string, cycleId: string, includeDuplicates = false) =>
    db.defects
      .filter((d) => d.projectId === projectId && d.cycleId === cycleId)
      .filter((d) => includeDuplicates || !d.duplicateOf)
      .sort(newestCreatedFirst)

  /** Problems of a UAT: reported by its groups, or found in its scenarios. */
  const uatBugs = (projectId: string, runId: string, includeDuplicates = false) => {
    const groupUsers = new Set(db.tables.filter((t) => t.runId === runId).map((t) => t.userId))
    const runCaseIds = new Set(runCasesOf(runId).map((rc) => rc.id))
    const executionIds = new Set(
      db.executions.filter((e) => runCaseIds.has(e.runCaseId)).map((e) => e.id),
    )
    return db.defects
      .filter(
        (d) =>
          d.projectId === projectId &&
          (groupUsers.has(d.reportedBy) || d.executionIds.some((id) => executionIds.has(id))),
      )
      .filter((d) => includeDuplicates || !d.duplicateOf)
      .sort(newestCreatedFirst)
  }

  const bugText = (d: MockDefect) => `${d.title} ${d.actual_behavior || d.description || ''}`
  /** "Masalah mirip": the closest other problems (score 0.3 and up, at most three). */
  const similarTo = (text: string, others: MockDefect[], self: string) =>
    others
      .filter((other) => other.id !== self)
      .map((other) => ({
        id: other.id,
        bug_code: other.bug_code,
        title: other.title,
        score: textCloseness(text, bugText(other)),
      }))
      .filter((s) => s.score >= 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((s) => ({ ...s, score: Math.round(s.score * 100) / 100 }))

  /**
   * Review a problem (Masalah masuk, and public reports): impact, priority, reviewed, or "the
   * same as" another problem of the project (closed as a duplicate; its attempts move along).
   */
  const reviewDefect = (projectId: string, defectId: string, input: DefectReviewInput) => {
    const d = db.defects.find((x) => x.id === defectId && x.projectId === projectId) ?? notFound()
    let target: MockDefect | null = null
    if (input.duplicate_of_id) {
      if (input.duplicate_of_id === defectId) {
        problem(422, 'VALIDATION_ERROR', 'duplicate_of_id', 'Same bug')
      }
      const found = db.defects.find(
        (x) => x.id === input.duplicate_of_id && x.projectId === projectId,
      )
      if (!found || found.duplicateOf) {
        return problem(
          422,
          'VALIDATION_ERROR',
          'duplicate_of_id',
          'Choose a bug that is not itself a duplicate',
        )
      }
      target = found
      for (const id of d.executionIds) {
        if (!target.executionIds.includes(id)) target.executionIds.push(id)
      }
      for (const other of db.defects) if (other.duplicateOf === d.id) other.duplicateOf = target.id
    }
    if (input.severity_code) d.severity_code = input.severity_code
    if (input.priority_code) d.priority_code = input.priority_code
    if (input.duplicate_of_id !== undefined) d.duplicateOf = input.duplicate_of_id ?? null
    if (input.reviewed === true || input.duplicate_of_id) d.reviewedAt = d.reviewedAt ?? now()
    else if (input.reviewed === false) d.reviewedAt = null
    if (target && canTransitionDefect(d.status_code, 'WONT_FIX')) {
      d.history.push({
        from: d.status_code,
        to: 'WONT_FIX',
        by: deps.people.currentUserId(),
        comment: `Duplikat dari ${target.bug_code}`,
        at: now(),
      })
      d.status_code = 'WONT_FIX'
    }
    d.updated_at = now()
  }

  // ---- UATs ----------------------------------------------------------------------------------
  /** The features chosen for a UAT, with their public state and the progress of their scenarios. */
  const uatFeatures = (runId: string, includeHidden: boolean): WorkshopFeatureDto[] => {
    const runCases = runCasesOf(runId)
    return db.uatFeatures
      .filter((f) => f.runId === runId)
      .flatMap((f) => {
        const module = moduleRef(f.moduleId)
        if (!module) return []
        const ids = runCases
          .filter((rc) => caseOf(rc.caseId)?.moduleId === f.moduleId)
          .map((rc) => rc.id)
        return [{ module, state: f.state, progress: progressOf(ids) }]
      })
      .filter((f) => includeHidden || f.state !== 'HIDDEN')
      .sort((a, b) => byModuleName(a.module, b.module))
  }
  const uatTotals = (runId: string) => progressOf(runCasesOf(runId).map((rc) => rc.id))
  const uatPublicFields = (run: MockRun) => normalizePublicFields(run.public_fields ?? [])

  /** Scenarios of one feature in a run, with the latest answer and the problems found. */
  const casesOf = (runId: string, moduleId: string, viewer: string | null): WorkshopCaseDto[] =>
    runCasesOf(runId)
      .filter((rc) => caseOf(rc.caseId)?.moduleId === moduleId)
      .map((rc): WorkshopCaseDto => {
        const c = caseOf(rc.caseId) as MockCase
        const snap = rc.snapshot
        const latest = latestOf(rc.id)
        const answeredBy = latest ? tableOfUser(latest.testerId) : undefined
        const attempts = new Set(
          db.executions.filter((e) => e.runCaseId === rc.id).map((e) => e.id),
        )
        return {
          run_case_id: rc.id,
          case_code: snap?.case_code ?? c.case_code,
          title: snap?.title ?? c.title,
          actor_label: snap?.actor_label ?? (c.actor_label || null),
          preconditions: snap?.preconditions ?? (c.preconditions || null),
          steps: snap?.steps?.length ? snap.steps.map((s) => s.instruction) : [...c.steps],
          expected_result: snap?.expected_result ?? (c.expected_result || null),
          latest: latest
            ? {
                status: latest.result_status,
                table_name: answeredBy?.name ?? userName(latest.testerId),
                tester_name: latest.legacyTester ?? null,
                note: latest.actual_result ?? latest.notes ?? null,
                at: latest.tested_at,
                mine: viewer !== null && latest.testerId === viewer,
              }
            : null,
          bugs: db.defects
            .filter((d) => !d.duplicateOf && d.executionIds.some((id) => attempts.has(id)))
            .sort((a, b) => a.bug_code.localeCompare(b.bug_code))
            .map((d) => ({
              id: d.id,
              bug_code: d.bug_code,
              title: d.title,
              status_code: d.status_code,
            })),
        }
      })

  // ---- the table card session ------------------------------------------------------------------
  const tableUser = (t: MockTable): CurrentUser => ({
    id: t.userId,
    display_name: t.name,
    email: '',
    preferred_locale: 'id',
    system_role: null,
    is_super_admin: false,
    projects: [],
    account_kind: 'TABLE',
  })

  /** Table of the current card session; a closed card ends the session. */
  const ctx = () => {
    const t = db.tables.find((x) => x.id === sessionTableId)
    const project = t ? projectById(t.projectId) : undefined
    if (!t || !project || project.archived || stateOf(t) !== 'ACTIVE') {
      sessionTableId = null
      return problem(
        401,
        'UNAUTHENTICATED',
        'table',
        t && project && !project.archived ? stateOf(t) : 'REVOKED',
      )
    }
    const found = db.cycles.find((c) => c.id === t.cycleId)
    const cycle = { id: t.cycleId, cycle_code: found?.cycle_code ?? '', title: found?.title ?? '' }
    const run = db.runs.find((r) => r.id === t.runId) ?? null
    return { t, project, cycle, run }
  }

  const sessionDto = (): WorkshopSessionDto => {
    const { t, project, cycle, run } = ctx()
    const members = membersOf(t)
    return {
      table: {
        id: t.id,
        name: t.name,
        table_number: t.tableNumber,
        member_names: members.map((m) => m.name),
        members: members.map(sessionMember),
      },
      project: { code: project.project_code, name: project.name },
      cycle,
      run: run ? { id: run.id, name: run.name, status_code: run.status_code } : null,
      features: tableModules(t).map((module) => ({
        module,
        state: 'OPEN' as const,
        progress: progressOf(tableRunCases(t, module.id).map((rc) => rc.id)),
      })),
      valid_until: t.validUntil,
    }
  }

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

  /** A problem of the table's Fase; a "+1" on a merged problem goes to the one it joined. */
  const cycleDefect = (projectId: string, cycleId: string, defectId: string) => {
    const found =
      db.defects.find(
        (d) => d.id === defectId && d.projectId === projectId && d.cycleId === cycleId,
      ) ?? notFound()
    return found.duplicateOf ? (db.defects.find((d) => d.id === found.duplicateOf) ?? found) : found
  }

  // ---- public pages: UAT ---------------------------------------------------------------------
  /** A signed-in person who manages the project may preview a page before it is public. */
  const isLeadOf = (projectId: string) => sessionTableId === null && deps.manages(projectId)

  const bugReportingOf = (projectId: string): BugReportingSettings => {
    const row = db.bugReporting.find((b) => b.projectId === projectId)
    return {
      is_public: row?.is_public ?? false,
      public_fields: onlyBugFields(row?.public_fields ?? []),
      public_intro: row?.public_intro?.trim() ? row.public_intro : null,
      accept_reports: row?.accept_reports ?? false,
    }
  }

  const publicSummary = (
    run: MockRun,
    project: MockProject,
    fields: PublicField[],
  ): PublicUatSummary => {
    const has = (f: PublicField) => fields.includes(f)
    const cycle = db.cycles.find((c) => c.id === run.cycleId)
    return {
      id: run.id,
      project: { code: project.project_code, name: project.name },
      name: run.name,
      phase: run.cycleId
        ? { cycle_code: cycle?.cycle_code ?? '', title: cycle?.title ?? '' }
        : null,
      intro: run.public_intro ?? null,
      status_code: run.status_code,
      ...(has('cycle.description') ? { description: cycle?.description ?? null } : {}),
      ...(has('cycle.period')
        ? {
            period: {
              starts_on: dateOf(run.starts_at ?? cycle?.starts_on),
              ends_on: dateOf(run.ends_at ?? cycle?.ends_on),
            },
          }
        : {}),
      ...(has('cycle.progress') ? { progress: uatTotals(run.id) } : {}),
      fields,
      bug_reporting_public: bugReportingOf(project.id).is_public,
    }
  }

  /**
   * The UAT behind a public page; a preview shows it before it is public, optionally with
   * field choices that are not saved yet (an empty choice is not sent, so the saved fields).
   */
  const resolveUat = (runId: string, preview?: PublicPreview) => {
    const run = db.runs.find((r) => r.id === runId)
    const project = run ? projectById(run.projectId) : undefined
    if (!preview) {
      if (!run || !project || !run.is_public || project.archived) return notFound()
      return { run, project, fields: uatPublicFields(run) }
    }
    if (!run || !project || !isLeadOf(project.id)) return notFound()
    return {
      run,
      project,
      fields: preview.fields ? normalizePublicFields(preview.fields) : uatPublicFields(run),
    }
  }

  // ---- public pages: Bug Reporting -------------------------------------------------------------
  /** Problems the public may see: not a duplicate, and a public report only once reviewed. */
  const publicBugs = (projectId: string) =>
    db.defects
      .filter(
        (d) =>
          d.projectId === projectId &&
          !d.duplicateOf &&
          (d.source_kind !== 'PUBLIC' || Boolean(d.reviewedAt)),
      )
      .sort(newestCreatedFirst)

  const publicProject = (code: string) =>
    db.projects.find((p) => p.project_code === code.toUpperCase() && !p.archived) ?? notFound()

  /** The project's Bug Reporting as the public sees it (404 while it is switched off). */
  const resolveBugReporting = (code: string, preview?: boolean) => {
    const project = publicProject(code)
    const settings = bugReportingOf(project.id)
    if (!settings.is_public && !(preview && isLeadOf(project.id))) notFound()
    return { project, settings }
  }

  const bugReportingDto = (
    project: MockProject,
    settings: BugReportingSettings,
  ): PublicBugReportingDto => {
    const listed = settings.public_fields.includes('bugs.list')
    const showsFeatures = listed && settings.public_fields.includes('bugs.feature')
    const bugs = publicBugs(project.id)
    const features = [
      ...new Set(
        bugs.map((d) => moduleRef(d.moduleId)?.name).filter((n): n is string => Boolean(n)),
      ),
    ].sort((a, b) => a.localeCompare(b))
    return {
      project: { code: project.project_code, name: project.name },
      intro: settings.public_intro,
      fields: settings.public_fields,
      accept_reports: settings.accept_reports,
      bug_count: listed ? bugs.length : 0,
      bug_open: listed ? bugs.filter((d) => !isDone(d.status_code)).length : 0,
      ...(showsFeatures ? { features } : {}),
    }
  }

  /** Public reports per device: at most 5 in 10 minutes and 20 a day (like the API per IP). */
  const allowReport = (at = Date.now()) => {
    const day = 24 * 60 * 60 * 1000
    reportTimes = reportTimes.filter((t) => at - t < day)
    const recent = reportTimes.filter((t) => at - t < 10 * 60 * 1000)
    if (recent.length >= 5 || reportTimes.length >= 20) return false
    reportTimes.push(at)
    return true
  }

  const staffProject = (code: string, permission: Permission) => {
    const project = deps.project(code)
    deps.requireRole(project.id, permission)
    return project
  }

  // ---- methods -------------------------------------------------------------------------------
  const methods: WorkshopMethods = {
    listPublicUats: () =>
      delay(() =>
        db.runs
          .filter((r) => r.is_public && isOpenProject(r.projectId))
          .sort(uatOrder)
          .map((run) =>
            publicSummary(run, projectById(run.projectId) as MockProject, uatPublicFields(run)),
          ),
      ),

    getPublicUat: (uatId, preview) =>
      delay((): PublicUatDetail => {
        const { run, project, fields } = resolveUat(uatId, preview)
        const detail: PublicUatDetail = publicSummary(run, project, fields)
        const has = (f: PublicField) => fields.includes(f)
        if (has('features.list')) {
          const runCases = runCasesOf(run.id)
            .flatMap((rc) => {
              const c = caseOf(rc.caseId)
              return c ? [{ rc, c }] : []
            })
            .sort((a, b) => a.c.case_code.localeCompare(b.c.case_code))
          const groups = db.tables.filter((t) => t.runId === run.id).sort(tableOrder)
          detail.features = uatFeatures(run.id, false).map((feature): PublicFeatureDto => {
            const out: PublicFeatureDto = {
              name: feature.module.name,
              module_code: feature.module.module_code,
              state: feature.state,
            }
            if (has('features.progress')) out.progress = feature.progress
            if (has('features.cases')) {
              out.cases = runCases
                .filter((x) => x.c.moduleId === feature.module.id)
                .slice(0, 300)
                .map((x) => ({ title: x.c.title, status: statusOf(x.rc.id) }))
            }
            if (has('features.tables')) {
              out.tables = groups
                .filter((t) => stateOf(t) !== 'REVOKED' && t.moduleIds.includes(feature.module.id))
                .map((t) => ({
                  name: t.name,
                  ...(has('features.members') ? { members: membersOf(t).map((m) => m.name) } : {}),
                }))
            }
            return out
          })
        }
        return detail
      }),

    findPublicUatOfCycle: (cycleId) =>
      delay(() => {
        const run = db.runs
          .filter((r) => r.cycleId === cycleId && r.is_public && isOpenProject(r.projectId))
          .sort((a, b) => newestFirst(a.starts_at, b.starts_at) || byNumericId(b.id, a.id))[0]
        return run ? { id: run.id } : notFound()
      }),

    listPublicBugReporting: () =>
      delay(() =>
        db.projects
          .filter((p) => !p.archived && bugReportingOf(p.id).is_public)
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((p) => bugReportingDto(p, bugReportingOf(p.id))),
      ),

    getPublicBugReporting: (code, preview) =>
      delay(() => {
        const { project, settings } = resolveBugReporting(code, preview)
        return bugReportingDto(project, settings)
      }),

    listPublicBugs: (code, query = {}, preview) =>
      delay(() => {
        const { project, settings } = resolveBugReporting(code, preview)
        const has = (f: PublicField) => settings.public_fields.includes(f)
        if (!has('bugs.list')) notFound()
        const q = (query.q ?? '').trim().toLowerCase().slice(0, 200)
        let rows = publicBugs(project.id)
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
        // A feature is chosen by its name on the public page (codes are internal).
        if (query.feature && has('bugs.feature')) {
          rows = rows.filter((d) => {
            const m = moduleRef(d.moduleId)
            return m?.name === query.feature || m?.module_code === query.feature
          })
        }
        if (query.status === 'OPEN') rows = rows.filter((d) => !isDone(d.status_code))
        else if (query.status === 'DONE') rows = rows.filter((d) => isDone(d.status_code))
        const page = Math.max(1, query.page ?? 1)
        const pageSize = Math.min(100, Math.max(1, query.page_size ?? 25))
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
              : (userName(d.reportedBy) ?? d.legacyReporterName ?? null)
          }
          if (has('bugs.date')) bug.reported_at = d.reportedAt ?? d.created_at
          if (has('bugs.confirmations')) bug.confirmations = confirmationsOf(d)
          if (has('bugs.evidence')) {
            bug.files = filesOf(d)
              .filter((f) => f.ready)
              .map((f) => ({ id: f.id, name: f.original_filename }))
          }
          return bug
        })
        return { data, page, page_size: pageSize, total: rows.length }
      }),

    publicFileUrl: (_code, fileId) => deps.fileUrl(fileId),

    sendPublicBugReport: (code, input) =>
      delay(() => {
        const project = publicProject(code)
        const settings = bugReportingOf(project.id)
        if (!settings.is_public || !settings.accept_reports) notFound()
        const parsed = publicBugReportSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const data = parsed.data
        // The trap field people never see: a robot gets the same friendly answer, nothing kept.
        if (data.website) return { received: true as const }
        if (!allowReport()) {
          refuse(429, 'RATE_LIMITED', 'Too many reports from this device. Try again later.')
        }
        const named = data.feature?.toLowerCase()
        const feature = named
          ? db.modules.find((m) => m.projectId === project.id && m.name.toLowerCase() === named)
          : undefined
        const at = now()
        db.defects.push({
          id: newId(),
          projectId: project.id,
          moduleId: feature?.id ?? null,
          cycleId: null,
          legacyReporterName: data.reporter_name ?? null,
          reporterContact: data.contact ?? null,
          reportedAt: at,
          bug_code: deps.nextBugCode(project),
          title: data.title,
          description:
            data.feature && !feature
              ? `Halaman/fitur: ${data.feature}\n\n${data.description}`
              : data.description,
          steps_to_reproduce: '',
          expected_behavior: '',
          actual_behavior: data.description,
          severity_code: 'MEDIUM',
          priority_code: 'MEDIUM',
          status_code: 'OPEN',
          source_kind: 'PUBLIC',
          environment_name: '',
          build_version: '',
          browser_name: '',
          fixed_in_version: null,
          reportedBy: '',
          assignedTo: null,
          created_at: at,
          updated_at: at,
          executionIds: [],
          history: [{ from: null, to: 'OPEN', by: '', comment: null, at }],
          comments: [],
        })
        return { received: true as const }
      }),

    joinWorkshop: (code) =>
      delay(() => {
        const parsed = workshopJoinSchema.safeParse({ code })
        if (!parsed.success) return invalid(parsed.error.issues)
        const t = db.tables.find((x) => x.code === parsed.data.code)
        if (!t) return problem(401, 'UNAUTHENTICATED', 'code', 'WRONG_CODE')
        const project = projectById(t.projectId)
        const state = !project || project.archived ? 'REVOKED' : stateOf(t)
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
        // People with an account always stay; the table only changes the other names.
        const kept = membersOf(t).filter((p) => p.userId !== null)
        const taken = new Set(kept.map((p) => p.name.toLocaleLowerCase('id')))
        const fresh: string[] = []
        for (const name of parsed.data.member_names) {
          const key = name.trim().toLocaleLowerCase('id')
          if (!key || taken.has(key)) continue
          taken.add(key)
          fresh.push(name.trim().slice(0, 100))
        }
        removeWhere(db.participants, (p) => p.tableId === t.id && p.userId === null)
        const start = kept.reduce((max, p) => Math.max(max, p.sortOrder + 1), 0)
        fresh.forEach((name, index) => {
          db.participants.push({
            id: newId(),
            runId: t.runId,
            tableId: t.id,
            sortOrder: start + index,
            name,
            userId: null,
          })
        })
        return sessionDto()
      }),

    activateTableMember: (memberId, password) =>
      delay(() => {
        const { t } = ctx()
        const parsed = workshopActivateSchema.safeParse({ password })
        if (!parsed.success) return invalid(parsed.error.issues)
        const member = db.participants.find((p) => p.id === memberId && p.tableId === t.id)
        const userId = member?.userId
        const email = userId ? deps.people.emailOf(userId) : null
        if (!userId || !email) return notFound()
        if (parsed.data.password.toLowerCase().includes(email.split('@')[0] ?? '\u0000')) {
          return problem(
            422,
            'VALIDATION_ERROR',
            'password',
            'Password must not contain your e-mail name',
          )
        }
        if (deps.people.isActivated(userId)) {
          return problem(409, 'CONFLICT', 'member', 'ALREADY_ACTIVE')
        }
        deps.people.activate(userId)
        return sessionDto()
      }),

    joinWorkshopAsMember: (tableId) =>
      delay(() => {
        // Only a person opens their table; a device signed in as a card does not.
        if (sessionTableId !== null) return notFound()
        const me = deps.people.currentUserId()
        const member = db.participants.find((p) => p.tableId === tableId && p.userId === me)
        const t = member ? db.tables.find((x) => x.id === tableId) : undefined
        if (!member || !t) return notFound()
        const project = projectById(t.projectId)
        const state = !project || project.archived ? 'REVOKED' : stateOf(t)
        if (state !== 'ACTIVE') return problem(409, 'CONFLICT', 'table', state)
        sessionTableId = t.id
        return { session: sessionDto(), member_name: member.name }
      }),

    getMyTasks: () =>
      delay((): MyTasksDto => {
        const me = deps.people.currentUserId()
        const mine = db.participants.filter((p) => p.userId === me)
        const tables = mine
          .flatMap((p) => {
            const t = db.tables.find((x) => x.id === p.tableId)
            const project = t ? projectById(t.projectId) : undefined
            const cycle = t ? db.cycles.find((c) => c.id === t.cycleId) : undefined
            if (!t || !project || !cycle) return []
            const run = db.runs.find((r) => r.id === t.runId)
            return [
              {
                table: { id: t.id, name: t.name, table_number: t.tableNumber },
                member: { id: p.id, name: p.name },
                project: { code: project.project_code, name: project.name },
                cycle: { id: cycle.id, title: cycle.title },
                uat: run ? { id: run.id, name: run.name } : null,
                valid_from: t.validFrom,
                valid_until: t.validUntil,
                state: project.archived ? ('REVOKED' as const) : stateOf(t),
              },
            ]
          })
          .sort(
            (a, b) =>
              b.valid_until.localeCompare(a.valid_until) ||
              a.table.name.localeCompare(b.table.name),
          )
          .slice(0, 50)
        // Every open UAT the person takes part in, with the scenarios of their group's features
        // (all scenarios of the UAT while they have no group yet).
        const runs = mine
          .flatMap((p) => {
            const run = db.runs.find((r) => r.id === p.runId)
            const project = run ? projectById(run.projectId) : undefined
            if (!run || !project || project.archived) return []
            if (run.status_code !== 'PLANNED' && run.status_code !== 'ACTIVE') return []
            const group = p.tableId ? db.tables.find((t) => t.id === p.tableId) : undefined
            const cases = runCasesOf(run.id).filter(
              (rc) =>
                !p.tableId || Boolean(group?.moduleIds.includes(caseOf(rc.caseId)?.moduleId ?? '')),
            )
            const open = cases
              .filter((rc) => statusOf(rc.id) === 'NOT_RUN')
              .map((rc) => rc.id)
              .sort(byNumericId)
            return [
              {
                project: { code: project.project_code, name: project.name },
                run: { id: run.id, name: run.name, status_code: run.status_code },
                assigned: cases.length,
                done: cases.length - open.length,
                next_run_case_id: open[0] ?? null,
              },
            ]
          })
          .sort(
            (a, b) =>
              Number(b.run.status_code === 'ACTIVE') - Number(a.run.status_code === 'ACTIVE') ||
              byNumericId(b.run.id, a.run.id),
          )
          .slice(0, 50)
        const bugs = [...db.projects]
          .sort((a, b) => a.project_code.localeCompare(b.project_code))
          .flatMap((project) => {
            const reported = db.defects.filter(
              (d) => d.projectId === project.id && d.reportedBy === me,
            )
            if (!reported.length) return []
            return [
              {
                project: { code: project.project_code, name: project.name },
                open: reported.filter((d) => !isDone(d.status_code)).length,
                total: reported.length,
              },
            ]
          })
        return { tables, runs, bugs }
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
        const key = data.client_id ? `ws-result:${t.userId}:${data.client_id}` : null
        const replay = key ? replays.get(key) : undefined
        if (replay) return replay as WorkshopResultSaved
        if (run?.status_code !== 'ACTIVE') problem(409, 'CONFLICT', 'run', 'RUN_NOT_ACTIVE')
        const rc = tableRunCases(t).find((x) => x.id === runCaseId) ?? notFound()
        const c = caseOf(rc.caseId) as MockCase
        const sameAs = data.same_as_defect_id
          ? cycleDefect(project.id, t.cycleId, data.same_as_defect_id)
          : null
        const files = assertFiles(project.id, data.evidence)
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
              : data.result_status === 'PASSED'
                ? (data.note ?? null)
                : null,
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
            const view = rc.snapshot
            const steps = view?.steps?.length ? view.steps.map((s) => s.instruction) : c.steps
            const created = newDefect(project, t, {
              title: `${view?.case_code ?? c.case_code} - ${view?.title ?? c.title}`.slice(0, 500),
              testerName: data.tester_name ?? null,
              moduleId: c.moduleId || null,
              actual_behavior: data.note ?? '',
              expected_behavior: view?.expected_result ?? c.expected_result,
              steps_to_reproduce: steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
              executionIds: [execution.id],
              files,
            })
            defect = { id: created.id, bug_code: created.bug_code, created: true }
          }
        }
        const saved: WorkshopResultSaved = { execution_id: execution.id, defect }
        if (key) replays.set(key, saved)
        return saved
      }),

    listWorkshopBugs: (query = {}) =>
      delay(() => {
        const { t, project } = ctx()
        let rows = cycleBugs(project.id, t.cycleId)
        if (query.module) rows = rows.filter((d) => d.moduleId === query.module)
        const q = query.q?.trim().slice(0, 2000) ?? ''
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
            score: Math.min(1, textCloseness(q, bugText(d)) + (sameScenario.has(d.id) ? 0.35 : 0)),
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
        const key = data.client_id ? `ws-bug:${t.userId}:${data.client_id}` : null
        const replay = key ? replays.get(key) : undefined
        if (replay) return replay as { id: string; bug_code: string }
        if (data.module_id && !t.moduleIds.includes(data.module_id)) {
          problem(422, 'VALIDATION_ERROR', 'module_id', 'Not a feature of this table')
        }
        const firstLine = data.note.split('\n')[0]?.trim() ?? ''
        const created = newDefect(project, t, {
          title:
            (data.title ??
              (firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine)) ||
            'Masalah',
          testerName: data.tester_name ?? null,
          moduleId: data.module_id,
          actual_behavior: data.note,
          files: assertFiles(project.id, data.evidence),
        })
        const answer = { id: created.id, bug_code: created.bug_code }
        if (key) replays.set(key, answer)
        return answer
      }),

    confirmWorkshopBug: (defectId, input) =>
      delay(() => {
        const { t, project } = ctx()
        const target = cycleDefect(project.id, t.cycleId, defectId)
        const parsed = workshopConfirmSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
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
        const f =
          db.files.find((x) => x.id === fileId && x.projectId === t.projectId && !x.deleted) ??
          notFound()
        return { processing_status: f.processing_status, scan_status: f.scan_status }
      }),

    workshopFileUrl: (fileId) => deps.fileUrl(fileId),

    // ---- Bug Reporting (Admins) --------------------------------------------------------------
    getBugReporting: (code) => delay(() => bugReportingOf(staffProject(code, 'run.write').id)),

    updateBugReporting: (code, input) =>
      delay(() => {
        const project = staffProject(code, 'run.write')
        const parsed = bugReportingSettingsSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        const next: BugReportingSettings = {
          is_public: parsed.data.is_public,
          public_fields: onlyBugFields(parsed.data.public_fields),
          public_intro: parsed.data.public_intro ?? null,
          accept_reports: parsed.data.accept_reports,
        }
        removeWhere(db.bugReporting, (b) => b.projectId === project.id)
        db.bugReporting.push({
          projectId: project.id,
          ...next,
          public_fields: [...next.public_fields],
        })
        return next
      }),

    listPublicReports: (code) =>
      delay(() => {
        const project = staffProject(code, 'run.write')
        const all = db.defects
          .filter((d) => d.projectId === project.id && !d.duplicateOf)
          .sort(newestCreatedFirst)
        return all
          .filter((d) => d.source_kind === 'PUBLIC' && !d.reviewedAt)
          .slice(0, 200)
          .map((d): PublicReportItem => ({
            ...bugDto(d, null),
            priority_code: d.priority_code,
            scenario: null,
            reporter: d.legacyReporterName ?? null,
            contact: d.reporterContact ?? null,
            similar: similarTo(`${d.title} ${d.description || ''}`, all, d.id),
          }))
      }),

    reviewPublicReport: (code, defectId, input) =>
      delay(() => {
        const project = staffProject(code, 'run.write')
        const parsed = defectReviewSchema.safeParse(input)
        if (!parsed.success) return invalid(parsed.error.issues)
        reviewDefect(project.id, defectId, parsed.data)
      }),

    /** Throw away a public report that is not a real problem (spam, test, wrong place). */
    deletePublicReport: (code, defectId) =>
      delay(() => {
        const project = staffProject(code, 'run.write')
        const d =
          db.defects.find(
            (x) =>
              x.id === defectId &&
              x.projectId === project.id &&
              x.source_kind === 'PUBLIC' &&
              !x.reviewedAt,
          ) ?? notFound()
        removeWhere(db.defects, (x) => x.id === d.id)
        for (const other of db.defects) if (other.duplicateOf === d.id) other.duplicateOf = null
      }),
  }

  /** What the UAT side (mock-uat.ts) shares with the table side and the public pages. */
  const core = {
    moduleRef,
    caseOf,
    runCaseOf,
    runCasesOf,
    statusOf,
    tableOfUser,
    membersOf,
    memberAccount,
    ensureCardAccount,
    tableModules,
    tableDto,
    freeCode,
    bugDto,
    casesOf,
    uatBugs,
    uatFeatures,
    uatTotals,
    uatPublicFields,
    bugText,
    similarTo,
    reviewDefect,
    /** "+1" given by these accounts (the groups of a UAT). */
    confirmationsBy: (userIds: Set<string>) => confirmations.filter((c) => userIds.has(c.userId)),
    /** A new card code or a blocked card signs the table's device out. */
    endSessionOf: (tableId: string) => {
      if (sessionTableId === tableId) sessionTableId = null
    },
  }

  return {
    methods,
    core,
    /** The card session overrides the staff user while it is active. */
    currentUser: (): CurrentUser | null => {
      const t = db.tables.find((x) => x.id === sessionTableId)
      return t ? tableUser(t) : null
    },
    signOut: () => {
      sessionTableId = null
    },
  }
}

export type WorkshopCore = ReturnType<typeof createMockWorkshop>['core']
