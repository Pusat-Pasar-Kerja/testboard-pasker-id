import type {
  AdminUserDto,
  CurrentUser,
  DashboardSummary,
  DefectDetail,
  DefectListItem,
  DefectPriority,
  DefectSeverity,
  DefectStatus,
  HealthResponse,
  Locale,
  MemberDto,
  MemberRole,
  ModuleDto,
  Paginated,
  ProjectSummary,
  SuiteDto,
  TestCaseDetail,
  TestCaseListItem,
  TestCasePriority,
  TestCaseStatus,
  TestRunDetail,
  TestRunSummary,
  TestType,
} from '@testboard/shared'
import type { ApiClient } from './api-client'

export interface PageQuery {
  page?: number
  page_size?: number
}

export interface TestCaseQuery extends PageQuery {
  q?: string
  module?: string
  priority?: TestCasePriority
  type?: TestType
  status?: TestCaseStatus
}

export interface DefectQuery extends PageQuery {
  q?: string
  /** A single status, or 'open' for every status that still needs work. */
  status?: DefectStatus | 'open'
  severity?: DefectSeverity
  priority?: DefectPriority
}

/** Editable test case fields (mirrors the API create/update schemas). */
export interface TestCaseInput {
  case_code?: string
  module_code?: string | null
  suite_id?: string | null
  category?: string | null
  title?: string
  requirement_refs?: string | null
  priority_code?: TestCasePriority
  test_type_code?: TestType
  actor_label?: string | null
  preconditions?: string | null
  test_steps_text?: string | null
  expected_result?: string
  source_locale?: Locale
  case_status?: 'DRAFT' | 'READY'
  change_reason?: string | null
  expected_version?: number
}

export interface SuiteInput {
  name: string
  module_id?: string | null
  reference_document?: string | null
  reference_version?: string | null
}

export interface AdminUserInput {
  email: string
  display_name: string
  is_super_admin?: boolean
}

/**
 * Single seam between UI and data. Screens depend on this interface only, so the same UI
 * runs against fictitious mock data (demo / Cloudflare prototype) or the real API
 * (local / VPS). `projectCode` is the `:p` segment of the API contract.
 */
export interface DataSource {
  readonly kind: 'mock' | 'http'
  getHealth(): Promise<HealthResponse>

  // Auth & profile
  /** Resolves null when nobody is signed in. */
  getCurrentUser(): Promise<CurrentUser | null>
  login(email: string, password: string): Promise<CurrentUser>
  logout(): Promise<void>
  updateProfile(input: { display_name?: string; preferred_locale?: Locale }): Promise<CurrentUser>
  changePassword(input: { current_password: string; new_password: string }): Promise<void>

  // Projects, members, modules, suites
  listProjects(): Promise<ProjectSummary[]>
  getProject(projectCode: string): Promise<ProjectSummary>
  listMembers(projectCode: string): Promise<MemberDto[]>
  addMember(
    projectCode: string,
    input: { email: string; role_code: MemberRole },
  ): Promise<MemberDto>
  updateMember(projectCode: string, userId: string, role: MemberRole): Promise<MemberDto>
  removeMember(projectCode: string, userId: string): Promise<void>
  listModules(projectCode: string): Promise<ModuleDto[]>
  createModule(
    projectCode: string,
    input: { module_code: string; name: string; description?: string | null },
  ): Promise<ModuleDto>
  listSuites(projectCode: string): Promise<SuiteDto[]>
  createSuite(projectCode: string, input: SuiteInput): Promise<SuiteDto>

  // Test cases
  listTestCases(projectCode: string, query?: TestCaseQuery): Promise<Paginated<TestCaseListItem>>
  getTestCase(projectCode: string, caseId: string): Promise<TestCaseDetail>
  createTestCase(projectCode: string, input: TestCaseInput): Promise<TestCaseListItem>
  updateTestCase(
    projectCode: string,
    caseId: string,
    input: TestCaseInput,
  ): Promise<TestCaseListItem>
  archiveTestCase(projectCode: string, caseId: string): Promise<TestCaseListItem>
  cloneTestCase(projectCode: string, caseId: string): Promise<TestCaseListItem>

