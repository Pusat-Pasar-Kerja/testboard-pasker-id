import {
  countStatuses,
  emptySeverityCounts,
  isOpenDefect,
  latestStatus,
  PAGINATION,
  type CurrentUser,
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
import type { DataSource, DefectQuery, PageQuery, TestCaseQuery } from './data-source'

function notFound(): never {
  throw new ApiClientError(404, 'NOT_FOUND', 'Not found', 'mock-request')
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
  options: { latencyMs?: number; db?: MockDb } = {},
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
          title: testCase.title,
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

    getCurrentUser: () =>
      delay((): CurrentUser => {
        const user = db.users.find((u) => u.id === db.currentUserId) ?? notFound()
        return {
          id: user.id,
          display_name: user.display_name,
          email: user.email,
          preferred_locale: 'id',
          is_super_admin: false,
          projects: db.projects
            .filter((p) => p.members.some((m) => m.userId === user.id))
            .map((p) => ({ project_code: p.project_code, role_code: roleIn(p.id) })),
        }
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
            (d) => !q || d.bug_code.toLowerCase().includes(q) || d.title.toLowerCase().includes(q),
          )
          .map(defectListItem)
        return paginate(items, query)
      }),

    getDefect: (code, defectId) =>
      delay((): DefectDetail => {
        const p = project(code)
        const d = db.defects.find((x) => x.id === defectId && x.projectId === p.id) ?? notFound()
        return {
          ...defectListItem(d),
          description: d.description,
          steps_to_reproduce: d.steps_to_reproduce,
          expected_behavior: d.expected_behavior,
          actual_behavior: d.actual_behavior,
          source_kind: d.source_kind,
          environment_name: d.environment_name,
          build_version: d.build_version,
          browser_name: d.browser_name,
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
        }
      }),
  }
}
