import type {
  CyclePublicInput,
  DefectReviewInput,
  ModuleRef,
  PublicBugDto,
  PublicCycleDetail,
  PublicCycleSummary,
  PublicField,
  WorkshopBoardDto,
  WorkshopBugDto,
  WorkshopBugInput,
  WorkshopCaseDto,
  WorkshopConfirmInput,
  WorkshopFeatureDto,
  WorkshopFeatureState,
  WorkshopInboxItem,
  WorkshopResultInput,
  WorkshopResultSaved,
  WorkshopSessionDto,
  WorkshopTableDto,
  WorkshopTableInput,
  WorkshopTableUpdate,
  SessionDeviceDto,
  BulkResult,
  CaseBulkInput,
  DefectImportConfigInput,
  ImportTarget,
  SimilarCasePair,
  TestCaseMergeInput,
  TestCaseMergeResult,
  DefectBulkInput,
  IssuedResetLink,
  RecoveryRequestDto,
  RecoveryRequestInput,
  RecoveryRequestUpdate,
  RecoveryStatus,
  RecoverySummary,
  ResetLinkCheck,
  ResetLinkDto,
  ResetLinkIssueInput,
  AdminProjectDto,
  AdminProjectUpdateInput,
  ProjectCreateInput,
  PublicSiteSettings,
  SiteSettingsDto,
  SiteSettingsUpdate,
  AuditFilter,
  AuditLogEntry,
  ReportExportQuery,
  ReportFilter,
  ReportOverview,
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
  ActivationLinkDto,
  MemberDto,
  MemberTask,
  MyTasksDto,
  ModuleDto,
  Paginated,
  ProjectSummary,
  SuiteDto,
  SystemRole,
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
  /** A cycle (phase) id, or 'none' for bugs outside any cycle. */
  cycle?: string
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
  cycle_id?: string | null
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
  /** Imports only: create bugs instead of test cases ("Impor Bug", ADR 0013). */
  target?: ImportTarget
}

export type FileUrlKind = 'preview' | 'thumbnail' | 'download'

export interface ImportRowQuery extends PageQuery {
  /** ok = valid without warnings, review = valid with warnings. */
  status?: 'ok' | 'review' | 'DUPLICATE' | 'ERROR' | 'IMPORTED' | 'SKIPPED'
}

/** Website role choice in the Super Admin forms (ADR 0017): NONE = a User. */
export type SystemRoleChoice = SystemRole | 'NONE'

export interface AdminUserInput {
  email: string
  display_name: string
  system_role?: SystemRoleChoice
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
  /** `remember` = "Selalu login di perangkat ini" (ADR 0015). */
  login(email: string, password: string, remember?: boolean): Promise<CurrentUser>
  /** Devices where the current user is signed in. */
  listMySessions(): Promise<SessionDeviceDto[]>
  /** Sign out every other device; this one stays signed in. */
  revokeOtherSessions(): Promise<void>
  logout(): Promise<void>
  updateProfile(input: { display_name?: string; preferred_locale?: Locale }): Promise<CurrentUser>
  changePassword(input: { current_password: string; new_password: string }): Promise<void>

