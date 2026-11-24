/**
 * API contract DTOs (JSON, snake_case, BIGINT ids as strings, timestamps ISO 8601 UTC).
 * Mirrors the baseline schema; see docs/blueprint/docs/06_API_CONTRACT.md.
 * Used by the mock data source now and by the real API from Milestone 2/3.
 */
import type { IdString } from './api.js'
import type { AttachedFileDto } from './files.js'
import type {
  CycleStatus,
  DefectPriority,
  DefectSeverity,
  DefectSourceKind,
  DefectStatus,
  ExecutionKind,
  ExecutionStatus,
  Locale,
  MemberRole,
  RunStatus,
  TestCasePriority,
  TestCaseSourceKind,
  TestCaseStatus,
  TestType,
} from './enums.js'
import type { SystemRole } from './permissions.js'

export interface UserRef {
  id: IdString
  display_name: string
}

export interface CurrentUser extends UserRef {
  email: string
  preferred_locale: Locale
  /** Website role (ADR 0017); null for a User. */
  system_role: SystemRole | null
  /** Shorthand for system_role === 'SUPER_ADMIN': website settings and user accounts. */
  is_super_admin: boolean
  projects: { project_code: string; role_code: MemberRole }[]
  /** TABLE = signed in with a workshop table card: only Mode Mudah (ADR 0016). */
  account_kind: 'PERSON' | 'TABLE'
}

/** One signed-in device of the current user (ADR 0015). */
export interface SessionDeviceDto {
  /** Short, non-secret handle (prefix of the stored token hash). */
  key: string
  current: boolean
  /** "Selalu login di perangkat ini" was ticked. */
  remembered: boolean
  user_agent: string
  created_at: string
  last_seen_at: string
  expires_at: string
}

export interface MemberDto {
  /** has_password = false: the account was made from a name and e-mail and is not activated yet. */
  user: UserRef & { email: string; is_active: boolean; has_password: boolean }
  role_code: MemberRole
  joined_at: string
}

export interface AdminUserDto {
  id: IdString
  display_name: string
  email: string
  preferred_locale: Locale
  is_active: boolean
  /** Website role (ADR 0017); null for a User. */
  system_role: SystemRole | null
  is_super_admin: boolean
  /** false = not activated yet (no password chosen). */
  has_password: boolean
  /** Owner account (set on the server only): cannot be revoked or deactivated. */
  is_permanent: boolean
  created_at: string
  /** Active password reset link (ADR 0012); the link itself is never shown again. */
  reset_link: { issued_at: string; expires_at: string } | null
}

/** Project as listed in the Super Admin console (archived ones included). */
export interface AdminProjectDto {
  id: IdString
  project_code: string
  name: string
  description: string | null
  is_archived: boolean
  created_at: string
  created_by: UserRef | null
  member_count: number
  counts: { test_cases: number; runs: number; open_defects: number }
}

export interface SuiteDto {
  id: IdString
  name: string
  module: ModuleDto | null
  description: string | null
  reference_document: string | null
  reference_url: string | null
  reference_version: string | null
  owner_unit: string | null
  scope_description: string | null
  preparation_date: string | null
  source_notes: string | null
  case_count: number
  created_at: string
}

export interface ProjectSummary {
  id: IdString
  project_code: string
  name: string
  description: string | null
  role_code: MemberRole
  is_archived: boolean
  counts: { test_cases: number; runs: number; open_defects: number }
}

export interface ModuleDto {
  id: IdString
  module_code: string
  name: string
  description?: string | null
}

export interface TestCaseListItem {
  id: IdString
  case_code: string
  title: string
  /** The Fase the scenario is saved in (ADR 0019); null = not in a Fase yet. */
  cycle: { id: IdString; cycle_code: string; title: string } | null
  module: ModuleDto | null
  category: string | null
  priority_code: TestCasePriority
  test_type_code: TestType
  case_status: TestCaseStatus
  current_version: number
  updated_at: string
  updated_by: UserRef | null
}

export interface TestCaseStepDto {
  step_number: number
  instruction: string
  expected_result: string | null
}

export interface TestCaseRevisionDto {
  revision_number: number
  changed_by: UserRef | null
  change_reason: string | null
  changed_at: string
}

export interface TestCaseRunUsage {
  run_id: IdString
  run_code: string
  run_name: string
  run_case_id: IdString
  case_version: number
  latest_status: ExecutionStatus
  attempts: number
}

export interface TestCaseDetail extends TestCaseListItem {
  suite_name: string | null
  requirement_refs: string | null
  actor_label: string | null
  preconditions: string | null
  test_steps_text: string | null
  expected_result: string | null
  source_locale: Locale
  source_kind: TestCaseSourceKind
  created_at: string
  created_by: UserRef | null
  steps: TestCaseStepDto[]
  revisions: TestCaseRevisionDto[]
  used_in_runs: TestCaseRunUsage[]
  /** Reference documents/screenshots for the case definition. */
  files: AttachedFileDto[]
  /** Archived because it was merged into this case (ADR 0013). */
  merged_into: { id: IdString; case_code: string } | null
  /** Cases that were merged into this one. */
  merged_from: { id: IdString; case_code: string }[]
}

