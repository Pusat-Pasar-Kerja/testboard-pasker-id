import { EXECUTION_STATUSES, executedOf, passRate, type RunCaseRow } from '@testboard/shared'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { StatTile } from '../components/charts/StatTile'
import { StatusBar } from '../components/charts/StatusBar'
import { ExecutionStatusBadge, RunStatusBadge } from '../components/status/StatusBadges'
import { FilterBar, SelectFilter } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { DescriptionList, Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useRun } from '../hooks/queries'
import { projectPath, useProjectCode, useUrlFilters } from '../hooks/route-state'
import {
  formatDateTime,
  formatNumber,
  formatPercent,
  formatShortDateTime,
  toLocale,
} from '../lib/format'
import { ApiClientError } from '../services/api-client'
import { NotFoundPage } from './NotFoundPage'

export function RunDetailPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const { runId = '' } = useParams()
  const run = useRun(code, runId)
  const filters = useUrlFilters(['status'] as const)
  const none = t('fields.none')

  if (run.isPending) return <LoadingState rows={6} />
  if (run.isError) {
    return run.error instanceof ApiClientError && run.error.status === 404 ? (
      <NotFoundPage reason="item" />
    ) : (
      <ErrorState error={run.error} onRetry={() => void run.refetch()} />
    )
  }
  const r = run.data
  const rows = filters.values.status
    ? r.run_cases.filter((row) => row.latest_status === filters.values.status)
    : r.run_cases
  const rate = passRate(r.counts)

  return (
    <>
      <PageHeader
        title={r.name}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('pages.runs.title'), to: projectPath(code, 'runs') },
          { label: r.run_code },
        ]}
        badges={
          <>
            <span className="text-sm font-semibold text-brand-700">{r.run_code}</span>
            <RunStatusBadge status={r.status_code} />
          </>
        }
      />

      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            label={t('pages.dashboard.kpiPlanned')}
            value={formatNumber(r.total_cases, locale)}
          />
          <StatTile
            label={t('pages.dashboard.kpiExecuted')}
            value={formatNumber(executedOf(r.counts), locale)}
          />
          <StatTile
            label={t('pages.dashboard.kpiPassRate')}
            value={rate === null ? none : formatPercent(rate, locale)}
          />
          <StatTile
            label={t('codes.execution.FAILED')}
            value={formatNumber(r.counts.FAILED, locale)}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Section
            title={t('pages.dashboard.statusHeading')}
            description={t('pages.dashboard.statusNote')}
          >
            <StatusBar counts={r.counts} />
          </Section>
          <Section headingLevel={2}>
            <DescriptionList
              items={[
                { label: t('fields.cycle'), value: r.cycle?.title ?? none },
                { label: t('fields.environment'), value: r.environment_name ?? none },
                { label: t('fields.build'), value: r.build_version ?? none },
                { label: t('fields.environmentUrl'), value: r.environment_url ?? none },
                {
                  label: t('fields.period'),
                  value: r.starts_at
                    ? `${formatDateTime(r.starts_at, locale)}${r.ends_at ? ` - ${formatDateTime(r.ends_at, locale)}` : ''}`
                    : none,
                  wide: true,
                },
              ]}
            />
          </Section>
        </div>

        <Section
          title={t('pages.runDetail.casesHeading')}
          description={t('pages.runDetail.snapshotNote')}
        >
          <FilterBar onReset={filters.active ? filters.reset : undefined}>
            <SelectFilter
              label={t('filters.status')}
              value={filters.values.status}
              onChange={(value) => filters.setFilter('status', value)}
              options={EXECUTION_STATUSES.map((s) => ({
                value: s,
                label: `${t(`codes.execution.${s}`)} (${r.counts[s]})`,
              }))}
            />
          </FilterBar>
          {rows.length === 0 ? (
            <EmptyState filtered description={t('pages.runDetail.emptyFiltered')} />
          ) : (
            <ResponsiveTable<RunCaseRow>
              caption={t('pages.runDetail.casesHeading')}
              rows={rows}
              rowKey={(row) => row.run_case_id}
              rowLink={(row) => projectPath(code, `test-cases/${row.test_case_id}`)}
              primary={(row) => ({ code: row.case_code, title: row.title })}
              cardFields={(row) => (
                <>
                  <ExecutionStatusBadge status={row.latest_status} />
                  <span className="text-xs text-ink-muted">
                    {row.assigned_to?.display_name ?? t('pages.runDetail.unassigned')} ·{' '}
                    {t('fields.attempts')} {row.attempts}
                  </span>
                </>
              )}
              columns={[
                {
                  key: 'code',
                  header: t('fields.caseCode'),
                  render: (row) => row.case_code,
                  className: 'whitespace-nowrap',
                },
                {
                  key: 'title',
                  header: t('fields.title'),
                  render: (row) => (
                    <>
                      {row.title}
                      <span className="block text-xs text-ink-muted">
                        {t('fields.version')} {row.case_version}
                      </span>
                    </>
                  ),
                },
                {
                  key: 'assignee',
                  header: t('fields.assignee'),
                  render: (row) =>
                    row.assigned_to?.display_name ?? (
                      <span className="text-ink-muted">{t('pages.runDetail.unassigned')}</span>
                    ),
                  hideBelow: 'lg',
                },
                {
                  key: 'status',
                  header: t('fields.status'),
                  render: (row) => <ExecutionStatusBadge status={row.latest_status} />,
                },
                {
                  key: 'attempts',
                  header: t('fields.attempts'),
                  render: (row) => <span className="tabular-nums">{row.attempts}</span>,
                },
                {
                  key: 'tested',
                  header: t('fields.lastTested'),
                  render: (row) =>
                    row.last_tested_at ? (
                      <span className="text-ink-muted tabular-nums">
                        {formatShortDateTime(row.last_tested_at, locale)}
                      </span>
                    ) : (
                      none
                    ),
                  className: 'whitespace-nowrap',
                  hideBelow: 'xl',
                },
                {
                  key: 'bugs',
                  header: t('fields.linkedBugs'),
                  render: (row) =>
                    row.defect_codes.length === 0 ? (
                      none
                    ) : (
                      <span className="flex flex-col gap-0.5">
                        {row.defect_codes.map((bug) => (
                          <Link
                            key={bug}
                            to={`${projectPath(code, 'bugs')}?q=${encodeURIComponent(bug)}`}
                            className="text-xs font-semibold text-brand-700 hover:underline"
                          >
                            {bug}
                          </Link>
                        ))}
                      </span>
                    ),
                  hideBelow: 'lg',
                },
              ]}
            />
          )}
        </Section>
      </div>
    </>
  )
}
