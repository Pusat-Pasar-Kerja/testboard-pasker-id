/**
 * Canonical status / code values. These mirror the string columns in the existing
 * MySQL `testboard` schema (see database/baseline/schema_baseline_reference.sql).
 * The schema has no DB-level enum constraints, so the backend MUST validate against
 * these whitelists. Codes stay English UPPER_SNAKE; UI labels come from i18n files.
 */

export const TEST_CASE_STATUSES = ['DRAFT', 'READY', 'ARCHIVED'] as const
export type TestCaseStatus = (typeof TEST_CASE_STATUSES)[number]

export const TEST_CASE_SOURCE_KINDS = ['MANUAL', 'LEGACY_IMPORT', 'AI_IMPORT'] as const
export type TestCaseSourceKind = (typeof TEST_CASE_SOURCE_KINDS)[number]

export const TEST_CASE_PRIORITIES = ['MUST_HAVE', 'SHOULD_HAVE', 'COULD_HAVE', 'WONT_HAVE'] as const
export type TestCasePriority = (typeof TEST_CASE_PRIORITIES)[number]

export const TEST_TYPES = [
  'POSITIVE',
  'NEGATIVE',
  'RBAC',
  'SLA',
  'UI_UX',
  'INTEGRATION',
  'OTHER',
] as const
export type TestType = (typeof TEST_TYPES)[number]

export const CYCLE_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED'] as const
export type CycleStatus = (typeof CYCLE_STATUSES)[number]

export const RUN_STATUSES = ['PLANNED', 'ACTIVE', 'COMPLETED', 'LOCKED'] as const
export type RunStatus = (typeof RUN_STATUSES)[number]

export const EXECUTION_STATUSES = [
  'NOT_RUN',
  'IN_PROGRESS',
  'PASSED',
  'FAILED',
  'BLOCKED',
  'SKIPPED',
] as const
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number]

export const EXECUTION_KINDS = ['INITIAL', 'RETEST', 'RERUN'] as const
export type ExecutionKind = (typeof EXECUTION_KINDS)[number]

export const DEFECT_STATUSES = [
  'OPEN',
  'IN_PROGRESS',
  'FIXED',
  'READY_FOR_RETEST',
  'VERIFIED',
  'REOPENED',
  'CLOSED',
  'WONT_FIX',
] as const
export type DefectStatus = (typeof DEFECT_STATUSES)[number]

export const DEFECT_SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const
export type DefectSeverity = (typeof DEFECT_SEVERITIES)[number]

export const DEFECT_PRIORITIES = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'] as const
export type DefectPriority = (typeof DEFECT_PRIORITIES)[number]

export const DEFECT_SOURCE_KINDS = ['UAT', 'USER_REPORT', 'OTHER'] as const
export type DefectSourceKind = (typeof DEFECT_SOURCE_KINDS)[number]

export const MEMBER_ROLES = ['ADMIN', 'QA_LEAD', 'TESTER', 'DEVELOPER', 'VIEWER'] as const
export type MemberRole = (typeof MEMBER_ROLES)[number]

// Evidence types live in files.ts (the app accepts SCREENSHOT | DOCUMENT | LOG, ADR 0008).

export const FILE_PROCESSING_STATUSES = ['PROCESSING', 'READY', 'FAILED', 'REJECTED'] as const
export type FileProcessingStatus = (typeof FILE_PROCESSING_STATUSES)[number]

export const FILE_SCAN_STATUSES = ['PENDING', 'CLEAN', 'INFECTED', 'ERROR'] as const
export type FileScanStatus = (typeof FILE_SCAN_STATUSES)[number]

export const IMPORT_SOURCE_FORMATS = ['XLSX', 'CSV', 'JSON'] as const
export type ImportSourceFormat = (typeof IMPORT_SOURCE_FORMATS)[number]

export const IMPORT_SOURCE_KINDS = ['LEGACY', 'AI', 'MANUAL'] as const
export type ImportSourceKind = (typeof IMPORT_SOURCE_KINDS)[number]

export const IMPORT_MODES = ['CREATE_ONLY', 'UPDATE', 'NEW_REVISION'] as const
export type ImportMode = (typeof IMPORT_MODES)[number]

export const IMPORT_JOB_STATUSES = [
  'UPLOADED',
  'VALIDATING',
  'PREVIEW',
  'IMPORTING',
  'COMPLETED',
  'PARTIAL',
  'FAILED',
] as const
export type ImportJobStatus = (typeof IMPORT_JOB_STATUSES)[number]

export const IMPORT_ROW_STATUSES = [
  'PENDING',
  'VALID',
  'ERROR',
  'DUPLICATE',
  'IMPORTED',
  'SKIPPED',
] as const
export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number]

export const LOCALES = ['id', 'en'] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = 'id'

/** Type guard factory: `isOneOf(EXECUTION_STATUSES)(value)`. */
export function isOneOf<T extends string>(values: readonly T[]) {
  return (value: unknown): value is T =>
    typeof value === 'string' && (values as readonly string[]).includes(value)
}
