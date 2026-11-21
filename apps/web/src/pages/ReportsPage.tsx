import {
  DEFECT_SEVERITIES,
  LOCALES,
  REPORT_DATASETS,
  REPORT_FORMATS,
  type DefectSeverity,
  type Locale,
  type ReportDataset,
  type ReportFilter,
  type ReportFormat,
  type ReportGroupRow,
  type ReportOverview,
} from '@testboard/shared'
import { useMutation } from '@tanstack/react-query'
import {
  Bug,
  CircleCheck,
  ClipboardList,
  Download,
  Info,
  Percent,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { AuditEntryList } from '../components/audit/AuditLog'
import {
  AUDIT_ACTIONS,
  PROJECT_AUDIT_ENTITIES,
  useAuditLabels,
} from '../components/audit/audit-labels'
import { SeverityBars } from '../components/charts/SeverityBars'
import { StatTile } from '../components/charts/StatTile'
import { StatusBar } from '../components/charts/StatusBar'
import { RunStatusBadge } from '../components/status/StatusBadges'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { DateFilter, FilterBar, SelectFilter } from '../components/ui/Filters'
import { FormAlert } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { Tabs } from '../components/ui/Tabs'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import {
  useAuditLogs,
  useCycles,
  useMembers,
  useModules,
  useReportOverview,
  useRuns,
} from '../hooks/queries'
import { projectPath, useProjectCode, useUrlFilters } from '../hooks/route-state'
import { apiErrorText } from '../lib/api-errors'
import {
  formatDate,
  formatNumber,
  formatPercent,
  formatShortDateTime,
  toLocale,
} from '../lib/format'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

/** Small table that scrolls inside its card on narrow screens (never the page). */
function MiniTable({
  caption,
  headers,
  children,
}: {
  caption: string
  headers: { label: string; numeric?: boolean }[]
  children: ReactNode
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-ink-muted">
            {headers.map((h) => (
              <th
                key={h.label}
                scope="col"
                className={`px-2 py-2 font-medium ${h.numeric ? 'text-right' : ''}`}
              >
                {h.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">{children}</tbody>
      </table>
    </div>
  )
}

const num = 'px-2 py-2.5 text-right tabular-nums'
const cell = 'px-2 py-2.5 align-top'

function GroupRows({ rows }: { rows: ReportGroupRow[] }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  return (
    <MiniTable
      caption={t('pages.reports.byModule')}
      headers={[
        { label: t('pages.reports.col.module') },
        { label: t('pages.reports.col.runCases'), numeric: true },
        { label: t('pages.reports.col.status') },
        { label: t('pages.reports.col.passRate'), numeric: true },
      ]}
    >
      {rows.map((row) => (
        <tr key={row.key}>
          <td className={cell}>
            <span className="block font-semibold text-brand-700">
              {row.code ?? t('pages.reports.noModule')}
            </span>
            {row.name && <span className="block text-xs text-ink-muted">{row.name}</span>}
          </td>
          <td className={num}>{formatNumber(row.run_cases, locale)}</td>
          <td className={`${cell} w-2/5 min-w-40`}>
            <StatusBar counts={row.counts} variant="thin" />
          </td>
          <td className={num}>
            {row.pass_rate === null ? t('fields.none') : formatPercent(row.pass_rate, locale)}
          </td>
        </tr>
      ))}
    </MiniTable>
  )
}

function OverviewBody({ code, data }: { code: string; data: ReportOverview }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const severityOpen = Object.fromEntries(
    DEFECT_SEVERITIES.map((s) => [s, data.defects.by_severity[s].open]),
  ) as Record<DefectSeverity, number>
  const tiles: { icon: LucideIcon; label: string; value: string; hint?: string; to?: string }[] = [
    {
      icon: ClipboardList,
      label: t('pages.reports.kpi.runCases'),
      value: formatNumber(data.totals.run_cases, locale),
    },
    {
      icon: CircleCheck,
      label: t('pages.reports.kpi.executed'),
      value: formatNumber(data.totals.executed, locale),
    },
    {
      icon: Percent,
      label: t('pages.reports.kpi.passRate'),
      value:
        data.totals.pass_rate === null
          ? t('fields.none')
          : formatPercent(data.totals.pass_rate, locale),
    },
    {
      icon: RotateCcw,
      label: t('pages.reports.kpi.attempts'),
      value: formatNumber(data.totals.attempts, locale),
      hint: t('pages.reports.kpi.retests', { count: data.totals.retests }),
    },
    {
      icon: Bug,
      label: t('pages.reports.kpi.openBugs'),
      value: formatNumber(data.defects.open, locale),
      hint: t('pages.reports.kpi.ofBugs', { count: data.defects.total }),
      to: `${projectPath(code, 'bugs')}?status=open`,
    },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {tiles.map((tile) => (
          <StatTile key={tile.label} {...tile} />
        ))}
      </div>

      <Section title={t('pages.reports.statusHeading')}>
        {data.totals.run_cases === 0 ? (
          <EmptyState description={t('pages.reports.empty')} />
        ) : (
          <StatusBar counts={data.totals.counts} />
        )}
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title={t('pages.reports.byModule')}>
          {data.by_module.length === 0 ? (
            <EmptyState description={t('pages.reports.empty')} />
          ) : (
            <GroupRows rows={data.by_module} />
          )}
        </Section>
        <Section
          title={t('pages.reports.defectsHeading')}
          description={t('pages.reports.defectsSummary', {
            open: data.defects.open,
            total: data.defects.total,
          })}
        >
          <SeverityBars
            counts={severityOpen}
            linkFor={(severity) => `${projectPath(code, 'bugs')}?status=open&severity=${severity}`}
          />
        </Section>
      </div>

      <Section title={t('pages.reports.byRun')}>
        {data.by_run.length === 0 ? (
          <EmptyState description={t('pages.reports.empty')} />
        ) : (
          <MiniTable
            caption={t('pages.reports.byRun')}
            headers={[
              { label: t('pages.reports.col.run') },
              { label: t('pages.reports.col.period') },
              { label: t('pages.reports.col.runCases'), numeric: true },
              { label: t('pages.reports.col.status') },
              { label: t('pages.reports.col.passRate'), numeric: true },
            ]}
          >
            {data.by_run.map((run) => (
              <tr key={run.id}>
                <td className={cell}>
                  <Link
                    to={projectPath(code, `runs/${run.id}`)}
                    className="block font-semibold text-brand-700 hover:underline"
                  >
                    {run.code}
                  </Link>
                  <span className="block text-xs break-words text-ink-muted">{run.name}</span>
                  <span className="mt-1 inline-block">
                    <RunStatusBadge status={run.status_code} />
                  </span>
                </td>
                <td className={`${cell} text-xs whitespace-nowrap text-ink-muted`}>
                  {run.starts_at ? formatDate(run.starts_at, locale) : t('fields.none')}
                  {run.ends_at && run.ends_at !== run.starts_at
                    ? ` - ${formatDate(run.ends_at, locale)}`
                    : ''}
                </td>
                <td className={num}>{formatNumber(run.run_cases, locale)}</td>
                <td className={`${cell} w-1/3 min-w-36`}>
                  <StatusBar counts={run.counts} variant="thin" />
                </td>
                <td className={num}>
                  {run.pass_rate === null ? t('fields.none') : formatPercent(run.pass_rate, locale)}
                </td>
              </tr>
            ))}
          </MiniTable>
        )}
      </Section>

      <Section title={t('pages.reports.byTester')} description={t('pages.reports.byTesterNote')}>
        {data.by_tester.length === 0 ? (
          <EmptyState description={t('pages.reports.empty')} />
        ) : (
          <MiniTable
            caption={t('pages.reports.byTester')}
            headers={[
              { label: t('pages.reports.col.tester') },
              { label: t('pages.reports.col.attempts'), numeric: true },
              { label: t('pages.reports.col.retests'), numeric: true },
              { label: t('codes.execution.PASSED'), numeric: true },
              { label: t('codes.execution.FAILED'), numeric: true },
              { label: t('codes.execution.BLOCKED'), numeric: true },
              { label: t('pages.reports.col.lastTested') },
            ]}
          >
            {data.by_tester.map((row) => (
              <tr key={row.key}>
                <td className={cell}>
                  <span className="font-medium">{row.name || t('fields.none')}</span>
                  {row.legacy && (
                    <Badge tone="muted" label={t('pages.reports.legacyTester')} className="ml-2" />
                  )}
                </td>
                <td className={num}>{formatNumber(row.attempts, locale)}</td>
                <td className={num}>{formatNumber(row.retests, locale)}</td>
                <td className={num}>{formatNumber(row.counts.PASSED, locale)}</td>
                <td className={num}>{formatNumber(row.counts.FAILED, locale)}</td>
                <td className={num}>{formatNumber(row.counts.BLOCKED, locale)}</td>
                <td className={`${cell} text-xs whitespace-nowrap text-ink-muted`}>
                  {row.last_tested_at
                    ? formatShortDateTime(row.last_tested_at, locale)
                    : t('fields.none')}
                </td>
              </tr>
            ))}
          </MiniTable>
        )}
      </Section>
    </div>
  )
}

function ExportPanel({ code, filter }: { code: string; filter: ReportFilter }) {
  const { t, i18n } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const groupId = useId()
  const [dataset, setDataset] = useState<ReportDataset>('results')
  const [format, setFormat] = useState<ReportFormat>('xlsx')
  const [language, setLanguage] = useState<Locale>(toLocale(i18n.resolvedLanguage))
  const [error, setError] = useState<string | null>(null)

  const run = useMutation({
    mutationFn: () => ds.exportReport(code, { ...filter, dataset, format, locale: language }),
    onSuccess: ({ blob, filename }) => {
      setError(null)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.append(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      toast.show(t('pages.reports.export.downloaded', { name: filename }))
    },
    onError: (err) =>
      setError(
        err instanceof ApiClientError && err.details[0]?.message === 'EXPORT_TOO_LARGE'
          ? t('pages.reports.export.tooLarge')
          : apiErrorText(t, err),
      ),
  })

  return (
    <Section
      title={t('pages.reports.export.heading')}
      description={t('pages.reports.export.description')}
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-sm font-semibold">
            {t('pages.reports.export.dataset')}
          </legend>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {REPORT_DATASETS.map((key) => (
              <label
                key={key}
                className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition-colors duration-200 ease-soft ${
                  dataset === key ? 'border-brand-500 bg-brand-50' : 'border-line hover:bg-canvas'
                }`}
              >
                <input
                  type="radio"
                  name={`${groupId}-dataset`}
                  value={key}
                  checked={dataset === key}
                  onChange={() => setDataset(key)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-semibold">
                    {t(`pages.reports.export.datasets.${key}.title`)}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {t(`pages.reports.export.datasets.${key}.hint`)}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-wrap items-end gap-4">
          <fieldset>
            <legend className="mb-2 text-sm font-semibold">
              {t('pages.reports.export.format')}
            </legend>
            <div className="flex gap-2">
              {REPORT_FORMATS.map((key) => (
                <label
                  key={key}
                  className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                    format === key ? 'border-brand-500 bg-brand-50' : 'border-line'
                  }`}
                >
                  <input
                    type="radio"
                    name={`${groupId}-format`}
                    value={key}
                    checked={format === key}
                    onChange={() => setFormat(key)}
                  />
                  {t(`pages.reports.export.formats.${key}`)}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block text-sm font-semibold">
            {t('pages.reports.export.language')}
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Locale)}
              className="mt-2 block min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm font-normal"
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {t(`pages.reports.export.languages.${l}`)}
                </option>
              ))}
            </select>
          </label>
          <Button icon={Download} loading={run.isPending} onClick={() => run.mutate()}>
            {t('pages.reports.export.download')}
          </Button>
        </div>
        <FormAlert message={error} />
      </div>
    </Section>
  )
}

function OverviewTab({ code }: { code: string }) {
  const { t } = useTranslation()
  const can = useCan(code)
  const filters = useUrlFilters(['cycle', 'run', 'module', 'from', 'to'] as const)
  const { cycle, run, module, from, to } = filters.values
  const cycles = useCycles(code)
  const runs = useRuns(code)
  const modules = useModules(code)
  const rangeInvalid = Boolean(from && to && from > to)
  const filter: ReportFilter = {
    cycle_id: cycle || undefined,
    run_id: run || undefined,
    module_id: module || undefined,
    from: from || undefined,
    to: rangeInvalid ? undefined : to || undefined,
  }
  const overview = useReportOverview(code, filter)
  const runOptions = (runs.data ?? [])
    .filter((r) => !cycle || r.cycle?.id === cycle)
    .map((r) => ({ value: r.id, label: `${r.run_code} - ${r.name}` }))

  return (
    <div className="space-y-6">
      <div>
        <FilterBar onReset={filters.active ? filters.reset : undefined}>
          <SelectFilter
            label={t('pages.reports.filters.cycle')}
            value={cycle}
            allLabel={t('pages.reports.filters.allCycles')}
            onChange={(value) => filters.setFilter('cycle', value)}
            options={(cycles.data ?? []).map((c) => ({
              value: c.id,
              label: `${c.cycle_code} - ${c.title}`,
            }))}
          />
          <SelectFilter
            label={t('filters.run')}
            value={run}
            allLabel={t('filters.allRuns')}
            onChange={(value) => filters.setFilter('run', value)}
            options={runOptions}
          />
          <SelectFilter
            label={t('pages.reports.filters.module')}
            value={module}
            allLabel={t('pages.reports.filters.allModules')}
            onChange={(value) => filters.setFilter('module', value)}
            options={(modules.data ?? []).map((m) => ({
              value: m.id,
              label: `${m.module_code} - ${m.name}`,
            }))}
          />
          <DateFilter
            label={t('pages.reports.filters.from')}
            value={from}
            max={to}
            onChange={(value) => filters.setFilter('from', value)}
          />
          <DateFilter
            label={t('pages.reports.filters.to')}
            value={to}
            min={from}
            onChange={(value) => filters.setFilter('to', value)}
          />
        </FilterBar>
        {rangeInvalid && <FormAlert message={t('pages.reports.filters.rangeInvalid')} />}
      </div>

      <details className="rounded-xl border border-info/20 bg-info-soft p-4 text-sm text-ink">
        <summary className="flex cursor-pointer items-center gap-2 font-semibold text-info">
          <Info aria-hidden="true" className="size-4 shrink-0" />
          {t('pages.reports.howTitle')}
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-6 text-ink-muted">
          <li>{t('pages.reports.how1')}</li>
          <li>{t('pages.reports.how2')}</li>
          <li>{t('pages.reports.how3')}</li>
        </ul>
      </details>

      {overview.isPending && <LoadingState rows={6} />}
      {overview.isError && (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      )}
      {overview.data && (
        <div
          className={`transition-opacity ${overview.isPlaceholderData ? 'opacity-60' : ''}`}
          aria-busy={overview.isFetching}
        >
          <OverviewBody code={code} data={overview.data} />
        </div>
      )}

      {can('report.export') ? (
        <ExportPanel code={code} filter={filter} />
      ) : (
        <p className="text-sm text-ink-muted">{t('pages.reports.export.leadsOnly')}</p>
      )}
    </div>
  )
}

function ActivityTab({ code }: { code: string }) {
  const { t } = useTranslation()
  const filters = useUrlFilters(['entity', 'action', 'actor', 'afrom', 'ato'] as const)
  const { entity, action, actor, afrom, ato } = filters.values
  const members = useMembers(code)
  const rangeInvalid = Boolean(afrom && ato && afrom > ato)
  const logs = useAuditLogs(code, {
    entity_type: entity || undefined,
    action: action || undefined,
    actor_id: actor || undefined,
    from: afrom || undefined,
    to: rangeInvalid ? undefined : ato || undefined,
    page: filters.page,
  })
  const { entityLabel, actionLabel } = useAuditLabels()

  return (
    <Section
      title={t('pages.reports.activity.heading')}
      description={t('pages.reports.activity.description')}
    >
      <FilterBar
        onReset={
          filters.active
            ? () => {
                // Only this tab's filters; the tab itself stays selected.
                for (const key of ['entity', 'action', 'actor', 'afrom', 'ato'] as const) {
                  filters.setFilter(key, '')
                }
              }
            : undefined
        }
      >
        <SelectFilter
          label={t('pages.reports.activity.entity')}
          value={entity}
          onChange={(value) => filters.setFilter('entity', value)}
          options={PROJECT_AUDIT_ENTITIES.map((value) => ({ value, label: entityLabel(value) }))}
        />
        <SelectFilter
          label={t('pages.reports.activity.action')}
          value={action}
          onChange={(value) => filters.setFilter('action', value)}
          options={AUDIT_ACTIONS.map((value) => ({ value, label: actionLabel(value) }))}
        />
        <SelectFilter
          label={t('pages.reports.activity.actor')}
          value={actor}
          onChange={(value) => filters.setFilter('actor', value)}
          options={(members.data ?? []).map((m) => ({
            value: m.user.id,
            label: m.user.display_name,
          }))}
        />
        <DateFilter
          label={t('pages.reports.filters.from')}
          value={afrom}
          max={ato}
          onChange={(value) => filters.setFilter('afrom', value)}
        />
        <DateFilter
          label={t('pages.reports.filters.to')}
          value={ato}
          min={afrom}
          onChange={(value) => filters.setFilter('ato', value)}
        />
      </FilterBar>
      {rangeInvalid && <FormAlert message={t('pages.reports.filters.rangeInvalid')} />}

      {logs.isPending && <LoadingState rows={5} />}
      {logs.isError && <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />}
      {logs.isSuccess && logs.data.total === 0 && (
        <EmptyState description={t('pages.reports.activity.empty')} />
      )}
      {logs.isSuccess && logs.data.total > 0 && (
        <>
          <AuditEntryList entries={logs.data.data} busy={logs.isFetching} />
          <Pagination
            page={logs.data.page}
            pageSize={logs.data.page_size}
            total={logs.data.total}
            onPageChange={filters.setPage}
          />
        </>
      )}
    </Section>
  )
}

export function ReportsPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const can = useCan(code)
  const tabs = useUrlFilters(['tab'] as const)
  const showActivity = can('audit.read')
  const active = showActivity && tabs.values.tab === 'activity' ? 'activity' : 'overview'

  return (
    <>
      <PageHeader
        title={t('pages.reports.title')}
        subtitle={t('pages.reports.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('pages.reports.title') }]}
      />
      {showActivity ? (
        <Tabs
          label={t('pages.reports.title')}
          active={active}
          onChange={(id) => tabs.setFilter('tab', id === 'activity' ? 'activity' : '')}
          tabs={[
            {
              id: 'overview',
              label: t('pages.reports.tabs.overview'),
              content: <OverviewTab code={code} />,
            },
            {
              id: 'activity',
              label: t('pages.reports.tabs.activity'),
              content: <ActivityTab code={code} />,
            },
          ]}
        />
      ) : (
        <OverviewTab code={code} />
      )}
    </>
  )
}