  // Projects, members, modules, suites
  listProjects(): Promise<ProjectSummary[]>
  getProject(projectCode: string): Promise<ProjectSummary>
  listMembers(projectCode: string): Promise<MemberDto[]>
  addMember(
    projectCode: string,
    /** display_name creates the account when nobody has this e-mail yet (Admin, ADR 0017). */
    input: { email: string; display_name?: string; role_code: MemberTask },
  ): Promise<MemberDto>
  updateMember(projectCode: string, userId: string, role: MemberTask): Promise<MemberDto>
  removeMember(projectCode: string, userId: string): Promise<void>
  /** One-time link for a member who has no password yet (Admin, ADR 0018). */
  createActivationLink(projectCode: string, userId: string): Promise<ActivationLinkDto>
  listModules(projectCode: string): Promise<ModuleDto[]>
  createModule(
    projectCode: string,
    input: { module_code: string; name: string; description?: string | null },
  ): Promise<ModuleDto>
  /** Code and/or name; existing test case codes keep their old prefix. */
  updateModule(
    projectCode: string,
    moduleId: string,
    input: { module_code?: string; name?: string; description?: string | null },
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
  /** Status / module / priority / archive for many cases (ADR 0013). */
  bulkTestCases(projectCode: string, input: CaseBulkInput): Promise<BulkResult>
  /** Likely duplicates, most similar first (ADR 0013). */
  listSimilarCases(projectCode: string, moduleCode?: string): Promise<SimilarCasePair[]>
  /** Keep one case; the others are archived and point to it. */
  mergeTestCases(projectCode: string, input: TestCaseMergeInput): Promise<TestCaseMergeResult>
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
  /** Edit or move many bugs; refused ones are reported, not applied (ADR 0013). */
  bulkDefects(projectCode: string, input: DefectBulkInput): Promise<BulkResult>
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
  /** Bug imports: sheets, mapping and value maps -> preview. */
  configureDefectImport(
    projectCode: string,
    jobId: string,
    config: DefectImportConfigInput,
  ): Promise<ImportJobDto>
  deleteImport(projectCode: string, jobId: string): Promise<void>
  /** Authorized URLs: the formula-safe error CSV, or an embedded workbook image. */
  importUrl(projectCode: string, jobId: string, what: 'errors' | { image: string }): string

  // Milestone 7: reports and activity log
  getReportOverview(projectCode: string, filter: ReportFilter): Promise<ReportOverview>
  /** The finished CSV/XLSX file (fetched, so errors such as "too many rows" can be shown). */
  exportReport(
    projectCode: string,
    query: ReportExportQuery,
  ): Promise<{ blob: Blob; filename: string }>
  listAuditLogs(projectCode: string, query?: AuditQuery): Promise<Paginated<AuditLogEntry>>

  // Super Admin (ADR 0004)
  listUsers(q?: string): Promise<AdminUserDto[]>
  createUser(
    input: AdminUserInput,
  ): Promise<{ user: AdminUserDto; temporary_password: string | null }>
  updateUser(
    userId: string,
    input: { display_name?: string; is_active?: boolean; system_role?: SystemRoleChoice },
  ): Promise<AdminUserDto>

  // Admin console (ADR 0011): projects, website settings, site-wide activity
  createProject(input: ProjectCreateInput): Promise<ProjectSummary>
  listAdminProjects(): Promise<AdminProjectDto[]>
  updateAdminProject(projectId: string, input: AdminProjectUpdateInput): Promise<AdminProjectDto>
  getSiteSettings(): Promise<SiteSettingsDto>
  updateSiteSettings(input: SiteSettingsUpdate): Promise<SiteSettingsDto>
  /** Anyone, also signed out: site name, banner, default language, support contact. */
  getPublicSettings(): Promise<PublicSiteSettings>
  listSiteAuditLogs(query?: AuditQuery): Promise<Paginated<AuditLogEntry>>

  // Account recovery (ADR 0012). The first three work signed out.
  /** "Hubungi Administrator": always accepted the same way (no account discovery). */
  submitRecoveryRequest(input: RecoveryRequestInput): Promise<void>
  checkResetLink(token: string): Promise<ResetLinkCheck>
  resetPassword(input: { token: string; new_password: string }): Promise<void>
  getRecoverySummary(): Promise<RecoverySummary>
  listRecoveryRequests(status?: RecoveryStatus | 'ALL'): Promise<RecoveryRequestDto[]>
  updateRecoveryRequest(
    requestId: string,
    input: RecoveryRequestUpdate,
  ): Promise<RecoveryRequestDto>
  listResetLinks(): Promise<ResetLinkDto[]>
  /** The returned token is shown once; only its hash is stored. */
  issueResetLink(userId: string, input?: ResetLinkIssueInput): Promise<IssuedResetLink>
  revokeResetLink(userId: string): Promise<void>

  // Mode Workshop (ADR 0016) ------------------------------------------------------------
  /** Public pages: anyone, signed out; only the fields a lead switched on. */
  listPublicCycles(): Promise<PublicCycleSummary[]>
  /** `preview`: a lead sees the page before it is published (optionally unsaved fields). */
  getPublicCycle(cycleId: string, preview?: PublicPreview): Promise<PublicCycleDetail>
  listPublicBugs(
    cycleId: string,
    query?: PublicBugQuery,
    preview?: PublicPreview,
  ): Promise<Paginated<PublicBugDto>>
  publicFileUrl(
    cycleId: string,
    fileId: string,
    kind: 'thumbnail' | 'preview',
    preview?: PublicPreview,
  ): string

  /** Table card (meja): sign in with the 6-digit code, then Mode Mudah only. */
  joinWorkshop(code: string): Promise<WorkshopSessionDto>
  getWorkshopSession(): Promise<WorkshopSessionDto>
  updateWorkshopMembers(memberNames: string[]): Promise<WorkshopSessionDto>
  /** "Aktifkan akun saya" at the table (ADR 0018). */
  activateTableMember(memberId: string, password: string): Promise<WorkshopSessionDto>
  /** A signed-in User opens the table they are listed at, from "Tugas saya". */
  joinWorkshopAsMember(
    tableId: string,
  ): Promise<{ session: WorkshopSessionDto; member_name: string }>
  /** "Tugas saya": the signed-in person's own tables, assigned scenarios and reports. */
  getMyTasks(): Promise<MyTasksDto>
  listWorkshopCases(moduleId: string): Promise<WorkshopCaseDto[]>
  saveWorkshopResult(runCaseId: string, input: WorkshopResultInput): Promise<WorkshopResultSaved>
  listWorkshopBugs(query?: WorkshopBugQuery): Promise<WorkshopBugDto[]>
  reportWorkshopBug(input: WorkshopBugInput): Promise<{ id: string; bug_code: string }>
  confirmWorkshopBug(defectId: string, input: WorkshopConfirmInput): Promise<WorkshopBugDto>
  uploadWorkshopFile(file: File, options?: UploadOptions): Promise<UploadResult>
  getWorkshopFileStatus(fileId: string): Promise<Pick<FileDto, 'processing_status' | 'scan_status'>>
  workshopFileUrl(fileId: string, kind: 'thumbnail' | 'preview'): string

  /** Facilitator side, inside a project. */
  getWorkshopBoard(projectCode: string, cycleId: string): Promise<WorkshopBoardDto>
  updateCyclePublic(
    projectCode: string,
    cycleId: string,
    input: CyclePublicInput,
  ): Promise<{ is_public: boolean; public_fields: PublicField[]; public_intro: string | null }>
  updateWorkshopFeature(
    projectCode: string,
    cycleId: string,
    input: { module_id: string; state_code: WorkshopFeatureState },
  ): Promise<WorkshopFeatureDto[]>
  listWorkshopTables(projectCode: string, cycleId: string): Promise<WorkshopTableDto[]>
  createWorkshopTable(
    projectCode: string,
    cycleId: string,
    input: WorkshopTableInput,
  ): Promise<WorkshopTableDto>
  updateWorkshopTable(
    projectCode: string,
    cycleId: string,
    tableId: string,
    input: WorkshopTableUpdate,
  ): Promise<WorkshopTableDto>
  deleteWorkshopTable(projectCode: string, cycleId: string, tableId: string): Promise<void>
  getWorkshopSheet(projectCode: string, cycleId: string, tableId: string): Promise<WorkshopSheet>
  listWorkshopInbox(projectCode: string, cycleId: string): Promise<WorkshopInboxItem[]>
  reviewWorkshopBug(
    projectCode: string,
    cycleId: string,
    defectId: string,
    input: DefectReviewInput,
  ): Promise<WorkshopBugDto>
}

export interface PublicPreview {
  fields?: PublicField[]
}

const previewQuery = (preview?: PublicPreview) =>
  preview ? { preview: '1', fields: preview.fields?.join(',') } : {}

export interface PublicBugQuery extends PageQuery {
  q?: string
  feature?: string
  status?: 'OPEN' | 'DONE' | ''
}

export interface WorkshopBugQuery {
  module?: string
  q?: string
  run_case?: string
}

export interface WorkshopSheet {
  table: WorkshopTableDto
  features: { module: ModuleRef; cases: WorkshopCaseDto[] }[]
}

export type AuditQuery = AuditFilter & PageQuery

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
    login: async (email, password, remember = false) =>
      (await client.post<{ user: CurrentUser }>('/auth/login', { email, password, remember })).user,
    listMySessions: () => client.get('/profile/sessions'),
    revokeOtherSessions: () => client.post('/profile/sessions/revoke-others'),
    logout: () => client.post('/auth/logout'),
    updateProfile: (input) => client.patch('/profile', input),
    changePassword: (input) => client.post('/profile/change-password', input),