  // Runs, bugs, dashboard (read-only until Milestones 3-4)
  getDashboard(projectCode: string, filter?: { run_id?: string }): Promise<DashboardSummary>
  listRuns(projectCode: string): Promise<TestRunSummary[]>
  getRun(projectCode: string, runId: string): Promise<TestRunDetail>
  listDefects(projectCode: string, query?: DefectQuery): Promise<Paginated<DefectListItem>>
  getDefect(projectCode: string, defectId: string): Promise<DefectDetail>

  // Super Admin (ADR 0004)
  listUsers(q?: string): Promise<AdminUserDto[]>
  createUser(
    input: AdminUserInput,
  ): Promise<{ user: AdminUserDto; temporary_password: string | null }>
  updateUser(
    userId: string,
    input: { display_name?: string; is_active?: boolean; is_super_admin?: boolean },
  ): Promise<AdminUserDto>
}

function toQueryString(query: object = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const text = params.toString()
  return text ? `?${text}` : ''
}

const p = (code: string) => `/projects/${encodeURIComponent(code)}`
const seg = (value: string) => encodeURIComponent(value)

/** Real API adapter (endpoints of docs/06, implemented in apps/api). */
export function createHttpDataSource(client: ApiClient): DataSource {
  return {
    kind: 'http',
    getHealth: () => client.get('/health'),

    async getCurrentUser() {
      try {
        return await client.get<CurrentUser>('/auth/me')
      } catch (error) {
        if ((error as { status?: number }).status === 401) return null
        throw error
      }
    },
    login: async (email, password) =>
      (await client.post<{ user: CurrentUser }>('/auth/login', { email, password })).user,
    logout: () => client.post('/auth/logout'),
    updateProfile: (input) => client.patch('/profile', input),
    changePassword: (input) => client.post('/profile/change-password', input),

    listProjects: () => client.get('/projects'),
    getProject: (code) => client.get(p(code)),
    listMembers: (code) => client.get(`${p(code)}/members`),
    addMember: (code, input) => client.post(`${p(code)}/members`, input),
    updateMember: (code, userId, role) =>
      client.patch(`${p(code)}/members/${seg(userId)}`, { role_code: role }),
    removeMember: (code, userId) => client.delete(`${p(code)}/members/${seg(userId)}`),
    listModules: (code) => client.get(`${p(code)}/modules`),
    createModule: (code, input) => client.post(`${p(code)}/modules`, input),
    listSuites: (code) => client.get(`${p(code)}/suites`),
    createSuite: (code, input) => client.post(`${p(code)}/suites`, input),

    listTestCases: (code, query) => client.get(`${p(code)}/test-cases${toQueryString(query)}`),
    getTestCase: (code, id) => client.get(`${p(code)}/test-cases/${seg(id)}`),
    createTestCase: (code, input) => client.post(`${p(code)}/test-cases`, input),
    updateTestCase: (code, id, input) => client.patch(`${p(code)}/test-cases/${seg(id)}`, input),
    archiveTestCase: (code, id) => client.post(`${p(code)}/test-cases/${seg(id)}/archive`),
    cloneTestCase: (code, id) => client.post(`${p(code)}/test-cases/${seg(id)}/clone`, {}),

    getDashboard: (code, filter) =>
      client.get(`${p(code)}/reports/summary${toQueryString(filter)}`),
    listRuns: (code) => client.get(`${p(code)}/runs`),
    getRun: (code, id) => client.get(`${p(code)}/runs/${seg(id)}`),
    listDefects: (code, query) => client.get(`${p(code)}/defects${toQueryString(query)}`),
    getDefect: (code, id) => client.get(`${p(code)}/defects/${seg(id)}`),

    listUsers: (q) => client.get(`/admin/users${toQueryString({ q })}`),
    createUser: (input) => client.post('/admin/users', input),
    updateUser: (userId, input) => client.patch(`/admin/users/${seg(userId)}`, input),
  }
}
