import { z } from 'zod'
import type { IdString } from './api.js'
import { codeLabel, type CodeGroup } from './code-labels.js'
import type { StatusCounts } from './dto.js'
import {
  LOCALES,
  type DefectPriority,
  type DefectSeverity,
  type DefectStatus,
  type ExecutionKind,
  type ExecutionStatus,
  type Locale,
  type RunStatus,
} from './enums.js'
import type { TabularValue } from './tabular.js'

/**
 * Reports (Milestone 7, screen S09, TB-REPORT-001).
 *
 * Definitions shown to users:
 * - A run case counts once, by its LATEST attempt (retests are not counted twice).
 * - Pass rate = PASSED run cases / ALL run cases in scope (NOT_RUN, BLOCKED and SKIPPED
 *   never count as passed) - the same rule as the dashboard (metrics.ts).
 * - Period filters are calendar days in Asia/Jakarta (WIB, UTC+7): runs whose period
 *   overlaps the range, attempts tested in the range, bugs reported in the range.
 */

export const REPORT_TIMEZONE = 'Asia/Jakarta'
const WIB_OFFSET_MS = 7 * 3_600_000

export const REPORT_DATASETS = ['results', 'attempts', 'defects', 'cases'] as const
export type ReportDataset = (typeof REPORT_DATASETS)[number]

export const REPORT_FORMATS = ['csv', 'xlsx'] as const
export type ReportFormat = (typeof REPORT_FORMATS)[number]

/** Exports beyond this need narrower filters (keeps memory and response time bounded). */
export const REPORT_EXPORT_MAX_ROWS = 50_000

const idString = z.string().regex(/^\d{1,20}$/)
const dayString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((day) => !Number.isNaN(Date.parse(`${day}T00:00:00Z`)), 'Invalid date')

const filterShape = {
  run_id: idString.optional(),
  cycle_id: idString.optional(),
  module_id: idString.optional(),
  from: dayString.optional(),
  to: dayString.optional(),
}

const rangeIsOrdered = (value: { from?: string; to?: string }) =>
  !value.from || !value.to || value.from <= value.to

export const reportFilterSchema = z
  .object(filterShape)
  .refine(rangeIsOrdered, { path: ['to'], message: 'End date is before start date' })

export type ReportFilter = z.infer<typeof reportFilterSchema>

export const reportExportSchema = z
  .object({
    ...filterShape,
    dataset: z.enum(REPORT_DATASETS),
    format: z.enum(REPORT_FORMATS).default('csv'),
    locale: z.enum(LOCALES).default('id'),
  })
  .refine(rangeIsOrdered, { path: ['to'], message: 'End date is before start date' })

export type ReportExportQuery = z.infer<typeof reportExportSchema>

/** Start of a WIB calendar day as a UTC instant. */
export function wibDayStart(day: string): Date {
  return new Date(Date.parse(`${day}T00:00:00Z`) - WIB_OFFSET_MS)
}

/** Start of the WIB day AFTER `day` (exclusive upper bound). */
export function wibDayEnd(day: string): Date {
  return new Date(wibDayStart(day).getTime() + 86_400_000)
}

/** "YYYY-MM-DD HH:mm" in WIB (Asia/Jakarta has no daylight saving time). */
export function formatWib(iso: string | null | undefined, withTime = true): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return ''
  const text = new Date(ms + WIB_OFFSET_MS).toISOString()
  return withTime ? `${text.slice(0, 10)} ${text.slice(11, 16)}` : text.slice(0, 10)
}

// ------------------------------------------------------------------------ overview DTO

export interface ReportGroupRow {
  key: string
  code: string | null
  name: string
  run_cases: number
  counts: StatusCounts
  pass_rate: number | null
}

export interface ReportRunRow extends ReportGroupRow {
  id: IdString
  status_code: RunStatus
  cycle_code: string | null
  starts_at: string | null
  ends_at: string | null
}

export interface ReportTesterRow {
  key: string
  tester_id: IdString | null
  name: string
  /** Name from an imported legacy result (no user account). */
  legacy: boolean
  attempts: number
  retests: number
  /** Results of the attempts this tester recorded (not latest-per-case). */
  counts: StatusCounts
  last_tested_at: string | null
}

export interface ReportDefectSummary {
  total: number
  open: number
  by_severity: Record<DefectSeverity, { open: number; total: number }>
  by_status: Record<DefectStatus, number>
}

export interface ReportOverview {
  project_code: string
  generated_at: string
  timezone: typeof REPORT_TIMEZONE
  filters: ReportFilter
  totals: {
    run_cases: number
    executed: number
    attempts: number
    retests: number
    counts: StatusCounts
    pass_rate: number | null
  }
  by_run: ReportRunRow[]
  by_module: ReportGroupRow[]
  by_tester: ReportTesterRow[]
  defects: ReportDefectSummary
}

// ------------------------------------------------------------------------ export rows

export interface ResultRecord {
  run_code: string
  run_name: string
  cycle_code: string | null
  module_code: string | null
  case_code: string
  title: string
  case_version: number
  status: ExecutionStatus
  attempts: number
  last_tested_at: string | null
  last_tester: string | null
  assignee: string | null
  actual_result: string | null
  notes: string | null
  bugs: string[]
}