    listProjects: () => client.get('/projects'),
    getProject: (code) => client.get(p(code)),
    listMembers: (code) => client.get(`${p(code)}/members`),
    addMember: (code, input) => client.post(`${p(code)}/members`, input),
    createActivationLink: (code, userId) =>
      client.post(`${p(code)}/members/${seg(userId)}/activation-link`, {}),
    updateMember: (code, userId, role) =>
      client.patch(`${p(code)}/members/${seg(userId)}`, { role_code: role }),
    removeMember: (code, userId) => client.delete(`${p(code)}/members/${seg(userId)}`),
    listModules: (code) => client.get(`${p(code)}/modules`),
    createModule: (code, input) => client.post(`${p(code)}/modules`, input),
    updateModule: (code, id, input) => client.patch(`${p(code)}/modules/${seg(id)}`, input),
    listSuites: (code) => client.get(`${p(code)}/suites`),
    createSuite: (code, input) => client.post(`${p(code)}/suites`, input),

    listTestCases: (code, query) => client.get(`${p(code)}/test-cases${toQueryString(query)}`),
    getTestCase: (code, id) => client.get(`${p(code)}/test-cases/${seg(id)}`),
    createTestCase: (code, input) => client.post(`${p(code)}/test-cases`, input),
    updateTestCase: (code, id, input) => client.patch(`${p(code)}/test-cases/${seg(id)}`, input),
    archiveTestCase: (code, id) => client.post(`${p(code)}/test-cases/${seg(id)}/archive`),
    bulkTestCases: (code, input) => client.post(`${p(code)}/test-cases/bulk`, input),
    listSimilarCases: (code, moduleCode) =>
      client.get(`${p(code)}/test-cases/similar${toQueryString({ module: moduleCode })}`),
    mergeTestCases: (code, input) => client.post(`${p(code)}/test-cases/merge`, input),
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
    bulkDefects: (code, input) => client.post(`${p(code)}/defects/bulk`, input),
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
      const target = options?.target === 'DEFECTS' ? '?target=DEFECTS' : ''
      return client.upload(`${p(code)}/imports${target}`, form, options)
    },
    listImports: (code, query) => client.get(`${p(code)}/imports${toQueryString(query)}`),
    getImport: (code, id) => client.get(`${p(code)}/imports/${seg(id)}`),
    configureImport: (code, id, config) =>
      client.put(`${p(code)}/imports/${seg(id)}/config`, config),
    listImportRows: (code, id, query) =>
      client.get(`${p(code)}/imports/${seg(id)}/rows${toQueryString(query)}`),
    commitImport: (code, id) => client.post(`${p(code)}/imports/${seg(id)}/commit`),
    configureDefectImport: (code, id, config) =>
      client.put(`${p(code)}/imports/${seg(id)}/config`, config),
    deleteImport: (code, id) => client.delete(`${p(code)}/imports/${seg(id)}`),
    importUrl: (code, id, what) =>
      client.url(
        what === 'errors'
          ? `${p(code)}/imports/${seg(id)}/errors.csv`
          : `${p(code)}/imports/${seg(id)}/images/${seg(what.image)}`,
      ),

    getReportOverview: (code, filter) =>
      client.get(`${p(code)}/reports/overview${toQueryString(filter)}`),
    exportReport: async (code, query) => {
      const file = await client.download(`${p(code)}/reports/export${toQueryString(query)}`)
      return {
        blob: file.blob,
        filename: file.filename ?? `testboard-${code}-${query.dataset}.${query.format}`,
      }
    },
    listAuditLogs: (code, query = {}) => client.get(`${p(code)}/audit-logs${toQueryString(query)}`),

    listUsers: (q) => client.get(`/admin/users${toQueryString({ q })}`),
    createUser: (input) => client.post('/admin/users', input),
    updateUser: (userId, input) => client.patch(`/admin/users/${seg(userId)}`, input),

    createProject: (input) => client.post('/projects', input),
    listAdminProjects: () => client.get('/admin/projects'),
    updateAdminProject: (projectId, input) =>
      client.patch(`/admin/projects/${seg(projectId)}`, input),
    getSiteSettings: () => client.get('/admin/settings'),
    updateSiteSettings: (input) => client.put('/admin/settings', input),
    getPublicSettings: () => client.get('/settings/public'),
    listSiteAuditLogs: (query = {}) => client.get(`/admin/audit-logs${toQueryString(query)}`),

    submitRecoveryRequest: async (input) => {
      await client.post('/auth/recovery-requests', input)
    },
    checkResetLink: (token) => client.post('/auth/reset-password/check', { token }),
    resetPassword: (input) => client.post('/auth/reset-password', input),
    getRecoverySummary: () => client.get('/admin/recovery-summary'),
    listRecoveryRequests: (status = 'OPEN') =>
      client.get(`/admin/recovery-requests${toQueryString({ status })}`),
    updateRecoveryRequest: (requestId, input) =>
      client.patch(`/admin/recovery-requests/${seg(requestId)}`, input),
    listResetLinks: () => client.get('/admin/reset-links'),
    issueResetLink: (userId, input = {}) =>
      client.post(`/admin/users/${seg(userId)}/reset-link`, input),
    revokeResetLink: (userId) => client.delete(`/admin/users/${seg(userId)}/reset-link`),

    listPublicCycles: () => client.get('/public/cycles'),
    getPublicCycle: (id, preview) =>
      client.get(`/public/cycles/${seg(id)}${toQueryString(previewQuery(preview))}`),
    listPublicBugs: (id, query = {}, preview) =>
      client.get(
        `/public/cycles/${seg(id)}/bugs${toQueryString({ ...query, ...previewQuery(preview) })}`,
      ),
    publicFileUrl: (cycleId, fileId, kind, preview) =>
      client.url(
        `/public/cycles/${seg(cycleId)}/files/${seg(fileId)}/${kind}${toQueryString(previewQuery(preview))}`,
      ),

    joinWorkshop: (code) => client.post('/workshop/join', { code }),
    getWorkshopSession: () => client.get('/workshop/session'),
    updateWorkshopMembers: (names) => client.put('/workshop/members', { member_names: names }),
    activateTableMember: (memberId, password) =>
      client.post(`/workshop/members/${seg(memberId)}/activate`, { password }),
    joinWorkshopAsMember: (tableId) => client.post('/workshop/join-member', { table_id: tableId }),
    getMyTasks: () => client.get('/me/tasks'),
    listWorkshopCases: (moduleId) => client.get(`/workshop/features/${seg(moduleId)}/cases`),
    saveWorkshopResult: (runCaseId, input) =>
      client.post(`/workshop/cases/${seg(runCaseId)}/result`, input),
    listWorkshopBugs: (query = {}) => client.get(`/workshop/bugs${toQueryString(query)}`),
    reportWorkshopBug: (input) => client.post('/workshop/bugs', input),
    confirmWorkshopBug: (id, input) => client.post(`/workshop/bugs/${seg(id)}/confirm`, input),
    uploadWorkshopFile: (file, options) => {
      const form = new FormData()
      form.append('files', file, file.name)
      return client.upload('/workshop/files', form, options)
    },
    getWorkshopFileStatus: (id) => client.get(`/workshop/files/${seg(id)}/status`),
    workshopFileUrl: (id, kind) => client.url(`/workshop/files/${seg(id)}/${kind}`),

    getWorkshopBoard: (code, cycleId) => client.get(`${p(code)}/cycles/${seg(cycleId)}/workshop`),
    updateCyclePublic: (code, cycleId, input) =>
      client.put(`${p(code)}/cycles/${seg(cycleId)}/public`, input),
    updateWorkshopFeature: (code, cycleId, input) =>
      client.put(`${p(code)}/cycles/${seg(cycleId)}/features`, input),
    listWorkshopTables: (code, cycleId) => client.get(`${p(code)}/cycles/${seg(cycleId)}/tables`),
    createWorkshopTable: (code, cycleId, input) =>
      client.post(`${p(code)}/cycles/${seg(cycleId)}/tables`, input),
    updateWorkshopTable: (code, cycleId, tableId, input) =>
      client.patch(`${p(code)}/cycles/${seg(cycleId)}/tables/${seg(tableId)}`, input),
    deleteWorkshopTable: (code, cycleId, tableId) =>
      client.delete(`${p(code)}/cycles/${seg(cycleId)}/tables/${seg(tableId)}`),
    getWorkshopSheet: (code, cycleId, tableId) =>
      client.get(`${p(code)}/cycles/${seg(cycleId)}/tables/${seg(tableId)}/sheet`),
    listWorkshopInbox: (code, cycleId) => client.get(`${p(code)}/cycles/${seg(cycleId)}/inbox`),
    reviewWorkshopBug: (code, cycleId, defectId, input) =>
      client.post(`${p(code)}/cycles/${seg(cycleId)}/inbox/${seg(defectId)}`, input),
  }
}
