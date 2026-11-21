import { executedOf, passRate } from '@testboard/shared'
import { Bug, CircleCheck, ClipboardList, Percent, TriangleAlert } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { SeverityBars } from '../components/charts/SeverityBars'
import { StatTile } from '../components/charts/StatTile'
import { StatusBar } from '../components/charts/StatusBar'
import { DefectStatusBadge, RunStatusBadge, SeverityBadge } from '../components/status/StatusBadges'
import { FilterBar, SelectFilter } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useDashboard, useProject } from '../hooks/queries'
import { projectPath, useProjectCode, useUrlFilters } from '../hooks/route-state'
import { formatNumber, formatPercent, formatShortDateTime, toLocale } from '../lib/format'

export function DashboardPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const project = useProject(code)
  const filters = useUrlFilters(['run'] as const)
  const runId = filters.values.run || undefined
  const dashboard = useDashboard(code, runId)
  const data = dashboard.data
  const bugs = (query: string) => `${projectPath(code, 'bugs')}?${query}`

  return (
    <>
      <PageHeader
        title={t('pages.dashboard.title')}
        subtitle={project.data?.name}
        crumbs={[{ label: code }]}
      />

      <FilterBar>
        <SelectFilter
          label={t('filters.run')}
          value={filters.values.run}
          allLabel={t('filters.allRuns')}
          onChange={(value) => filters.setFilter('run', value)}
          options={(data?.runs ?? []).map((run) => ({
            value: run.id,
            label: `${run.run_code} - ${run.name}`,
          }))}
        />
      </FilterBar>

      {dashboard.isPending && <LoadingState rows={6} />}
      {dashboard.isError && (
        <ErrorState error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      )}
      {data && (
        <div
          className={`space-y-6 transition-opacity ${dashboard.isPlaceholderData ? 'opacity-60' : ''}`}
          aria-busy={dashboard.isFetching}
        >
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <StatTile
              icon={ClipboardList}
              tone="lavender"
              label={t('pages.dashboard.kpiPlanned')}
              value={formatNumber(data.total_run_cases, locale)}
            />
            <StatTile
              icon={CircleCheck}
              tone="mint"
              label={t('pages.dashboard.kpiExecuted')}
              value={formatNumber(executedOf(data.counts), locale)}
            />
            <StatTile
              icon={Percent}
              tone="sky"
              label={t('pages.dashboard.kpiPassRate')}
              value={(() => {
                const rate = passRate(data.counts)
                return rate === null ? t('fields.none') : formatPercent(rate, locale)
              })()}
            />
            <StatTile
              icon={Bug}
              tone="peach"
              label={t('pages.dashboard.kpiOpenBugs')}
              value={formatNumber(data.open_defects, locale)}
              to={bugs('status=open')}
            />
            <StatTile
              icon={TriangleAlert}
              tone="butter"
              label={t('pages.dashboard.kpiCriticalHigh')}
              value={formatNumber(data.critical_high_open_defects, locale)}
              to={bugs('status=open')}
            />
          </div>

          <Section
            title={t('pages.dashboard.statusHeading')}
            description={t('pages.dashboard.statusNote')}
          >
            {data.total_run_cases === 0 ? (
              <EmptyState description={t('pages.dashboard.noRunCases')} />
            ) : (
              <StatusBar counts={data.counts} />
            )}
          </Section>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Section title={t('pages.dashboard.severityHeading')}>
              <SeverityBars
                counts={data.open_defects_by_severity}
                linkFor={(severity) => bugs(`status=open&severity=${severity}`)}
              />
            </Section>

            <Section
              title={t('pages.dashboard.runsHeading')}
              action={
                <Link
                  to={projectPath(code, 'runs')}
                  className="text-sm font-medium text-brand-700 hover:underline"
                >
                  {t('actions.viewAll')}
                </Link>
              }
            >
              {data.runs.length === 0 ? (
                <EmptyState description={t('pages.dashboard.noRuns')} />
              ) : (
                <ul className="space-y-4">
                  {data.runs.map((run) => (
                    <li key={run.id}>
                      <Link
                        to={projectPath(code, `runs/${run.id}`)}
                        className="block rounded-lg p-2 hover:bg-brand-50"
                      >
                        <span className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0">
                            <span className="block text-xs font-semibold text-brand-700">
                              {run.run_code}
                            </span>
                            <span className="block text-sm font-medium">{run.name}</span>
                          </span>
                          <RunStatusBadge status={run.status_code} />
                        </span>
                        <StatusBar counts={run.counts} variant="thin" />
                        <span className="mt-1 block text-xs text-ink-muted tabular-nums">
                          {t('codes.execution.PASSED')} {run.counts.PASSED} ·{' '}
                          {t('codes.execution.FAILED')} {run.counts.FAILED} ·{' '}
                          {t('codes.execution.NOT_RUN')} {run.counts.NOT_RUN} / {run.total_cases}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <Section
            title={t('pages.dashboard.recentBugs')}
            action={
              <Link
                to={projectPath(code, 'bugs')}
                className="text-sm font-medium text-brand-700 hover:underline"
              >
                {t('actions.viewAll')}
              </Link>
            }
          >
            {data.recent_defects.length === 0 ? (
              <EmptyState description={t('pages.dashboard.noBugs')} />
            ) : (
              <ul className="divide-y divide-line">
                {data.recent_defects.map((defect) => (
                  <li key={defect.id}>
                    <Link
                      to={projectPath(code, `bugs/${defect.id}`)}
                      className="flex flex-col gap-2 py-3 hover:bg-brand-50/50 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-brand-700">
                          {defect.bug_code}
                        </span>
                        <span className="block text-sm break-words">{defect.title}</span>
                      </span>
                      <span className="flex shrink-0 flex-wrap items-center gap-2">
                        <SeverityBadge severity={defect.severity_code} />
                        <DefectStatusBadge status={defect.status_code} />
                        <span className="text-xs text-ink-muted">
                          {formatShortDateTime(defect.updated_at, locale)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}
    </>
  )
}
