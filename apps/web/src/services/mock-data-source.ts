import {
  canTransitionDefect,
  DEFECT_FIELDS,
  defectCommentSchema,
  defectCreateSchema,
  defectEditableFields,
  defectStatusSchema,
  defectUpdateSchema,
  roleCan,
  type DefectActor,
  type DefectField,
  type Permission,
  countStatuses,
  emptySeverityCounts,
  isOpenDefect,
  latestStatus,
  PAGINATION,
  stepsFromText,
  canTransitionRun,
  cycleCreateSchema,
  cycleUpdateSchema,
  executionCreateSchema,
  runCreateSchema,
  runUpdateSchema,
  type CaseSnapshot,
  type CycleDto,
  type ExecutionDto,
  type RunCaseDetail,
  testCaseCreateSchema,
  testCaseUpdateSchema,
  type AdminUserDto,
  type CurrentUser,
  type Locale,
  type MemberDto,
  type MemberRole,
  type SuiteDto,
  type DashboardSummary,
  type DefectDetail,
  type DefectListItem,
  type ModuleDto,
  type Paginated,
  type ProjectSummary,
  type RunCaseRow,
  type TestCaseDetail,
  type TestCaseListItem,
  type TestRunDetail,
  type TestRunSummary,
  type UserRef,
} from '@testboard/shared'
import {
  createMockDb,
  type MockCase,
  type MockDb,
  type MockDefect,
  type MockRun,
} from '../mocks/seed'
import { ApiClientError } from './api-client'
import type {
  AddRunCasesResult,
  DataSource,
  DefectQuery,
  PageQuery,
  TestCaseInput,
  TestCaseQuery,
} from './data-source'

function notFound(): never {
  throw new ApiClientError(404, 'NOT_FOUND', 'Not found', 'mock-request')
}

function fail(
  status: number,
  code: 'CONFLICT' | 'VALIDATION_ERROR',
  field: string,
  message: string,
): never {
  throw new ApiClientError(status, code, message, 'mock-request', [{ field, message }])
}

function validationError(issues: { path: PropertyKey[]; message: string }[]): never {
  throw new ApiClientError(
    422,
    'VALIDATION_ERROR',
    'The submitted data is invalid.',
    'mock-request',
    issues.map((issue) => ({ field: issue.path.map(String).join('.'), message: issue.message })),
  )
}

export function paginate<T>(items: T[], query: PageQuery = {}): Paginated<T> {
  const pageSize = Math.min(
    Math.max(1, query.page_size ?? PAGINATION.defaultPageSize),
    PAGINATION.maxPageSize,
  )
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const page = Math.min(Math.max(1, query.page ?? 1), pages)
  return {
    data: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    page_size: pageSize,
    total: items.length,
  }
}