export interface AttemptRecord {
  run_code: string
  module_code: string | null
  case_code: string
  title: string
  attempt_number: number
  kind: ExecutionKind
  status: ExecutionStatus
  tested_at: string | null
  tester: string | null
  actual_result: string | null
  notes: string | null
  browser: string | null
  device: string | null
  os: string | null
  evidence: number
  bugs: string[]
}

export interface DefectRecord {
  bug_code: string
  title: string
  severity: DefectSeverity
  priority: DefectPriority
  status: DefectStatus
  module_code: string | null
  reporter: string | null
  assignee: string | null
  environment: string | null
  build: string | null
  fixed_in_version: string | null
  created_at: string | null
  resolved_at: string | null
  closed_at: string | null
  cases: string[]
  runs: string[]
}

/** Same columns as the CSV import template, so a library export can be re-imported. */
export interface CaseRecord {
  case_code: string
  module_code: string | null
  suite_name: string | null
  category: string | null
  title: string
  requirement_refs: string | null
  priority_code: string
  test_type_code: string
  actor_label: string | null
  preconditions: string | null
  test_steps_text: string | null
  expected_result: string | null
  source_locale: string
  source_document: string | null
  case_status: string
  current_version: number
  updated_at: string | null
}

export interface ReportRecordMap {
  results: ResultRecord
  attempts: AttemptRecord
  defects: DefectRecord
  cases: CaseRecord
}

type ColumnKind = 'text' | 'number' | 'datetime' | 'list' | { code: CodeGroup }

interface ReportColumn<R> {
  key: keyof R & string
  header: Record<Locale, string>
  kind: ColumnKind
}

const col = <R>(
  key: keyof R & string,
  id: string,
  en: string,
  kind: ColumnKind = 'text',
): ReportColumn<R> => ({ key, header: { id, en }, kind })

/** Import-template column: identical header in every locale. */
const raw = <R>(key: keyof R & string, kind: ColumnKind = 'text'): ReportColumn<R> => ({
  key,
  header: { id: key, en: key },
  kind,
})

export const REPORT_COLUMNS: { [D in ReportDataset]: ReportColumn<ReportRecordMap[D]>[] } = {
  results: [
    col('run_code', 'Kode lembar uji', 'Run code'),
    col('run_name', 'Nama lembar uji', 'Run name'),
    col('cycle_code', 'Fase', 'Cycle'),
    col('module_code', 'Fitur', 'Module'),
    col('case_code', 'Kode skenario uji', 'Test case code'),
    col('title', 'Judul', 'Title'),
    col('case_version', 'Versi', 'Version', 'number'),
    col('status', 'Status terbaru', 'Latest status', { code: 'execution' }),
    col('attempts', 'Jumlah percobaan', 'Attempts', 'number'),
    col('last_tested_at', 'Terakhir diuji (WIB)', 'Last tested (WIB)', 'datetime'),
    col('last_tester', 'Penguji terakhir', 'Last tester'),
    col('assignee', 'Ditugaskan ke', 'Assigned to'),
    col('actual_result', 'Hasil aktual', 'Actual result'),
    col('notes', 'Catatan', 'Notes'),
    col('bugs', 'Masalah terkait', 'Linked bugs', 'list'),
  ],
  attempts: [
    col('run_code', 'Kode lembar uji', 'Run code'),
    col('module_code', 'Fitur', 'Module'),
    col('case_code', 'Kode skenario uji', 'Test case code'),
    col('title', 'Judul', 'Title'),
    col('attempt_number', 'Percobaan ke', 'Attempt', 'number'),
    col('kind', 'Jenis', 'Kind', { code: 'executionKind' }),
    col('status', 'Hasil', 'Result', { code: 'execution' }),
    col('tested_at', 'Waktu uji (WIB)', 'Tested at (WIB)', 'datetime'),
    col('tester', 'Penguji', 'Tester'),
    col('actual_result', 'Hasil aktual', 'Actual result'),
    col('notes', 'Catatan', 'Notes'),
    col('browser', 'Browser', 'Browser'),
    col('device', 'Perangkat', 'Device'),
    col('os', 'Sistem operasi', 'Operating system'),
    col('evidence', 'Jumlah bukti', 'Evidence files', 'number'),
    col('bugs', 'Masalah terkait', 'Linked bugs', 'list'),
  ],
  defects: [
    col('bug_code', 'Kode masalah', 'Bug code'),
    col('title', 'Judul', 'Title'),
    col('severity', 'Tingkat dampak', 'Severity', { code: 'severity' }),
    col('priority', 'Prioritas', 'Priority', { code: 'defectPriority' }),
    col('status', 'Status', 'Status', { code: 'defectStatus' }),
    col('module_code', 'Fitur', 'Module'),
    col('reporter', 'Pelapor', 'Reporter'),
    col('assignee', 'Ditugaskan ke', 'Assigned to'),
    col('environment', 'Lingkungan', 'Environment'),
    col('build', 'Build/versi', 'Build/version'),
    col('fixed_in_version', 'Diperbaiki di versi', 'Fixed in version'),
    col('created_at', 'Dilaporkan (WIB)', 'Reported (WIB)', 'datetime'),
    col('resolved_at', 'Diselesaikan (WIB)', 'Resolved (WIB)', 'datetime'),
    col('closed_at', 'Ditutup (WIB)', 'Closed (WIB)', 'datetime'),
    col('cases', 'Skenario uji terkait', 'Linked test cases', 'list'),
    col('runs', 'Lembar uji terkait', 'Linked runs', 'list'),
  ],
  cases: [
    raw('case_code'),
    raw('module_code'),
    raw('suite_name'),
    raw('category'),
    raw('title'),
    raw('requirement_refs'),
    raw('priority_code'),
    raw('test_type_code'),
    raw('actor_label'),
    raw('preconditions'),
    raw('test_steps_text'),
    raw('expected_result'),
    raw('source_locale'),
    raw('source_document'),
    raw('case_status'),
    raw('current_version', 'number'),
    raw('updated_at', 'datetime'),
  ],
}