/** Counts of latest status per run case (never per attempt). */
export type StatusCounts = Record<ExecutionStatus, number>

export interface CycleDto {
  id: IdString
  cycle_code: string
  title: string
  description?: string | null
  status_code: CycleStatus
  starts_on: string | null
  ends_on: string | null
  run_count?: number
  /** Shown on the public front page (Mode Workshop, ADR 0016). */
  is_public?: boolean
}

export interface TestRunSummary {
  id: IdString
  run_code: string
  name: string
  cycle: Pick<CycleDto, 'id' | 'cycle_code' | 'title'> | null
  environment_name: string | null
  build_version: string | null
  status_code: RunStatus
  starts_at: string | null
  ends_at: string | null
  total_cases: number
  counts: StatusCounts
}

export interface RunCaseRow {
  run_case_id: IdString
  test_case_id: IdString
  case_code: string
  title: string
  module_code: string | null
  case_version: number
  assigned_to: UserRef | null
  latest_status: ExecutionStatus
  attempts: number
  last_tested_at: string | null
  defect_codes: string[]
}

export interface TestRunDetail extends TestRunSummary {
  environment_url: string | null
  run_cases: RunCaseRow[]
}

export interface ExecutionStepResultDto {
  step_number: number
  result_status: ExecutionStatus
  actual_result: string | null
}

/** One attempt. Append-only: a retest is a new row, the earlier result stays visible. */
export interface ExecutionDto {
  id: IdString
  attempt_number: number
  execution_kind: ExecutionKind
  result_status: ExecutionStatus
  actual_result: string | null
  notes: string | null
  tester: UserRef | null
  legacy_tester_name: string | null
  tested_at: string | null
  browser_name: string | null
  device_name: string | null
  operating_system: string | null
  step_results: ExecutionStepResultDto[]
  files: AttachedFileDto[]
}

/** Test case definition frozen when the case joined the run (doc 02, TB-CASE-003). */
export interface CaseSnapshot {
  case_code: string
  title: string
  version: number
  module_code: string | null
  category: string | null
  priority_code: TestCasePriority
  test_type_code: TestType
  actor_label: string | null
  preconditions: string | null
  test_steps_text: string | null
  steps: TestCaseStepDto[]
  expected_result: string | null
}

/** Everything the execution workspace needs for one case in one run. */
export interface RunCaseDetail {
  run_case_id: IdString
  test_case_id: IdString
  run: Pick<
    TestRunSummary,
    'id' | 'run_code' | 'name' | 'status_code' | 'environment_name' | 'build_version'
  > & { environment_url: string | null }
  case_version: number
  current_case_version: number
  snapshot: CaseSnapshot
  assigned_to: UserRef | null
  latest_status: ExecutionStatus
  attempts: ExecutionDto[]
  linked_defects: Pick<
    DefectListItem,
    'id' | 'bug_code' | 'title' | 'status_code' | 'severity_code'
  >[]
  previous_run_case_id: IdString | null
  next_run_case_id: IdString | null
}

export interface DefectListItem {
  id: IdString
  bug_code: string
  title: string
  status_code: DefectStatus
  severity_code: DefectSeverity
  priority_code: DefectPriority
  module: ModuleDto | null
  /** Phase / test cycle the bug belongs to (ADR 0013). */
  cycle: Pick<CycleDto, 'id' | 'cycle_code' | 'title'> | null
  reported_by: UserRef | null
  assigned_to: UserRef | null
  created_at: string
  updated_at: string
}

export interface DefectLinkedExecution {
  execution_id: IdString
  run_id: IdString
  run_code: string
  run_case_id: IdString
  case_code: string
  attempt_number: number
  result_status: ExecutionStatus
  tested_at: string | null
}

export interface DefectHistoryEntry {
  from_status: DefectStatus | null
  to_status: DefectStatus
  changed_by: UserRef | null
  change_comment: string | null
  changed_at: string
}

export interface DefectCommentDto {
  id: IdString
  author: UserRef | null
  body: string
  created_at: string
}

export interface DefectDetail extends DefectListItem {
  description: string | null
  steps_to_reproduce: string | null
  expected_behavior: string | null
  actual_behavior: string | null
  source_kind: DefectSourceKind
  environment_name: string | null
  build_version: string | null
  browser_name: string | null
  fixed_in_version: string | null
  /** Imported bugs: reporter name from the sheet (text, not an account). */
  legacy_reporter_name: string | null
  /** Imported bugs: original report date. */
  reported_at: string | null
  /** Imported bugs: where the row came from. */
  source_reference: string | null
  linked_executions: DefectLinkedExecution[]
  history: DefectHistoryEntry[]
  comments: DefectCommentDto[]
  files: AttachedFileDto[]
}

export interface DashboardSummary {
  project_code: string
  run_id: IdString | null
  total_run_cases: number
  counts: StatusCounts
  open_defects: number
  critical_high_open_defects: number
  open_defects_by_severity: Record<DefectSeverity, number>
  runs: TestRunSummary[]
  recent_defects: DefectListItem[]
}
