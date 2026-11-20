import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { StatusBar } from '../components/charts/StatusBar'
import { RunStatusBadge } from '../components/status/StatusBadges'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useRuns } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { formatDate, toLocale } from '../lib/format'

export function RunsPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const runs = useRuns(code)

  return (
    <>
      <PageHeader
        title={t('pages.runs.title')}
        subtitle={t('pages.runs.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('pages.runs.title') }]}
      />
      {runs.isPending && <LoadingState rows={3} />}
      {runs.isError && <ErrorState error={runs.error} onRetry={() => void runs.refetch()} />}
      {runs.isSuccess && runs.data.length === 0 && (
        <EmptyState description={t('pages.runs.empty')} />
      )}
      {runs.isSuccess && runs.data.length > 0 && (
        <ul className="space-y-4">
          {runs.data.map((run) => (
            <li key={run.id}>
              <Link
                to={projectPath(code, `runs/${run.id}`)}
                className="block rounded-xl border border-line bg-surface p-5 shadow-xs hover:border-brand-300"
              >
                <span className="flex flex-wrap items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold text-brand-700">
                      {run.run_code}
                    </span>
                    <span className="block text-lg font-semibold">{run.name}</span>
                    <span className="mt-1 block text-sm text-ink-muted">
                      {run.cycle?.title ?? t('fields.none')} · {run.environment_name} ·{' '}
                      {t('fields.build')} {run.build_version}
                      {run.starts_at && <> · {formatDate(run.starts_at, locale)}</>}
                    </span>
                  </span>
                  <RunStatusBadge status={run.status_code} />
                </span>
                <span className="mt-4 block">
                  <StatusBar counts={run.counts} variant="thin" />
                </span>
                <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-muted tabular-nums">
                  {(['PASSED', 'FAILED', 'BLOCKED', 'NOT_RUN'] as const).map((status) => (
                    <span key={status}>
                      {t(`codes.execution.${status}`)}{' '}
                      <strong className="font-semibold text-ink">{run.counts[status]}</strong>
                    </span>
                  ))}
                  <span>
                    {t('fields.progress')}{' '}
                    <strong className="font-semibold text-ink">
                      {run.total_cases - run.counts.NOT_RUN}/{run.total_cases}
                    </strong>
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
