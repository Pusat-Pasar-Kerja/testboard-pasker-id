import {
  AUDIT_REF_FIELDS,
  auditRefKey,
  PUBLIC_FIELDS,
  type AuditChange,
  type AuditLogEntry,
  type PublicField,
} from '@testboard/shared'
import { useTranslation } from 'react-i18next'
import { formatDate, formatDateTime, formatNumber, toLocale } from '../../lib/format'

/**
 * Plain-words activity log (audit 2026-11-24: the log showed database column names and raw
 * JSON). Field names become labels, codes become the same words as the rest of the site,
 * ids become names (AuditLogEntry.refs), lists of ids become counts.
 */

/** Bookkeeping values that mean nothing to a reader (concurrency tokens, internal links). */
const HIDDEN_FIELDS = new Set([
  'expected_version',
  'expected_updated_at',
  'client_id',
  'run_case_id',
  'reset_link_id',
  'request_id',
])

/** Changes shown on the entry line itself instead of behind "see the changes". */
const HEADLINE_FIELDS = new Set(['status_code', 'state_code', 'case_status', 'status', 'role_code'])

const COUNT_FIELDS: Record<string, 'files' | 'results' | 'scenarios' | 'steps'> = {
  attached_file_id: 'files',
  attached_file_ids: 'files',
  evidence_file_ids: 'files',
  evidence: 'files',
  execution_ids: 'results',
  linked_execution_id: 'results',
  run_case_ids: 'scenarios',
  test_case_ids: 'scenarios',
  steps: 'steps',
}

const DATE_FIELDS = new Set(['starts_on', 'ends_on', 'preparation_date'])
const LANGUAGE_FIELDS = new Set(['preferred_locale', 'source_locale', 'site.default_locale'])
const WORD_FIELDS = new Set(['target', 'scope', 'via', 'reason'])
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

type CodeGroup =
  | 'defectStatus'
  | 'runStatus'
  | 'cycleStatus'
  | 'severity'
  | 'defectPriority'
  | 'casePriority'
  | 'role'
  | 'systemRole'
  | 'caseStatus'
  | 'testType'
  | 'execution'
  | 'executionKind'
  | 'defectSource'
  | 'importMode'

/** Which code list a field's value belongs to (the same field name differs per data type). */
function codeGroupOf(entity: string, field: string): CodeGroup | null {
  switch (field) {
    case 'status_code':
      if (entity === 'defect') return 'defectStatus'
      if (entity === 'test_run') return 'runStatus'
      if (entity === 'test_cycle') return 'cycleStatus'
      return null
    case 'severity_code':
      return 'severity'
    case 'priority_code':
      return entity === 'test_case' ? 'casePriority' : 'defectPriority'
    case 'role_code':
      return 'role'
    case 'system_role':
      return 'systemRole'
    case 'case_status':
      return 'caseStatus'
    case 'test_type_code':
      return 'testType'
    case 'result_status':
      return 'execution'
    case 'execution_kind':
      return 'executionKind'
    case 'source_kind':
      return entity === 'defect' ? 'defectSource' : null
    case 'mode':
      return entity === 'import_job' ? 'importMode' : null
    default:
      return null
  }
}

const isEmpty = (value: unknown) =>
  value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)

const isPublicField = (value: unknown): value is PublicField =>
  typeof value === 'string' && (PUBLIC_FIELDS as readonly string[]).includes(value)

type LooseT = (key: string, options?: Record<string, unknown>) => string

export interface AuditRow {
  field: string
  label: string
  before: string | null
  after: string
}

export function useAuditFormat() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const tl = t as unknown as LooseT
  /** Translation when the key exists, otherwise null (codes added later still show). */
  const known = (key: string, options?: Record<string, unknown>) =>
    i18n.exists(key) ? tl(key, options) : null

  const fieldLabel = (field: string): string => {
    const key = `audit.field.${field.replace(/\./g, '_')}`
    if (i18n.exists(key)) return tl(key)
    // A field this version does not know yet: readable words instead of snake_case.
    const words = field.replace(/[._]+/g, ' ').trim()
    return words.charAt(0).toUpperCase() + words.slice(1)
  }

  const formatValue = (entry: AuditLogEntry, field: string, value: unknown): string => {
    if (isEmpty(value)) return t('audit.value.empty')
    if (value === '[REDACTED]') return t('audit.value.hidden')

    const count = COUNT_FIELDS[field]
    if (count) {
      const n = Array.isArray(value) ? value.length : 1
      return tl(`audit.value.${count}`, { count: n })
    }

    const refKind = AUDIT_REF_FIELDS[field]
    if (refKind) {
      const ids = Array.isArray(value) ? value : [value]
      return ids
        .map((id) => entry.refs[auditRefKey(refKind, String(id))] ?? `#${String(id)}`)
        .join(', ')
    }

    if (typeof value === 'boolean') return value ? t('audit.value.yes') : t('audit.value.no')
    if (typeof value === 'number') return formatNumber(value, locale)

    if (Array.isArray(value)) {
      if (field === 'public_fields') {
        return value
          .map((f) => (isPublicField(f) ? t(`workshop.public.field.${f}.label`) : String(f)))
          .join(', ')
      }
      return value.map((item) => formatValue(entry, '', item)).join(', ')
    }

    if (typeof value === 'object') {
      const record = value as Record<string, unknown>
      if (field === 'run' && typeof record.run_code === 'string') return record.run_code
      return Object.entries(record)
        .filter(([key, inner]) => !HIDDEN_FIELDS.has(key) && !isEmpty(inner))
        .map(([key, inner]) => `${fieldLabel(key)}: ${formatValue(entry, key, inner)}`)
        .join('; ')
    }

    const text = String(value)
    const group = codeGroupOf(entry.entity_type, field)
    if (group) return known(`codes.${group}.${text}`) ?? text
    if (entry.entity_type === 'recovery_request' && (field === 'status' || field === 'kind')) {
      return known(`recovery.${field}.${text}`) ?? text
    }
    if (field === 'state_code') return known(`audit.value.state.${text}`) ?? text
    if (field === 'dataset') return known(`pages.reports.export.datasets.${text}.title`) ?? text
    if (LANGUAGE_FIELDS.has(field)) return known(`language.${text}`) ?? text
    if (WORD_FIELDS.has(field)) return known(`audit.value.${field}.${text}`) ?? text
    if (field === 'format') return text.toUpperCase()
    if (DATE_FIELDS.has(field) || ISO_DAY.test(text)) return formatDate(text, locale)
    if (ISO_TIME.test(text)) return formatDateTime(text, locale)
    return text
  }

  /**
   * The rows a reader sees: bookkeeping dropped, rows that stay empty skipped, and only the
   * new value when there was nothing before (a new item, a first note).
   */
  const rowsOf = (entry: AuditLogEntry): AuditRow[] =>
    entry.changes
      .filter((c: AuditChange) => !HIDDEN_FIELDS.has(c.field))
      .filter((c) => !(isEmpty(c.old) && isEmpty(c.new)))
      .map((c) => ({
        field: c.field,
        label: fieldLabel(c.field),
        before: isEmpty(c.old) ? null : formatValue(entry, c.field, c.old),
        after: formatValue(entry, c.field, c.new),
      }))

  /** A status-like change worth showing on the entry line itself, e.g. "Baru -> Diperbaiki". */
  const headlineOf = (rows: AuditRow[]): AuditRow | null =>
    rows.find((row) => HEADLINE_FIELDS.has(row.field) && row.before !== null) ?? null

  return { fieldLabel, formatValue, rowsOf, headlineOf }
}