/** In-memory implementation of the API contract over fictitious data. */
export function createMockDataSource(
  options: { latencyMs?: number; db?: MockDb; superAdmin?: boolean } = {},
): DataSource {
  const latencyMs = options.latencyMs ?? 200
  const db = options.db ?? createMockDb()
  const delay = <T>(value: () => T): Promise<T> =>
    new Promise((resolve, reject) =>
      setTimeout(() => {
        try {
          resolve(value())
        } catch (error) {
          reject(error)
        }
      }, latencyMs),
    )

  const userRef = (userId: string | null): UserRef | null => {
    const user = db.users.find((u) => u.id === userId)
    return user ? { id: user.id, display_name: user.display_name } : null
  }

  // Project scoping: only projects where the current user is a member are visible.
  const project = (code: string) => {
    const found = db.projects.find(
      (p) => p.project_code === code && p.members.some((m) => m.userId === db.currentUserId),
    )
    return found ?? notFound()
  }
  const roleIn = (projectId: string) =>
    db.projects.find((p) => p.id === projectId)?.members.find((m) => m.userId === db.currentUserId)
      ?.role ?? 'VIEWER'

  const moduleDto = (moduleId: string | null): ModuleDto | null => {
    const m = db.modules.find((x) => x.id === moduleId)
    return m ? { id: m.id, module_code: m.module_code, name: m.name } : null
  }

  const attemptsOf = (runCaseId: string) => db.executions.filter((e) => e.runCaseId === runCaseId)

  const runCaseRows = (run: MockRun): RunCaseRow[] =>
    db.runCases
      .filter((rc) => rc.runId === run.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((rc) => {
        const testCase = db.cases.find((c) => c.id === rc.caseId) as MockCase
        const attempts = attemptsOf(rc.id)
        const last = [...attempts].sort((a, b) => b.attempt_number - a.attempt_number)[0]
        const executionIds = new Set(attempts.map((e) => e.id))
        return {
          run_case_id: rc.id,
          test_case_id: testCase.id,
          case_code: testCase.case_code,
          title: rc.snapshot?.title ?? testCase.title,
          module_code: moduleDto(testCase.moduleId)?.module_code ?? null,
          case_version: rc.case_version,
          assigned_to: userRef(rc.assignedTo),
          latest_status: latestStatus(attempts),
          attempts: attempts.length,
          last_tested_at: last?.tested_at ?? null,
          defect_codes: db.defects
            .filter((d) => d.executionIds.some((eid) => executionIds.has(eid)))
            .map((d) => d.bug_code),
        }
      })

  const runSummary = (run: MockRun): TestRunSummary => {
    const rows = runCaseRows(run)
    const cycle = db.cycles.find((c) => c.id === run.cycleId)
    return {
      id: run.id,
      run_code: run.run_code,
      name: run.name,
      cycle: cycle ? { id: cycle.id, cycle_code: cycle.cycle_code, title: cycle.title } : null,
      environment_name: run.environment_name,
      build_version: run.build_version,
      status_code: run.status_code,
      starts_at: run.starts_at,
      ends_at: run.ends_at,
      total_cases: rows.length,
      counts: countStatuses(rows.map((r) => r.latest_status)),
    }
  }

  const caseListItem = (c: MockCase): TestCaseListItem => ({
    id: c.id,
    case_code: c.case_code,
    title: c.title,
    module: moduleDto(c.moduleId),
    category: c.category,
    priority_code: c.priority_code,
    test_type_code: c.test_type_code,
    case_status: c.case_status,
    current_version: c.current_version,
    updated_at: c.updated_at,
    updated_by: userRef(c.updatedBy),
  })

  const defectListItem = (d: MockDefect): DefectListItem => ({
    id: d.id,
    bug_code: d.bug_code,
    title: d.title,
    status_code: d.status_code,
    severity_code: d.severity_code,
    priority_code: d.priority_code,
    module: moduleDto(d.moduleId),
    reported_by: userRef(d.reportedBy),
    assigned_to: userRef(d.assignedTo),
    created_at: d.created_at,
    updated_at: d.updated_at,
  })

  const projectDefects = (projectId: string) =>
    db.defects
      .filter((d) => d.projectId === projectId)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))

  const projectSummary = (p: MockDb['projects'][number]): ProjectSummary => ({
    id: p.id,
    project_code: p.project_code,
    name: p.name,
    description: p.description,
    role_code: roleIn(p.id),
    is_archived: false,
    counts: {
      test_cases: db.cases.filter((c) => c.projectId === p.id && c.case_status !== 'ARCHIVED')
        .length,
      runs: db.runs.filter((r) => r.projectId === p.id).length,
      open_defects: db.defects.filter((d) => d.projectId === p.id && isOpenDefect(d.status_code))
        .length,
    },
  })

  // ---- Demo-only mutable state (in memory; resets on reload) ----------------------
  const profile: { locale: Locale } = { locale: 'id' }
  // The demo user is shown as Super Admin so every screen of the prototype can be explored.
  const superAdmins = new Set<string>(options.superAdmin === false ? [] : [db.currentUserId])
  const inactive = new Set<string>()
  let sequence = 900_000
  const newId = () => String(++sequence)
  const now = () => new Date().toISOString()

  interface MockSuite {
    id: string
    projectId: string
    moduleId: string | null
    name: string
    reference_document: string | null
    reference_version: string | null
    created_at: string
  }
  const suites: MockSuite[] = []
  for (const c of db.cases) {
    if (!suites.some((s) => s.projectId === c.projectId && s.name === c.suiteName)) {
      suites.push({
        id: newId(),
        projectId: c.projectId,
        moduleId: c.moduleId,
        name: c.suiteName,
        reference_document: null,
        reference_version: null,
        created_at: c.created_at,
      })
    }
  }
  const suiteNameOf = (projectId: string, suiteId: string | null | undefined): string | null => {
    if (!suiteId) return null
    const suite = suites.find((s) => s.id === suiteId && s.projectId === projectId)
    return suite ? suite.name : fail(422, 'VALIDATION_ERROR', 'suite_id', 'Suite not found')
  }
  const suiteDto = (s: MockSuite): SuiteDto => ({
    id: s.id,
    name: s.name,
    module: moduleDto(s.moduleId),
    description: null,
    reference_document: s.reference_document,
    reference_url: null,
    reference_version: s.reference_version,
    owner_unit: null,
    scope_description: null,
    preparation_date: null,
    source_notes: null,
    case_count: db.cases.filter(
      (c) => c.projectId === s.projectId && c.suiteName === s.name && c.case_status !== 'ARCHIVED',
    ).length,
    created_at: s.created_at,
  })

  const currentUser = (): CurrentUser => {
    const user = db.users.find((u) => u.id === db.currentUserId) ?? notFound()
    return {
      id: user.id,
      display_name: user.display_name,
      email: user.email,
      preferred_locale: profile.locale,
      is_super_admin: superAdmins.has(user.id),
      projects: db.projects
        .filter((p) => p.members.some((m) => m.userId === user.id))
        .map((p) => ({ project_code: p.project_code, role_code: roleIn(p.id) })),
    }
  }

  const memberDto = (userId: string, role: MemberRole): MemberDto => {
    const user = db.users.find((u) => u.id === userId) ?? notFound()
    return {
      user: {
        id: user.id,
        display_name: user.display_name,
        email: user.email,
        is_active: !inactive.has(user.id),
      },
      role_code: role,
      joined_at: '2026-10-01T02:00:00.000Z',
    }
  }

  const adminUser = (userId: string): AdminUserDto => {
    const user = db.users.find((u) => u.id === userId) ?? notFound()
    return {
      id: user.id,
      display_name: user.display_name,
      email: user.email,
      preferred_locale: 'id',
      is_active: !inactive.has(user.id),
      is_super_admin: superAdmins.has(user.id),
      created_at: '2026-10-01T02:00:00.000Z',
    }
  }

  const caseIn = (projectId: string, caseId: string) =>
    db.cases.find((c) => c.id === caseId && c.projectId === projectId) ?? notFound()

  const nextCode = (projectId: string, moduleCode: string | null) => {
    const prefix = `UAT-${moduleCode ?? 'CASE'}-`
    const max = db.cases
      .filter((c) => c.projectId === projectId && c.case_code.startsWith(prefix))
      .reduce((m, c) => Math.max(m, Number.parseInt(c.case_code.slice(prefix.length), 10) || 0), 0)
    return `${prefix}${String(max + 1).padStart(3, '0')}`
  }

  const moduleIdByCode = (projectId: string, code: string | null | undefined) => {
    if (code === undefined) return undefined
    if (code === null) return null
    const found = db.modules.find((m) => m.projectId === projectId && m.module_code === code)
    return found ? found.id : fail(422, 'VALIDATION_ERROR', 'module_code', 'Module not found')
  }

  const addRevision = (c: MockCase, reason: string) => {
    c.revisions.push({
      revision_number: c.current_version,
      changedBy: db.currentUserId,
      change_reason: reason,
      changed_at: now(),
    })
  }

  const assertKeepsAdmin = (members: { role: MemberRole }[], member: { role: MemberRole }) => {
    if (member.role === 'ADMIN' && members.filter((m) => m.role === 'ADMIN').length === 1) {
      fail(409, 'CONFLICT', 'role_code', 'A project must keep at least one ADMIN.')
    }
  }

  // ---- Milestone 4: bug workflow (demo, same rules as the API, ADR 0007) ------------
  const effectiveRole = (projectId: string): MemberRole =>
    superAdmins.has(db.currentUserId) ? 'ADMIN' : roleIn(projectId)
  const forbidden = (message: string, fields: string[] = []): never => {
    throw new ApiClientError(
      403,
      'FORBIDDEN',
      message,
      'mock-request',
      fields.map((field) => ({ field, message: 'Not allowed for your role' })),
    )
  }
  const requireRole = (projectId: string, permission: Permission) => {
    if (!roleCan(effectiveRole(projectId), permission)) forbidden('Not allowed.')
  }
  const defectIn = (projectId: string, defectId: string) =>
    db.defects.find((d) => d.id === defectId && d.projectId === projectId) ?? notFound()
  const defectActor = (projectId: string, d: MockDefect): DefectActor => ({
    role: effectiveRole(projectId),
    isAssignee: d.assignedTo === db.currentUserId,
    isReporter: d.reportedBy === db.currentUserId,
  })
  const assertDefectAssignee = (projectId: string, userId: string | null | undefined) => {
    if (!userId) return
    const member = db.projects
      .find((p) => p.id === projectId)
      ?.members.find((m) => m.userId === userId)
    if (!member || member.role === 'VIEWER' || inactive.has(userId)) {
      fail(422, 'VALIDATION_ERROR', 'assigned_to', 'Assignee must be an active project member')
    }
  }
  const assertDefectModule = (projectId: string, moduleId: string | null | undefined) => {
    if (moduleId && !db.modules.some((m) => m.id === moduleId && m.projectId === projectId)) {
      fail(422, 'VALIDATION_ERROR', 'module_id', 'Module not found in this project')
    }
  }
  const executionInProject = (projectId: string, executionId: string) => {
    const exec = db.executions.find((e) => e.id === executionId)
    const rc = db.runCases.find((x) => x.id === exec?.runCaseId)
    return db.runs.some((r) => r.id === rc?.runId && r.projectId === projectId)
  }
  const nextBugCode = (p: MockDb['projects'][number]) => {
    const codes = db.defects.filter((d) => d.projectId === p.id).map((d) => d.bug_code)
    const segment =
      p.project_code
        .split(/[^A-Z0-9]+/)
        .filter(Boolean)
        .at(-1) ?? 'PRJ'
    const prefix =
      p.bugPrefix || codes.at(-1)?.match(/^(.+)-\d+$/)?.[1] || `BUG-${segment.slice(0, 3)}`
    const max = codes.reduce((m, c) => {
      const tail = c.startsWith(`${prefix}-`) ? c.slice(prefix.length + 1) : ''
      return /^\d+$/.test(tail) ? Math.max(m, Number.parseInt(tail, 10)) : m
    }, 0)
    return `${prefix}-${String(max + 1).padStart(4, '0')}`
  }
  /** API field name -> mock property; text fields are stored as '' when empty. */
  const DEFECT_PROP: Record<DefectField, keyof MockDefect> = {
    title: 'title',
    description: 'description',
    steps_to_reproduce: 'steps_to_reproduce',
    expected_behavior: 'expected_behavior',
    actual_behavior: 'actual_behavior',
    module_id: 'moduleId',
    severity_code: 'severity_code',
    priority_code: 'priority_code',
    environment_name: 'environment_name',
    build_version: 'build_version',
    browser_name: 'browser_name',
    assigned_to: 'assignedTo',
    fixed_in_version: 'fixed_in_version',
  }
  const NULLABLE_PROPS = new Set<keyof MockDefect>(['moduleId', 'assignedTo', 'fixed_in_version'])
  const defectDetail = (d: MockDefect): DefectDetail => ({
    ...defectListItem(d),
    description: d.description || null,
    steps_to_reproduce: d.steps_to_reproduce || null,
    expected_behavior: d.expected_behavior || null,
    actual_behavior: d.actual_behavior || null,
    source_kind: d.source_kind,
    environment_name: d.environment_name || null,
    build_version: d.build_version || null,
    browser_name: d.browser_name || null,
    fixed_in_version: d.fixed_in_version,
    linked_executions: d.executionIds.flatMap((eid) => {
      const exec = db.executions.find((e) => e.id === eid)
      const rc = db.runCases.find((x) => x.id === exec?.runCaseId)
      const run = db.runs.find((r) => r.id === rc?.runId)
      const c = db.cases.find((x) => x.id === rc?.caseId)
      if (!exec || !rc || !run || !c) return []
      return [
        {
          execution_id: exec.id,
          run_id: run.id,
          run_code: run.run_code,
          run_case_id: rc.id,
          case_code: c.case_code,
          attempt_number: exec.attempt_number,
          result_status: exec.result_status,
          tested_at: exec.tested_at,
        },
      ]
    }),
    history: d.history.map((h) => ({
      from_status: h.from,
      to_status: h.to,
      changed_by: userRef(h.by),
      change_comment: h.comment,
      changed_at: h.at,
    })),
    comments: d.comments.map((c) => ({
      id: c.id,
      author: userRef(c.authorId),
      body: c.body,
      created_at: c.created_at,
    })),
    files: [],
  })
  const defectReplays = new Map<string, DefectDetail>()

  // ---- Milestone 3: cycles, runs and executions (demo, in memory) -------------------
  const conflict = (message: string): never => {
    throw new ApiClientError(409, 'CONFLICT', message, 'mock-request')
  }
  const snapshotOfCase = (c: MockCase): CaseSnapshot => ({
    case_code: c.case_code,
    title: c.title,
    version: c.current_version,
    module_code: moduleDto(c.moduleId)?.module_code ?? null,
    category: c.category || null,
    priority_code: c.priority_code,
    test_type_code: c.test_type_code,
    actor_label: c.actor_label || null,
    preconditions: c.preconditions || null,
    test_steps_text: c.steps.map((step, i) => `${i + 1}. ${step}`).join('\n') || null,
    steps: c.steps.map((instruction, i) => ({
      step_number: i + 1,
      instruction,
      expected_result: null,
    })),
    expected_result: c.expected_result,
  })
  const runIn = (projectId: string, runId: string) =>
    db.runs.find((r) => r.id === runId && r.projectId === projectId) ?? notFound()
  const cycleDto = (cy: MockDb['cycles'][number]): CycleDto => ({
    id: cy.id,
    cycle_code: cy.cycle_code,
    title: cy.title,
    description: cy.description ?? null,
    status_code: cy.status_code ?? 'ACTIVE',
    starts_on: cy.starts_on ?? null,
    ends_on: cy.ends_on ?? null,
    run_count: db.runs.filter((r) => r.cycleId === cy.id).length,
  })
  const executionDto = (e: MockDb['executions'][number]): ExecutionDto => ({
    id: e.id,
    attempt_number: e.attempt_number,
    execution_kind: e.execution_kind,
    result_status: e.result_status,
    actual_result: e.actual_result,
    notes: e.notes ?? null,
    tester: userRef(e.testerId),
    legacy_tester_name: null,
    tested_at: e.tested_at,
    browser_name: e.browser_name ?? null,
    device_name: e.device_name ?? null,
    operating_system: e.operating_system ?? null,
    step_results: e.step_results ?? [],
    files: [],
  })
  const assertRunEditable = (run: MockRun, allowCompleted = false) => {
    if (run.status_code === 'LOCKED' || (run.status_code === 'COMPLETED' && !allowCompleted)) {
      conflict(`The run is ${run.status_code.toLowerCase()} and cannot be changed.`)
    }
  }
  const assertAssignee = (projectId: string, userId: string | null | undefined) => {
    if (!userId) return
    const member = db.projects
      .find((p) => p.id === projectId)
      ?.members.find((m) => m.userId === userId)
    if (!member || !['ADMIN', 'QA_LEAD', 'TESTER'].includes(member.role) || inactive.has(userId)) {
      fail(
        422,
        'VALIDATION_ERROR',
        'assigned_to',
        'Assignee must be an active ADMIN, QA_LEAD or TESTER member',
      )
    }
  }
  const replays = new Map<string, ExecutionDto>()

  return {
    kind: 'mock',

    getHealth: () =>
      delay(() => ({
        status: 'ok' as const,
        service: 'testboard-api' as const,
        version: 'demo',
        time: new Date().toISOString(),
        database: 'not_configured' as const,
      })),

    getCurrentUser: () => delay(currentUser),
    login: () => delay(currentUser),
    logout: () => delay(() => undefined),
    updateProfile: (input) =>
      delay(() => {
        const user = db.users.find((u) => u.id === db.currentUserId) ?? notFound()
        if (input.display_name) user.display_name = input.display_name
        if (input.preferred_locale) profile.locale = input.preferred_locale
        return currentUser()
      }),
    changePassword: () => delay(() => undefined),

    listMembers: (code) =>
      delay(() =>
        project(code)
          .members.map((m) => memberDto(m.userId, m.role))
          .sort((a, b) => a.user.display_name.localeCompare(b.user.display_name)),
      ),
    addMember: (code, input) =>
      delay(() => {
        const p = project(code)
        const user = db.users.find((u) => u.email === input.email.trim().toLowerCase())
        if (!user) return fail(422, 'VALIDATION_ERROR', 'email', 'No account with this e-mail')
        if (p.members.some((m) => m.userId === user.id)) {
          fail(409, 'CONFLICT', 'email', 'Already a member')
        }
        p.members.push({ userId: user.id, role: input.role_code })
        return memberDto(user.id, input.role_code)
      }),
    updateMember: (code, userId, role) =>
      delay(() => {
        const p = project(code)
        const member = p.members.find((m) => m.userId === userId) ?? notFound()
        if (role !== 'ADMIN') assertKeepsAdmin(p.members, member)
        member.role = role
        return memberDto(userId, role)
      }),
    removeMember: (code, userId) =>
      delay(() => {
        const p = project(code)
        const member = p.members.find((m) => m.userId === userId) ?? notFound()
        assertKeepsAdmin(p.members, member)
        p.members.splice(p.members.indexOf(member), 1)
      }),
    createModule: (code, input) =>
      delay(() => {
        const p = project(code)
        const moduleCode = input.module_code.trim().toUpperCase()
        if (db.modules.some((m) => m.projectId === p.id && m.module_code === moduleCode)) {
          fail(409, 'CONFLICT', 'module_code', 'Already used')
        }
        const created = {
          id: newId(),
          projectId: p.id,
          module_code: moduleCode,
          name: input.name.trim(),
        }
        db.modules.push(created)
        return {
          id: created.id,
          module_code: created.module_code,
          name: created.name,
          description: input.description ?? null,
        }
      }),
    listSuites: (code) =>
      delay(() => {
        const p = project(code)
        return suites
          .filter((s) => s.projectId === p.id)
          .map(suiteDto)
          .sort((a, b) => a.name.localeCompare(b.name))
      }),
    createSuite: (code, input) =>
      delay(() => {
        const p = project(code)
        const suite: MockSuite = {
          id: newId(),
          projectId: p.id,
          moduleId: input.module_id ?? null,
          name: input.name.trim(),
          reference_document: input.reference_document ?? null,
          reference_version: input.reference_version ?? null,
          created_at: now(),
        }
        suites.push(suite)
        return suiteDto(suite)
      }),

    createTestCase: (code, input: TestCaseInput) =>
      delay(() => {
        const p = project(code)
        const parsed = testCaseCreateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        const moduleId = moduleIdByCode(p.id, data.module_code) ?? null
        const caseCode = data.case_code ?? nextCode(p.id, data.module_code ?? null)
        if (db.cases.some((c) => c.projectId === p.id && c.case_code === caseCode)) {
          fail(409, 'CONFLICT', 'case_code', 'Already used')
        }
        const created: MockCase = {
          id: newId(),
          projectId: p.id,
          moduleId: moduleId ?? '',
          suiteName: suiteNameOf(p.id, data.suite_id) ?? '',
          case_code: caseCode,
          category: data.category ?? '',
          title: data.title,
          requirement_refs: data.requirement_refs ?? null,
          priority_code: data.priority_code,
          test_type_code: data.test_type_code,
          actor_label: data.actor_label ?? '',
          preconditions: data.preconditions ?? '',
          steps: stepsFromText(data.test_steps_text).map((step) => step.instruction),
          expected_result: data.expected_result,
          case_status: data.case_status,
          current_version: 1,
          createdBy: db.currentUserId,
          updatedBy: db.currentUserId,
          created_at: now(),
          updated_at: now(),
          revisions: [],
        }
        addRevision(created, 'Created')
        db.cases.push(created)
        return caseListItem(created)
      }),
    updateTestCase: (code, caseId, input) =>
      delay(() => {
        const p = project(code)
        const c = caseIn(p.id, caseId)
        const parsed = testCaseUpdateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        if (data.expected_version !== undefined && data.expected_version !== c.current_version) {
          fail(409, 'CONFLICT', 'expected_version', `Current version is ${c.current_version}`)
        }
        const contentKeys = Object.keys(data).filter(
          (k) => !['case_status', 'change_reason', 'expected_version'].includes(k),
        )
        if (c.case_status === 'ARCHIVED' && contentKeys.length > 0) {
          throw new ApiClientError(
            409,
            'CONFLICT',
            'Restore the archived test case before editing it.',
            'mock-request',
          )
        }
        const moduleId = moduleIdByCode(p.id, data.module_code)
        if (moduleId !== undefined) c.moduleId = moduleId ?? ''
        if (data.suite_id !== undefined) c.suiteName = suiteNameOf(p.id, data.suite_id) ?? ''
        if (data.title !== undefined) c.title = data.title
        if (data.category !== undefined) c.category = data.category ?? ''
        if (data.requirement_refs !== undefined) c.requirement_refs = data.requirement_refs
        if (data.priority_code) c.priority_code = data.priority_code
        if (data.test_type_code) c.test_type_code = data.test_type_code
        if (data.actor_label !== undefined) c.actor_label = data.actor_label ?? ''
        if (data.preconditions !== undefined) c.preconditions = data.preconditions ?? ''
        if (data.test_steps_text !== undefined) {
          c.steps = stepsFromText(data.test_steps_text).map((step) => step.instruction)
        }
        if (data.expected_result !== undefined) c.expected_result = data.expected_result
        if (data.case_status) c.case_status = data.case_status
        c.current_version += 1
        c.updated_at = now()
        c.updatedBy = db.currentUserId
        addRevision(c, data.change_reason ?? 'Updated')
        return caseListItem(c)
      }),
    archiveTestCase: (code, caseId) =>
      delay(() => {
        const c = caseIn(project(code).id, caseId)
        if (c.case_status !== 'ARCHIVED') {
          c.case_status = 'ARCHIVED'
          c.current_version += 1
          c.updated_at = now()
          addRevision(c, 'Archived')
        }
        return caseListItem(c)
      }),
    cloneTestCase: (code, caseId) =>
      delay(() => {
        const p = project(code)
        const source = caseIn(p.id, caseId)
        const clone: MockCase = {
          ...source,
          id: newId(),
          case_code: nextCode(p.id, moduleDto(source.moduleId)?.module_code ?? null),
          case_status: 'DRAFT',
          current_version: 1,
          steps: [...source.steps],
          created_at: now(),
          updated_at: now(),
          createdBy: db.currentUserId,
          updatedBy: db.currentUserId,
          revisions: [],
        }
        addRevision(clone, `Cloned from ${source.case_code}`)
        db.cases.push(clone)
        return caseListItem(clone)
      }),

    listUsers: (q) =>
      delay(() => {
        const needle = q?.trim().toLowerCase()
        return db.users
          .filter(
            (u) =>
              !needle || u.email.includes(needle) || u.display_name.toLowerCase().includes(needle),
          )
          .map((u) => adminUser(u.id))
      }),
    createUser: (input) =>
      delay(() => {
        const email = input.email.trim().toLowerCase()
        if (db.users.some((u) => u.email === email)) fail(409, 'CONFLICT', 'email', 'Already used')
        const user = { id: newId(), display_name: input.display_name.trim(), email }
        db.users.push(user)
        if (input.is_super_admin) superAdmins.add(user.id)
        // Demo only: a visibly fake value; the real API returns a random password once.
        return { user: adminUser(user.id), temporary_password: 'Demo-Bukan-Kata-Sandi-Asli' }
      }),
    updateUser: (userId, input) =>
      delay(() => {
        const user = db.users.find((u) => u.id === userId) ?? notFound()
        const losesSuperAdmin =
          superAdmins.has(userId) && (input.is_super_admin === false || input.is_active === false)
        const activeAdmins = [...superAdmins].filter((id) => !inactive.has(id))
        if (losesSuperAdmin && activeAdmins.length <= 1) {
          throw new ApiClientError(
            409,
            'CONFLICT',
            'At least one active Super Admin must remain.',
            'mock-request',
          )
        }
        if (input.display_name) user.display_name = input.display_name
        if (input.is_active === false) inactive.add(userId)
        if (input.is_active === true) inactive.delete(userId)
        if (input.is_super_admin === true) superAdmins.add(userId)
        if (input.is_super_admin === false) superAdmins.delete(userId)
        return adminUser(userId)
      }),

    listProjects: () =>
      delay(() =>
        db.projects
          .filter((p) => p.members.some((m) => m.userId === db.currentUserId))
          .map(projectSummary),
      ),

    getProject: (code) => delay(() => projectSummary(project(code))),

    listModules: (code) =>
      delay(() => {
        const p = project(code)
        return db.modules
          .filter((m) => m.projectId === p.id)
          .map((m) => ({ id: m.id, module_code: m.module_code, name: m.name }))
      }),

    getDashboard: (code, filter = {}) =>
      delay((): DashboardSummary => {
        const p = project(code)
        const runs = db.runs.filter((r) => r.projectId === p.id)
        const scopedRuns = filter.run_id ? runs.filter((r) => r.id === filter.run_id) : runs
        if (filter.run_id && scopedRuns.length === 0) notFound()
        const rows = scopedRuns.flatMap(runCaseRows)
        const openDefects = db.defects.filter(
          (d) => d.projectId === p.id && isOpenDefect(d.status_code),
        )
        const bySeverity = emptySeverityCounts()
        for (const d of openDefects) bySeverity[d.severity_code] += 1
        return {
          project_code: p.project_code,
          run_id: filter.run_id ?? null,
          total_run_cases: rows.length,
          counts: countStatuses(rows.map((r) => r.latest_status)),
          open_defects: openDefects.length,
          critical_high_open_defects: bySeverity.CRITICAL + bySeverity.HIGH,
          open_defects_by_severity: bySeverity,
          runs: runs
            .map(runSummary)
            .sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? '')),
          recent_defects: projectDefects(p.id).slice(0, 5).map(defectListItem),
        }
      }),

    listTestCases: (code, query: TestCaseQuery = {}) =>
      delay(() => {
        const p = project(code)
        const q = query.q?.trim().toLowerCase()
        const items = db.cases
          .filter((c) => c.projectId === p.id)
          .filter((c) => !query.module || moduleDto(c.moduleId)?.module_code === query.module)
          .filter((c) => !query.priority || c.priority_code === query.priority)
          .filter((c) => !query.type || c.test_type_code === query.type)
          .filter((c) =>
            query.status ? c.case_status === query.status : c.case_status !== 'ARCHIVED',
          )
          .filter(
            (c) => !q || c.case_code.toLowerCase().includes(q) || c.title.toLowerCase().includes(q),
          )
          .sort((a, b) => a.case_code.localeCompare(b.case_code))
          .map(caseListItem)
        return paginate(items, query)
      }),

    getTestCase: (code, caseId) =>
      delay((): TestCaseDetail => {
        const p = project(code)
        const c = db.cases.find((x) => x.id === caseId && x.projectId === p.id) ?? notFound()
        return {
          ...caseListItem(c),
          suite_name: c.suiteName,
          requirement_refs: c.requirement_refs,
          actor_label: c.actor_label,
          preconditions: c.preconditions,
          test_steps_text: c.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
          expected_result: c.expected_result,
          source_locale: 'id',
          source_kind: 'MANUAL',
          created_at: c.created_at,
          created_by: userRef(c.createdBy),
          steps: c.steps.map((instruction, i) => ({
            step_number: i + 1,
            instruction,
            expected_result: null,
          })),
          revisions: [...c.revisions]
            .sort((a, b) => b.revision_number - a.revision_number)
            .map((r) => ({
              revision_number: r.revision_number,
              changed_by: userRef(r.changedBy),
              change_reason: r.change_reason,
              changed_at: r.changed_at,
            })),
          used_in_runs: db.runCases
            .filter((rc) => rc.caseId === c.id)
            .map((rc) => {
              const run = db.runs.find((r) => r.id === rc.runId) as MockRun
              const attempts = attemptsOf(rc.id)
              return {
                run_id: run.id,
                run_code: run.run_code,
                run_name: run.name,
                run_case_id: rc.id,
                case_version: rc.case_version,
                latest_status: latestStatus(attempts),
                attempts: attempts.length,
              }
            }),
          files: [],
        }
      }),

    listRuns: (code) =>
      delay(() => {
        const p = project(code)
        return db.runs
          .filter((r) => r.projectId === p.id)
          .map(runSummary)
          .sort((a, b) => (b.starts_at ?? '').localeCompare(a.starts_at ?? ''))
      }),

    getRun: (code, runId) =>
      delay((): TestRunDetail => {
        const p = project(code)
        const run = db.runs.find((r) => r.id === runId && r.projectId === p.id) ?? notFound()
        return {
          ...runSummary(run),
          environment_url: run.environment_url,
          run_cases: runCaseRows(run),
        }
      }),

    listCycles: (code) =>
      delay(() => {
        const p = project(code)
        return db.cycles.filter((cy) => cy.projectId === p.id).map(cycleDto)
      }),
    createCycle: (code, input) =>
      delay(() => {
        const p = project(code)
        const parsed = cycleCreateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        if (db.cycles.some((cy) => cy.projectId === p.id && cy.cycle_code === data.cycle_code)) {
          fail(409, 'CONFLICT', 'cycle_code', 'Already used')
        }
        const cycle = {
          id: newId(),
          projectId: p.id,
          cycle_code: data.cycle_code,
          title: data.title,
          description: data.description ?? null,
          status_code: data.status_code,
          starts_on: data.starts_on ?? null,
          ends_on: data.ends_on ?? null,
        }
        db.cycles.push(cycle)
        return cycleDto(cycle)
      }),
    updateCycle: (code, cycleId, input) =>
      delay(() => {
        const p = project(code)
        const cycle =
          db.cycles.find((cy) => cy.id === cycleId && cy.projectId === p.id) ?? notFound()
        const parsed = cycleUpdateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        Object.assign(
          cycle,
          Object.fromEntries(Object.entries(parsed.data).filter(([, v]) => v !== undefined)),
        )
        return cycleDto(cycle)
      }),

    createRun: (code, input) =>
      delay(() => {
        const p = project(code)
        const parsed = runCreateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        const prefix = `RUN-${now().slice(0, 10).replace(/-/g, '')}-`
        const n =
          db.runs.filter((r) => r.projectId === p.id && r.run_code.startsWith(prefix)).length + 1
        const runCode = data.run_code ?? `${prefix}${n}`
        if (db.runs.some((r) => r.projectId === p.id && r.run_code === runCode)) {
          fail(409, 'CONFLICT', 'run_code', 'Already used')
        }
        const run: MockRun = {
          id: newId(),
          projectId: p.id,
          cycleId: data.cycle_id ?? '',
          run_code: runCode,
          name: data.name,
          environment_name: data.environment_name ?? '',
          build_version: data.build_version ?? '',
          environment_url: data.environment_url ?? '',
          status_code: 'PLANNED',
          starts_at: null,
          ends_at: null,
        }
        db.runs.push(run)
        return runSummary(run)
      }),
    updateRun: (code, runId, input) =>
      delay(() => {
        const run = runIn(project(code).id, runId)
        assertRunEditable(run, true)
        const parsed = runUpdateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        if (data.name) run.name = data.name
        if (data.cycle_id !== undefined) run.cycleId = data.cycle_id ?? ''
        if (data.environment_name !== undefined) run.environment_name = data.environment_name ?? ''
        if (data.build_version !== undefined) run.build_version = data.build_version ?? ''
        if (data.environment_url !== undefined) run.environment_url = data.environment_url ?? ''
        return runSummary(run)
      }),
    changeRunStatus: (code, runId, status) =>
      delay(() => {
        const run = runIn(project(code).id, runId)
        if (!canTransitionRun(run.status_code, status)) {
          fail(409, 'CONFLICT', 'status_code', `Invalid transition ${run.status_code} -> ${status}`)
        }
        run.status_code = status
        if (status === 'ACTIVE') {
          run.starts_at ??= now()
          run.ends_at = null
        }
        if (status === 'COMPLETED') run.ends_at = now()
        return runSummary(run)
      }),
    addRunCases: (code, runId, input) =>
      delay(() => {
        const p = project(code)
        const run = runIn(p.id, runId)
        assertRunEditable(run)
        assertAssignee(p.id, input.assigned_to)
        const result: AddRunCasesResult = { added: 0, skipped: [] }
        let order = Math.max(
          0,
          ...db.runCases.filter((rc) => rc.runId === runId).map((rc) => rc.sort_order),
        )
        for (const caseId of [...new Set(input.test_case_ids)]) {
          const testCase = db.cases.find((c) => c.id === caseId && c.projectId === p.id)
          if (!testCase) result.skipped.push({ test_case_id: caseId, reason: 'NOT_FOUND' })
          else if (testCase.case_status !== 'READY')
            result.skipped.push({ test_case_id: caseId, reason: 'NOT_READY' })
          else if (db.runCases.some((rc) => rc.runId === runId && rc.caseId === caseId)) {
            result.skipped.push({ test_case_id: caseId, reason: 'ALREADY_IN_RUN' })
          } else {
            order += 1
            db.runCases.push({
              id: newId(),
              runId,
              caseId,
              assignedTo: input.assigned_to ?? null,
              case_version: testCase.current_version,
              sort_order: order,
              snapshot: snapshotOfCase(testCase),
            })
            result.added += 1
          }
        }
        return result
      }),
    removeRunCase: (code, runId, runCaseId) =>
      delay(() => {
        const run = runIn(project(code).id, runId)
        assertRunEditable(run)
        const index = db.runCases.findIndex((rc) => rc.id === runCaseId && rc.runId === runId)
        if (index < 0) notFound()
        if (attemptsOf(runCaseId).length > 0) {
          conflict('This case already has test results and cannot be removed from the run.')
        }
        db.runCases.splice(index, 1)
      }),
    assignRunCases: (code, runId, input) =>
      delay(() => {
        const p = project(code)
        const run = runIn(p.id, runId)
        assertRunEditable(run, true)
        assertAssignee(p.id, input.assigned_to)
        let updated = 0
        for (const rc of db.runCases) {
          if (rc.runId === runId && input.run_case_ids.includes(rc.id)) {
            rc.assignedTo = input.assigned_to
            updated += 1
          }
        }
        return { updated }
      }),
    getRunCase: (code, runCaseId) =>
      delay((): RunCaseDetail => {
        const p = project(code)
        const rc = db.runCases.find((x) => x.id === runCaseId) ?? notFound()
        const run = runIn(p.id, rc.runId)
        const testCase = db.cases.find((c) => c.id === rc.caseId) ?? notFound()
        const attempts = attemptsOf(rc.id).sort((a, b) => b.attempt_number - a.attempt_number)
        const executionIds = new Set(attempts.map((e) => e.id))
        const siblings = db.runCases
          .filter((x) => x.runId === run.id)
          .sort((a, b) => a.sort_order - b.sort_order)
        const index = siblings.findIndex((x) => x.id === rc.id)
        return {
          run_case_id: rc.id,
          test_case_id: testCase.id,
          run: {
            id: run.id,
            run_code: run.run_code,
            name: run.name,
            status_code: run.status_code,
            environment_name: run.environment_name || null,
            build_version: run.build_version || null,
            environment_url: run.environment_url || null,
          },
          case_version: rc.case_version,
          current_case_version: testCase.current_version,
          snapshot: rc.snapshot ?? snapshotOfCase(testCase),
          assigned_to: userRef(rc.assignedTo),
          latest_status: latestStatus(attempts),
          attempts: attempts.map(executionDto),
          linked_defects: db.defects
            .filter((d) => d.executionIds.some((id) => executionIds.has(id)))
            .map((d) => ({
              id: d.id,
              bug_code: d.bug_code,
              title: d.title,
              status_code: d.status_code,
              severity_code: d.severity_code,
            })),
          previous_run_case_id: siblings[index - 1]?.id ?? null,
          next_run_case_id: siblings[index + 1]?.id ?? null,
        }
      }),
    createExecution: (code, runCaseId, input, idempotencyKey) =>
      delay(() => {
        const replayKey = `${runCaseId}:${idempotencyKey}`
        const replay = replays.get(replayKey)
        if (replay) return replay
        const p = project(code)
        const rc = db.runCases.find((x) => x.id === runCaseId) ?? notFound()
        const run = runIn(p.id, rc.runId)
        if (run.status_code !== 'ACTIVE')
          conflict('Tests can only be recorded while the run is ACTIVE.')
        const role = roleIn(p.id)
        if (
          !superAdmins.has(db.currentUserId) &&
          role === 'TESTER' &&
          rc.assignedTo !== db.currentUserId
        ) {
          throw new ApiClientError(
            403,
            'FORBIDDEN',
            'This test case is assigned to someone else.',
            'mock-request',
          )
        }
        if (!['ADMIN', 'QA_LEAD', 'TESTER'].includes(role) && !superAdmins.has(db.currentUserId)) {
          throw new ApiClientError(403, 'FORBIDDEN', 'Not allowed.', 'mock-request')
        }
        const parsed = executionCreateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        const attempt = attemptsOf(runCaseId).reduce((m, e) => Math.max(m, e.attempt_number), 0) + 1
        const execution = {
          id: newId(),
          runCaseId,
          attempt_number: attempt,
          execution_kind:
            attempt === 1 ? ('INITIAL' as const) : (data.execution_kind ?? ('RETEST' as const)),
          result_status: data.result_status,
          actual_result: data.actual_result ?? null,
          notes: data.notes ?? null,
          testerId: db.currentUserId,
          tested_at: now(),
          browser_name: data.browser_name ?? null,
          device_name: data.device_name ?? null,
          operating_system: data.operating_system ?? null,
          step_results: (data.step_results ?? []).map((s) => ({
            step_number: s.step_number,
            result_status: s.result_status,
            actual_result: s.actual_result ?? null,
          })),
        }
        db.executions.push(execution)
        const dto = executionDto(execution)
        replays.set(replayKey, dto)
        return dto
      }),

    listDefects: (code, query: DefectQuery = {}) =>
      delay(() => {
        const p = project(code)
        const q = query.q?.trim().toLowerCase()
        const items = projectDefects(p.id)
          .filter((d) =>
            !query.status
              ? true
              : query.status === 'open'
                ? isOpenDefect(d.status_code)
                : d.status_code === query.status,
          )
          .filter((d) => !query.severity || d.severity_code === query.severity)
          .filter((d) => !query.priority || d.priority_code === query.priority)
          .filter(
            (d) =>
              !query.assigned_to ||
              (query.assigned_to === 'none'
                ? d.assignedTo === null
                : d.assignedTo === query.assigned_to),
          )
          .filter(
            (d) => !q || d.bug_code.toLowerCase().includes(q) || d.title.toLowerCase().includes(q),
          )
          .map(defectListItem)
        return paginate(items, query)
      }),

    getDefect: (code, defectId) => delay(() => defectDetail(defectIn(project(code).id, defectId))),

    createDefect: (code, input, idempotencyKey) =>
      delay(() => {
        const p = project(code)
        const replayKey = `${p.id}:${db.currentUserId}:${idempotencyKey}`
        const replay = defectReplays.get(replayKey)
        if (replay) return replay
        requireRole(p.id, 'defect.create')
        const parsed = defectCreateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        const role = effectiveRole(p.id)
        if (data.assigned_to && role !== 'ADMIN' && role !== 'QA_LEAD') {
          forbidden('Only an ADMIN or QA_LEAD can assign a bug.', ['assigned_to'])
        }
        assertDefectModule(p.id, data.module_id)
        assertDefectAssignee(p.id, data.assigned_to)
        const executionIds = [...new Set(data.execution_ids ?? [])]
        if (executionIds.some((id) => !executionInProject(p.id, id))) {
          fail(422, 'VALIDATION_ERROR', 'execution_ids', 'Test attempt not found in this project')
        }
        const bugCode = data.bug_code ?? nextBugCode(p)
        if (db.defects.some((d) => d.projectId === p.id && d.bug_code === bugCode)) {
          fail(409, 'CONFLICT', 'bug_code', 'Already used')
        }
        const at = now()
        const defect: MockDefect = {
          id: newId(),
          projectId: p.id,
          moduleId: data.module_id ?? null,
          bug_code: bugCode,
          title: data.title,
          description: data.description ?? '',
          steps_to_reproduce: data.steps_to_reproduce ?? '',
          expected_behavior: data.expected_behavior ?? '',
          actual_behavior: data.actual_behavior ?? '',
          severity_code: data.severity_code,
          priority_code: data.priority_code,
          status_code: 'OPEN',
          source_kind: data.source_kind,
          environment_name: data.environment_name ?? '',
          build_version: data.build_version ?? '',
          browser_name: data.browser_name ?? '',
          fixed_in_version: data.fixed_in_version ?? null,
          reportedBy: db.currentUserId,
          assignedTo: data.assigned_to ?? null,
          created_at: at,
          updated_at: at,
          executionIds,
          history: [{ from: null, to: 'OPEN', by: db.currentUserId, comment: null, at }],
          comments: [],
        }
        db.defects.push(defect)
        const dto = defectDetail(defect)
        defectReplays.set(replayKey, dto)
        return dto
      }),

    updateDefect: (code, defectId, input) =>
      delay(() => {
        const p = project(code)
        const d = defectIn(p.id, defectId)
        requireRole(p.id, 'defect.update')
        const parsed = defectUpdateSchema.safeParse(input)
        if (!parsed.success) return validationError(parsed.error.issues)
        const data = parsed.data
        if (
          data.expected_updated_at &&
          new Date(data.expected_updated_at).toISOString() !== d.updated_at
        ) {
          conflict('This bug was changed by someone else. Reload to see the latest version.')
        }
        const requested = DEFECT_FIELDS.filter((field) => data[field] !== undefined)
        const allowed = defectEditableFields(defectActor(p.id, d))
        const denied = requested.filter((field) => !allowed.includes(field))
        if (denied.length > 0) forbidden('You cannot change these fields of this bug.', denied)
        const changed = requested.filter(
          (field) => String(d[DEFECT_PROP[field]] ?? '') !== String(data[field] ?? ''),
        )
        if (changed.length === 0) return defectDetail(d)
        if (changed.includes('module_id')) assertDefectModule(p.id, data.module_id)
        if (changed.includes('assigned_to')) assertDefectAssignee(p.id, data.assigned_to)
        const target = d as unknown as Record<string, unknown>
        for (const field of changed) {
          const prop = DEFECT_PROP[field]
          target[prop] = data[field] ?? (NULLABLE_PROPS.has(prop) ? null : '')
        }
        d.updated_at = now()
        return defectDetail(d)
      }),

    changeDefectStatus: (code, defectId, change) =>
      delay(() => {
        const p = project(code)
        const d = defectIn(p.id, defectId)
        requireRole(p.id, 'defect.update')
        const parsed = defectStatusSchema.safeParse(change)
        if (!parsed.success) return validationError(parsed.error.issues)
        const { status_code: to, expected_status, comment, fixed_in_version } = parsed.data
        const from = d.status_code
        if (expected_status && expected_status !== from) {
          fail(409, 'CONFLICT', 'status_code', `Current status is ${from}`)
        }
        if (!canTransitionDefect(from, to)) {
          fail(409, 'CONFLICT', 'status_code', `Invalid transition ${from} -> ${to}`)
        }
        if (!canTransitionDefect(from, to, defectActor(p.id, d))) {
          forbidden('Your role cannot move this bug to that status.')
        }
        const at = now()
        d.status_code = to
        if ((to === 'FIXED' || to === 'READY_FOR_RETEST') && fixed_in_version) {
          d.fixed_in_version = fixed_in_version
        }
        d.history.push({ from, to, by: db.currentUserId, comment: comment ?? null, at })
        d.updated_at = at
        return defectDetail(d)
      }),

    addDefectComment: (code, defectId, body) =>
      delay(() => {
        const p = project(code)
        const d = defectIn(p.id, defectId)
        requireRole(p.id, 'defect.comment')
        const parsed = defectCommentSchema.safeParse({ body })
        if (!parsed.success) return validationError(parsed.error.issues)
        const comment = {
          id: newId(),
          authorId: db.currentUserId,
          body: parsed.data.body,
          created_at: now(),
        }
        d.comments.push(comment)
        return {
          id: comment.id,
          author: userRef(comment.authorId),
          body: comment.body,
          created_at: comment.created_at,
        }
      }),

    linkDefectExecution: (code, defectId, executionId) =>
      delay(() => {
        const p = project(code)
        const d = defectIn(p.id, defectId)
        requireRole(p.id, 'defect.link')
        if (!executionInProject(p.id, executionId)) {
          fail(422, 'VALIDATION_ERROR', 'execution_ids', 'Test attempt not found in this project')
        }
        if (!d.executionIds.includes(executionId)) d.executionIds.push(executionId)
        return defectDetail(d)
      }),

    unlinkDefectExecution: (code, defectId, executionId) =>
      delay(() => {
        const p = project(code)
        const d = defectIn(p.id, defectId)
        requireRole(p.id, 'defect.link')
        const index = d.executionIds.indexOf(executionId)
        if (index < 0) notFound()
        d.executionIds.splice(index, 1)
        return defectDetail(d)
      }),
  }
}
