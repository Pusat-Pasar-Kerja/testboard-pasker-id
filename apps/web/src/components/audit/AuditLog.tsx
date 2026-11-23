import type { AuditLogEntry } from '@testboard/shared'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { projectPath } from '../../hooks/route-state'
import { formatDateTime, toLocale } from '../../lib/format'
import { Badge } from '../ui/Badge'
import { useAuditFormat, type AuditRow } from './audit-format'
import { useAuditLabels } from './audit-labels'

/** Pages an entry can open (only items that keep their own page). */
const ITEM_PAGE: Record<string, string> = {
  defect: 'bugs',
  test_case: 'test-cases',
  test_run: 'runs',
}

/**
 * Actions recorded before a session exists (signing in, a reset link, activating an
 * account): the person is the item itself, so the log names them instead of "System".
 */
const SELF_ACTIONS = new Set(['LOGIN', 'PASSWORD_RESET', 'ACTIVATE'])

function Change({ row }: { row: AuditRow }) {
  return (
    <>
      {row.before !== null && (
        <>
          <span className="text-ink-muted line-through">{row.before}</span>
          <span aria-hidden="true"> → </span>
        </>
      )}
      <span className="whitespace-pre-line">{row.after}</span>
    </>
  )
}

function ChangeList({ rows }: { rows: AuditRow[] }) {
  const { t } = useTranslation()
  if (rows.length === 0) return null
  const shown = rows.slice(0, 3).map((row) => row.label)
  const fields =
    rows.length > 3
      ? `${shown.join(', ')} ${t('pages.reports.activity.more', { count: rows.length - 3 })}`
      : shown.join(', ')
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium text-brand-700">
        {t('pages.reports.activity.show', { count: rows.length, fields })}
      </summary>
      <dl className="mt-2 space-y-1">
        {rows.map((row) => (
          <div key={row.field} className="grid grid-cols-1 gap-1 sm:grid-cols-[12rem_1fr]">
            <dt className="font-medium text-ink-muted">{row.label}</dt>
            <dd className="break-words">
              <Change row={row} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

/**
 * One activity entry per row: when, who, what happened to which item (by name, never by
 * database id), the main status change on the line itself, the rest on demand.
 */
export function AuditEntryList({
  entries,
  busy = false,
  showProject = false,
  projectCode,
}: {
  entries: AuditLogEntry[]
  busy?: boolean
  showProject?: boolean
  /** Project log: the project the entries belong to (for links to the items). */
  projectCode?: string
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { entityLabel, actionLabel } = useAuditLabels()
  const { rowsOf, headlineOf } = useAuditFormat()
  return (
    <ul className="divide-y divide-line" aria-busy={busy}>
      {entries.map((entry) => {
        const rows = rowsOf(entry)
        const headline = headlineOf(rows)
        const rest = headline ? rows.filter((row) => row !== headline) : rows
        const self = !entry.actor && SELF_ACTIONS.has(entry.action_code) && entry.entity_label
        const actor =
          entry.actor?.display_name ??
          (self ? entry.entity_label : null) ??
          (entry.entity_type === 'recovery_request'
            ? t('pages.reports.activity.visitor')
            : t('pages.reports.activity.system'))
        const code = projectCode ?? entry.project?.project_code
        const page = ITEM_PAGE[entry.entity_type]
        const itemLink =
          code && page && entry.entity_label && entry.action_code !== 'DELETE'
            ? projectPath(code, `${page}/${entry.entity_id}`)
            : null
        return (
          <li key={entry.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:gap-4">
            <span className="shrink-0 text-xs text-ink-muted tabular-nums sm:w-40">
              {formatDateTime(entry.created_at, locale)}
            </span>
            <span className="min-w-0 flex-1 space-y-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="font-semibold text-ink">{actor}</span>
                <Badge tone="brand" label={actionLabel(entry.action_code)} />
                {!self && <span className="text-ink-muted">{entityLabel(entry.entity_type)}</span>}
                {!self &&
                  entry.entity_label &&
                  (itemLink ? (
                    <Link
                      to={itemLink}
                      className="min-w-0 font-medium break-words text-brand-700 hover:underline"
                      aria-label={t('audit.openItem', { name: entry.entity_label })}
                    >
                      {entry.entity_label}
                    </Link>
                  ) : (
                    <span className="min-w-0 font-medium break-words text-ink">
                      {entry.entity_label}
                    </span>
                  ))}
                {showProject &&
                  (entry.project ? (
                    <Link
                      to={projectPath(entry.project.project_code)}
                      className="text-xs font-semibold text-brand-700 hover:underline"
                    >
                      {entry.project.project_code}
                    </Link>
                  ) : (
                    <Badge tone="muted" label={t('pages.adminAudit.siteLevel')} />
                  ))}
              </span>
              {headline && (
                <span className="block text-sm">
                  <span className="text-ink-muted">{headline.label}: </span>
                  <Change row={headline} />
                </span>
              )}
              <ChangeList rows={rest} />
              {rows.length === 0 && entry.action_code === 'UPDATE' && (
                <span className="block text-xs text-ink-muted">
                  {t('pages.reports.activity.noChanges')}
                </span>
              )}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
