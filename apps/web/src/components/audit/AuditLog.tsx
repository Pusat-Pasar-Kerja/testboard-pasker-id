import type { AuditLogEntry } from '@testboard/shared'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { projectPath } from '../../hooks/route-state'
import { formatDateTime, toLocale } from '../../lib/format'
import { Badge } from '../ui/Badge'
import { useAuditLabels } from './audit-labels'

function ChangeList({ entry }: { entry: AuditLogEntry }) {
  const { t } = useTranslation()
  const show = (value: unknown) =>
    value === null || value === undefined || value === ''
      ? t('fields.none')
      : typeof value === 'string'
        ? value
        : JSON.stringify(value)
  if (entry.changes.length === 0) {
    return <p className="text-xs text-ink-muted">{t('pages.reports.activity.noChanges')}</p>
  }
  return (
    <details className="text-xs">
      <summary className="cursor-pointer font-medium text-brand-700">
        {t('pages.reports.activity.changes', { count: entry.changes.length })}
      </summary>
      <dl className="mt-2 space-y-1">
        {entry.changes.map((change) => (
          <div key={change.field} className="grid grid-cols-1 gap-1 sm:grid-cols-[10rem_1fr]">
            <dt>
              <code className="text-ink-muted">{change.field}</code>
            </dt>
            <dd className="break-words">
              {entry.action_code === 'CREATE' || entry.action_code === 'EXPORT' ? (
                show(change.new)
              ) : (
                <>
                  <span className="text-ink-muted line-through">{show(change.old)}</span>
                  {' -> '}
                  <span>{show(change.new)}</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  )
}

/** One activity entry per row: when, who, what, and the field changes on demand. */
export function AuditEntryList({
  entries,
  busy = false,
  showProject = false,
}: {
  entries: AuditLogEntry[]
  busy?: boolean
  showProject?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { entityLabel, actionLabel } = useAuditLabels()
  return (
    <ul className="divide-y divide-line" aria-busy={busy}>
      {entries.map((entry) => (
        <li key={entry.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:gap-4">
          <span className="shrink-0 text-xs text-ink-muted tabular-nums sm:w-40">
            {formatDateTime(entry.created_at, locale)}
          </span>
          <span className="min-w-0 flex-1 space-y-1">
            <span className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">
                {entry.actor?.display_name ?? t('pages.reports.activity.system')}
              </span>
              <Badge tone="brand" label={actionLabel(entry.action_code)} />
              <span className="text-ink-muted">
                {entityLabel(entry.entity_type)} #{entry.entity_id}
              </span>
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
            <ChangeList entry={entry} />
          </span>
        </li>
      ))}
    </ul>
  )
}