export const REPORT_SHEET_NAMES: Record<ReportDataset, Record<Locale, string>> = {
  results: { id: 'Hasil terbaru', en: 'Latest results' },
  attempts: { id: 'Semua percobaan', en: 'All attempts' },
  defects: { id: 'Masalah', en: 'Problems' },
  cases: { id: 'Skenario uji', en: 'Test scenarios' },
}

function cellValue(value: unknown, kind: ColumnKind, locale: Locale): TabularValue {
  if (value === null || value === undefined) return null
  if (kind === 'number') return typeof value === 'number' ? value : Number(value)
  if (kind === 'datetime') return formatWib(String(value))
  if (kind === 'list') return Array.isArray(value) ? value.join(', ') : String(value)
  if (typeof kind === 'object') return codeLabel(kind.code, String(value), locale)
  return String(value)
}

/** Header + rows for one dataset, with code labels and WIB times in the chosen language. */
export function reportTable<D extends ReportDataset>(
  dataset: D,
  records: ReportRecordMap[D][],
  locale: Locale,
): { header: string[]; rows: TabularValue[][] } {
  const columns = REPORT_COLUMNS[dataset] as ReportColumn<ReportRecordMap[D]>[]
  return {
    header: columns.map((c) => c.header[locale]),
    rows: records.map((record) => columns.map((c) => cellValue(record[c.key], c.kind, locale))),
  }
}

/** e.g. testboard-KARIR-results-20261120-1405.xlsx (time in WIB). */
export function reportFileName(
  projectCode: string,
  dataset: ReportDataset,
  format: ReportFormat,
  at: Date = new Date(),
): string {
  const stamp = formatWib(at.toISOString()).replace(/[-:]/g, '').replace(' ', '-')
  const code = projectCode.replace(/[^A-Za-z0-9_-]/g, '')
  return `testboard-${code}-${dataset}-${stamp}.${format}`
}

// ------------------------------------------------------------------------ audit log

export interface AuditChange {
  field: string
  old: unknown
  new: unknown
}

export interface AuditLogEntry {
  id: IdString
  created_at: string
  actor: { id: IdString; display_name: string } | null
  entity_type: string
  entity_id: IdString
  action_code: string
  /** Top-level fields that changed (secrets were already redacted when written). */
  changes: AuditChange[]
  request_id: string | null
  /** Site-wide log only: the project the entry belongs to (null = website level). */
  project?: { id: IdString; project_code: string } | null
}

export const auditFilterSchema = z
  .object({
    entity_type: z
      .string()
      .regex(/^[a-z_]{1,100}$/)
      .optional(),
    action: z
      .string()
      .regex(/^[A-Z_]{1,100}$/)
      .optional(),
    actor_id: idString.optional(),
    /** Site-wide log only: a project id, or "site" for website-level entries. */
    project: z.union([idString, z.literal('site')]).optional(),
    from: dayString.optional(),
    to: dayString.optional(),
  })
  .refine(rangeIsOrdered, { path: ['to'], message: 'End date is before start date' })

export type AuditFilter = z.infer<typeof auditFilterSchema>

const AUDIT_VALUE_MAX = 300

function shortValue(value: unknown): unknown {
  if (typeof value === 'string' && value.length > AUDIT_VALUE_MAX) {
    return `${value.slice(0, AUDIT_VALUE_MAX)}…`
  }
  if (value && typeof value === 'object') {
    const text = JSON.stringify(value)
    return text.length > AUDIT_VALUE_MAX ? `${text.slice(0, AUDIT_VALUE_MAX)}…` : value
  }
  return value
}

/** Field-level differences between two audit snapshots (top-level keys only). */
export function auditChanges(oldValues: unknown, newValues: unknown): AuditChange[] {
  const asRecord = (v: unknown) =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  const before = asRecord(oldValues)
  const after = asRecord(newValues)
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  return keys
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => ({
      field: key,
      old: key in before ? shortValue(before[key]) : null,
      new: key in after ? shortValue(after[key]) : null,
    }))
}
