/**
 * API contract DTOs (JSON, snake_case, BIGINT ids as strings, timestamps ISO 8601 UTC).
 * Mirrors the baseline schema; see docs/blueprint/docs/06_API_CONTRACT.md.
 * Used by the mock data source now and by the real API from Milestone 2/3.
 */
import type { IdString } from './api.js'
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

export interface UserRef {
  id: IdString
  display_name: string
}

export interface CurrentUser extends UserRef {
  email: string
  preferred_locale: Locale
  projects: { project_code: string; role_code: MemberRole }[]
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
}

export interface TestCaseListItem {
  id: IdString
  case_code: string
  title: string
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
}

/** Counts of latest status per run case (never per attempt). */
export type StatusCounts = Record<ExecutionStatus, number>

export interface CycleDto {
  id: IdString
  cycle_code: string
  title: string
  status_code: CycleStatus
  starts_on: string | null
  ends_on: string | null
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

export interface ExecutionAttemptDto {
  id: IdString
  attempt_number: number
  execution_kind: ExecutionKind
  result_status: ExecutionStatus
  actual_result: string | null
  tester: UserRef | null
  tested_at: string | null
}

export interface DefectListItem {
  id: IdString
  bug_code: string
  title: string
  status_code: DefectStatus
  severity_code: DefectSeverity
  priority_code: DefectPriority
  module: ModuleDto | null
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
  linked_executions: DefectLinkedExecution[]
  history: DefectHistoryEntry[]
  comments: DefectCommentDto[]
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
