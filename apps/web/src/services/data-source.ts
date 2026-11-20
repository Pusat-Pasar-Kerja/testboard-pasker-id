import type {
  CurrentUser,
  DashboardSummary,
  DefectDetail,
  DefectListItem,
  DefectPriority,
  DefectSeverity,
  DefectStatus,
  HealthResponse,
  ModuleDto,
  Paginated,
  ProjectSummary,
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

/**
 * Single seam between UI and data. Screens depend on this interface only, so the same UI
 * runs against fictitious mock data (demo / Cloudflare prototype) or the real API
 * (local / VPS, from Milestone 2-3). `projectCode` is the `:p` segment of the API contract.
 */
export interface DataSource {
  readonly kind: 'mock' | 'http'
  getHealth(): Promise<HealthResponse>
  getCurrentUser(): Promise<CurrentUser>
  listProjects(): Promise<ProjectSummary[]>
  getProject(projectCode: string): Promise<ProjectSummary>
  listModules(projectCode: string): Promise<ModuleDto[]>
  getDashboard(projectCode: string, filter?: { run_id?: string }): Promise<DashboardSummary>
  listTestCases(projectCode: string, query?: TestCaseQuery): Promise<Paginated<TestCaseListItem>>
  getTestCase(projectCode: string, caseId: string): Promise<TestCaseDetail>
  listRuns(projectCode: string): Promise<TestRunSummary[]>
  getRun(projectCode: string, runId: string): Promise<TestRunDetail>
  listDefects(projectCode: string, query?: DefectQuery): Promise<Paginated<DefectListItem>>
  getDefect(projectCode: string, defectId: string): Promise<DefectDetail>
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

/** Real API adapter. Endpoints follow docs/06; they are implemented from Milestone 2/3. */
export function createHttpDataSource(client: ApiClient): DataSource {
  return {
    kind: 'http',
    getHealth: () => client.get('/health'),
    getCurrentUser: () => client.get('/auth/me'),
    listProjects: () => client.get('/projects'),
    getProject: (code) => client.get(p(code)),
    listModules: (code) => client.get(`${p(code)}/modules`),
    getDashboard: (code, filter) =>
      client.get(`${p(code)}/reports/summary${toQueryString(filter)}`),
    listTestCases: (code, query) => client.get(`${p(code)}/test-cases${toQueryString(query)}`),
    getTestCase: (code, id) => client.get(`${p(code)}/test-cases/${seg(id)}`),
    listRuns: (code) => client.get(`${p(code)}/runs`),
    getRun: (code, id) => client.get(`${p(code)}/runs/${seg(id)}`),
    listDefects: (code, query) => client.get(`${p(code)}/defects${toQueryString(query)}`),
    getDefect: (code, id) => client.get(`${p(code)}/defects/${seg(id)}`),
  }
}
