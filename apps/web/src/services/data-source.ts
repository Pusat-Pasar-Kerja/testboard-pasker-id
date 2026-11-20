import type {
  ImportConfigInput,
  ImportJobDto,
  ImportRowDto,
  AttachedFileDto,
  EvidenceItem,
  EvidenceRef,
  EvidenceType,
  FileDto,
  FileFailureReason,
  FileProcessingStatus,
  AdminUserDto,
  CurrentUser,
  CycleDto,
  CycleStatus,
  ExecutionDto,
  RecordableResult,
  RunCaseDetail,
  RunStatus,
  DashboardSummary,
  DefectCommentDto,
  DefectDetail,
  DefectListItem,
  DefectPriority,
  DefectSeverity,
  DefectSourceKind,
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
  /** A user id, or 'none' for unassigned bugs. */
  assigned_to?: string
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

export interface CycleInput {
  cycle_code?: string
  title?: string
  description?: string | null
  starts_on?: string | null
  ends_on?: string | null
  status_code?: CycleStatus
}

export interface RunInput {
  run_code?: string
  name?: string
  cycle_id?: string | null
  environment_name?: string | null
  build_version?: string | null
  environment_url?: string | null
}

export interface ExecutionInput {
  result_status: RecordableResult
  actual_result?: string | null
  notes?: string | null
  execution_kind?: 'RETEST' | 'RERUN'
  browser_name?: string | null
  device_name?: string | null
  operating_system?: string | null
  step_results?: { step_number: number; result_status: string; actual_result?: string | null }[]
  /** Uploaded READY files to attach to this attempt. */
  evidence?: EvidenceRef[]
}

export interface AddRunCasesResult {
  added: number
  skipped: { test_case_id: string; reason: 'NOT_FOUND' | 'NOT_READY' | 'ALREADY_IN_RUN' }[]
}

/** Bug fields for create/edit (mirrors the API schemas; edit sends only changed fields). */
export interface DefectInput {
  bug_code?: string
  title?: string
  description?: string | null
  steps_to_reproduce?: string | null
  expected_behavior?: string | null
  actual_behavior?: string | null
  module_id?: string | null
  severity_code?: DefectSeverity
  priority_code?: DefectPriority
  source_kind?: DefectSourceKind
  environment_name?: string | null
  build_version?: string | null
  browser_name?: string | null
  assigned_to?: string | null
  fixed_in_version?: string | null
  /** Create only: test attempts the bug was found in. */
  execution_ids?: string[]
  /** Edit only: the `updated_at` the form was loaded with. */
  expected_updated_at?: string
  /** Create only: uploaded READY files (or files of the attempt) to attach. */
  evidence?: EvidenceRef[]
}

export interface DefectStatusChange {
  status_code: DefectStatus
  expected_status?: DefectStatus
  comment?: string | null
  fixed_in_version?: string | null
}

export interface FileQuery extends PageQuery {
  q?: string
  type?: EvidenceType
  status?: FileProcessingStatus
  /** Only uploads not attached anywhere. */
  unlinked?: boolean
}

export interface UploadResult {
  files: FileDto[]
  rejected: { original_filename: string; failure_reason: FileFailureReason }[]
}

export interface UploadOptions {
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

export type FileUrlKind = 'preview' | 'thumbnail' | 'download'

export interface ImportRowQuery extends PageQuery {
  /** ok = valid without warnings, review = valid with warnings. */
  status?: 'ok' | 'review' | 'DUPLICATE' | 'ERROR' | 'IMPORTED' | 'SKIPPED'
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

  // Cycles, runs and executions (Milestone 3)
  getDashboard(projectCode: string, filter?: { run_id?: string }): Promise<DashboardSummary>
  listCycles(projectCode: string): Promise<CycleDto[]>
  createCycle(projectCode: string, input: CycleInput): Promise<CycleDto>
  updateCycle(projectCode: string, cycleId: string, input: CycleInput): Promise<CycleDto>
  listRuns(projectCode: string): Promise<TestRunSummary[]>
  getRun(projectCode: string, runId: string): Promise<TestRunDetail>
  createRun(projectCode: string, input: RunInput): Promise<TestRunSummary>
  updateRun(projectCode: string, runId: string, input: RunInput): Promise<TestRunSummary>
  changeRunStatus(projectCode: string, runId: string, status: RunStatus): Promise<TestRunSummary>
  addRunCases(
    projectCode: string,
    runId: string,
    input: { test_case_ids: string[]; assigned_to?: string | null },
  ): Promise<AddRunCasesResult>
  removeRunCase(projectCode: string, runId: string, runCaseId: string): Promise<void>
  assignRunCases(
    projectCode: string,
    runId: string,
    input: { run_case_ids: string[]; assigned_to: string | null },
  ): Promise<{ updated: number }>
  getRunCase(projectCode: string, runCaseId: string): Promise<RunCaseDetail>
  /** `idempotencyKey` makes a double submit create only one attempt. */
  createExecution(
    projectCode: string,
    runCaseId: string,
    input: ExecutionInput,
    idempotencyKey: string,
  ): Promise<ExecutionDto>

  // Bugs (read-only until Milestone 4)
  listDefects(projectCode: string, query?: DefectQuery): Promise<Paginated<DefectListItem>>
  getDefect(projectCode: string, defectId: string): Promise<DefectDetail>
  createDefect(
    projectCode: string,
    input: DefectInput,
    idempotencyKey: string,
  ): Promise<DefectDetail>
  updateDefect(projectCode: string, defectId: string, input: DefectInput): Promise<DefectDetail>
  changeDefectStatus(
    projectCode: string,
    defectId: string,
    change: DefectStatusChange,
  ): Promise<DefectDetail>
  addDefectComment(projectCode: string, defectId: string, body: string): Promise<DefectCommentDto>
  linkDefectExecution(
    projectCode: string,
    defectId: string,
    executionId: string,
  ): Promise<DefectDetail>
  unlinkDefectExecution(
    projectCode: string,
    defectId: string,
    executionId: string,
  ): Promise<DefectDetail>

  // Evidence (Milestone 5, ADR 0008)
  uploadFile(projectCode: string, file: File, options?: UploadOptions): Promise<UploadResult>
  getFileStatus(projectCode: string, fileId: string): Promise<FileDto>
  listFiles(projectCode: string, query?: FileQuery): Promise<Paginated<EvidenceItem>>
  deleteFile(projectCode: string, fileId: string): Promise<void>
  /** Authorized stream URL (same-origin session cookie); never a public link. */
  fileUrl(projectCode: string, fileId: string, kind: FileUrlKind): string
  attachExecutionFiles(
    projectCode: string,
    executionId: string,
    files: EvidenceRef[],
  ): Promise<AttachedFileDto[]>
  detachExecutionFile(projectCode: string, executionId: string, fileId: string): Promise<void>
  attachDefectFiles(
    projectCode: string,
    defectId: string,
    files: EvidenceRef[],
  ): Promise<DefectDetail>
  detachDefectFile(projectCode: string, defectId: string, fileId: string): Promise<DefectDetail>
  attachCaseFiles(
    projectCode: string,
    caseId: string,
    files: EvidenceRef[],
  ): Promise<AttachedFileDto[]>
  detachCaseFile(projectCode: string, caseId: string, fileId: string): Promise<void>

  // Import (Milestone 6, ADR 0009)
  uploadImport(projectCode: string, file: File, options?: UploadOptions): Promise<ImportJobDto>
  listImports(projectCode: string, query?: PageQuery): Promise<Paginated<ImportJobDto>>
  getImport(projectCode: string, jobId: string): Promise<ImportJobDto>
  configureImport(
    projectCode: string,
    jobId: string,
    config: ImportConfigInput,
  ): Promise<ImportJobDto>
  listImportRows(
    projectCode: string,
    jobId: string,
    query?: ImportRowQuery,
  ): Promise<Paginated<ImportRowDto>>
  commitImport(projectCode: string, jobId: string): Promise<ImportJobDto>
  deleteImport(projectCode: string, jobId: string): Promise<void>
  /** Authorized URLs: the formula-safe error CSV, or an embedded workbook image. */
  importUrl(projectCode: string, jobId: string, what: 'errors' | { image: string }): string

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
    listCycles: (code) => client.get(`${p(code)}/cycles`),
    createCycle: (code, input) => client.post(`${p(code)}/cycles`, input),
    updateCycle: (code, id, input) => client.patch(`${p(code)}/cycles/${seg(id)}`, input),
    listRuns: (code) => client.get(`${p(code)}/runs`),
    getRun: (code, id) => client.get(`${p(code)}/runs/${seg(id)}`),
    createRun: (code, input) => client.post(`${p(code)}/runs`, input),
    updateRun: (code, id, input) => client.patch(`${p(code)}/runs/${seg(id)}`, input),
    changeRunStatus: (code, id, status) =>
      client.post(`${p(code)}/runs/${seg(id)}/status`, { status_code: status }),
    addRunCases: (code, id, input) => client.post(`${p(code)}/runs/${seg(id)}/cases`, input),
    removeRunCase: (code, id, runCaseId) =>
      client.delete(`${p(code)}/runs/${seg(id)}/cases/${seg(runCaseId)}`),
    assignRunCases: (code, id, input) =>
      client.patch(`${p(code)}/runs/${seg(id)}/cases/assign`, input),
    getRunCase: (code, runCaseId) => client.get(`${p(code)}/run-cases/${seg(runCaseId)}`),
    createExecution: (code, runCaseId, input, idempotencyKey) =>
      client.post(`${p(code)}/run-cases/${seg(runCaseId)}/executions`, input, {
        'Idempotency-Key': idempotencyKey,
      }),
    listDefects: (code, query) => client.get(`${p(code)}/defects${toQueryString(query)}`),
    getDefect: (code, id) => client.get(`${p(code)}/defects/${seg(id)}`),
    createDefect: (code, input, idempotencyKey) =>
      client.post(`${p(code)}/defects`, input, { 'Idempotency-Key': idempotencyKey }),
    updateDefect: (code, id, input) => client.patch(`${p(code)}/defects/${seg(id)}`, input),
    changeDefectStatus: (code, id, change) =>
      client.post(`${p(code)}/defects/${seg(id)}/status`, change),
    addDefectComment: (code, id, body) =>
      client.post(`${p(code)}/defects/${seg(id)}/comments`, { body }),
    linkDefectExecution: (code, id, executionId) =>
      client.post(`${p(code)}/defects/${seg(id)}/executions`, { execution_id: executionId }),
    unlinkDefectExecution: (code, id, executionId) =>
      client.delete(`${p(code)}/defects/${seg(id)}/executions/${seg(executionId)}`),

    uploadFile: (code, file, options) => {
      const form = new FormData()
      form.append('files', file, file.name)
      return client.upload(`${p(code)}/files`, form, options)
    },
    getFileStatus: (code, id) => client.get(`${p(code)}/files/${seg(id)}/status`),
    listFiles: (code, query) =>
      client.get(
        `${p(code)}/files${toQueryString({ ...query, unlinked: query?.unlinked ? '1' : undefined })}`,
      ),
    deleteFile: (code, id) => client.delete(`${p(code)}/files/${seg(id)}`),
    fileUrl: (code, id, kind) => client.url(`${p(code)}/files/${seg(id)}/${kind}`),
    attachExecutionFiles: (code, id, files) =>
      client.post(`${p(code)}/executions/${seg(id)}/files`, { files }),
    detachExecutionFile: (code, id, fileId) =>
      client.delete(`${p(code)}/executions/${seg(id)}/files/${seg(fileId)}`),
    attachDefectFiles: (code, id, files) =>
      client.post(`${p(code)}/defects/${seg(id)}/files`, { files }),
    detachDefectFile: (code, id, fileId) =>
      client.delete(`${p(code)}/defects/${seg(id)}/files/${seg(fileId)}`),
    attachCaseFiles: (code, id, files) =>
      client.post(`${p(code)}/test-cases/${seg(id)}/files`, { files }),
    detachCaseFile: (code, id, fileId) =>
      client.delete(`${p(code)}/test-cases/${seg(id)}/files/${seg(fileId)}`),

    uploadImport: (code, file, options) => {
      const form = new FormData()
      form.append('file', file, file.name)
      return client.upload(`${p(code)}/imports`, form, options)
    },
    listImports: (code, query) => client.get(`${p(code)}/imports${toQueryString(query)}`),
    getImport: (code, id) => client.get(`${p(code)}/imports/${seg(id)}`),
    configureImport: (code, id, config) =>
      client.put(`${p(code)}/imports/${seg(id)}/config`, config),
    listImportRows: (code, id, query) =>
      client.get(`${p(code)}/imports/${seg(id)}/rows${toQueryString(query)}`),
    commitImport: (code, id) => client.post(`${p(code)}/imports/${seg(id)}/commit`),
    deleteImport: (code, id) => client.delete(`${p(code)}/imports/${seg(id)}`),
    importUrl: (code, id, what) =>
      client.url(
        what === 'errors'
          ? `${p(code)}/imports/${seg(id)}/errors.csv`
          : `${p(code)}/imports/${seg(id)}/images/${seg(what.image)}`,
      ),

    listUsers: (q) => client.get(`/admin/users${toQueryString({ q })}`),
    createUser: (input) => client.post('/admin/users', input),
    updateUser: (userId, input) => client.patch(`/admin/users/${seg(userId)}`, input),
  }
}
