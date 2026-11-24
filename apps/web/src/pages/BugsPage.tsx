import {
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  type BulkResult,
  type DefectListItem,
  type DefectStatus,
} from '@testboard/shared'
import { ExternalLink, Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { BugPublicTab } from '../components/bugs/BugPublicTab'
import { PublicReportsTab } from '../components/bugs/PublicReportsTab'
import { Badge } from '../components/ui/Badge'
import { Tabs } from '../components/ui/Tabs'
import { useBugReporting, usePublicReports } from '../hooks/structure-queries'
import { BugBulkActions } from '../components/bulk/BugBulkActions'
import { BulkBar, BulkReport } from '../components/ui/BulkBar'
import {
  DefectPriorityBadge,
  DefectStatusBadge,
  SeverityBadge,
} from '../components/status/StatusBadges'
import { ButtonLink } from '../components/ui/Button'
import { ChipFilter } from '../components/ui/ChipFilter'
import { FilterBar, SearchField, SelectFilter } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useCan } from '../hooks/permissions'
import { useCurrentUser, useCycles, useDefects, useMembers } from '../hooks/queries'
import { useRowSelection } from '../hooks/use-row-selection'
import { oneOf, projectPath, useProjectCode, useUrlFilters } from '../hooks/route-state'
import { formatShortDateTime, toLocale } from '../lib/format'

const FILTER_KEYS = ['q', 'status', 'severity', 'priority', 'assignee', 'cycle'] as const
const STATUS_FILTERS: readonly (DefectStatus | 'open')[] = ['open', ...DEFECT_STATUSES]
/** The statuses people look for most, one tap away (owner, 2026-11-24: simpler filters). */
const QUICK_STATUSES: readonly (DefectStatus | 'open')[] = ['open', 'READY_FOR_RETEST', 'CLOSED']

/** The problem list of the project with its filters and bulk actions. */
function BugList() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const { values, page, setFilter, setPage, reset, active } = useUrlFilters(FILTER_KEYS)
  const can = useCan(code)
  const me = useCurrentUser()
  const members = useMembers(code)
  const cycles = useCycles(code)
  const [report, setReport] = useState<BulkResult | null>(null)
  const assignee = values.assignee === 'me' ? me.data?.id : values.assignee || undefined
  const defects = useDefects(code, {
    q: values.q || undefined,
    status: oneOf(STATUS_FILTERS, values.status),
    severity: oneOf(DEFECT_SEVERITIES, values.severity),
    priority: oneOf(DEFECT_PRIORITIES, values.priority),
    assigned_to: assignee,
    cycle: values.cycle || undefined,
    page,
  })
  // Search and the status chips are always in view; the rest sit behind "Saring lebih
  // lanjut" and count here while in use (a quick status is already visible as a chip).
  const quickStatus = QUICK_STATUSES.includes(values.status as DefectStatus | 'open')
  const moreActive = [
    quickStatus ? '' : values.status,
    values.severity,
    values.priority,
    values.assignee,
    values.cycle,
  ].filter(Boolean).length
  const canBulk = can('defect.update')
  const selected = useRowSelection<DefectListItem>(
    defects.data?.data ?? [],
    (row) => row.id,
    {
      row: (row) => t('bulk.selectRow', { code: row.bug_code }),
      all: t('bulk.selectPage'),
    },
    JSON.stringify(values),
  )

  return (
    <>
      <FilterBar
        onReset={active ? reset : undefined}
        moreActive={moreActive}
        more={
          <>
            <SelectFilter
              label={t('filters.status')}
              value={values.status}
              onChange={(value) => setFilter('status', value)}
              options={STATUS_FILTERS.map((s) => ({
                value: s,
                label: s === 'open' ? t('filters.openOnly') : t(`codes.defectStatus.${s}`),
              }))}
            />
            <SelectFilter
              label={t('filters.severity')}
              value={values.severity}
              onChange={(value) => setFilter('severity', value)}
              options={DEFECT_SEVERITIES.map((s) => ({
                value: s,
                label: t(`codes.severity.${s}`),
              }))}
            />
            <SelectFilter
              label={t('filters.priority')}
              value={values.priority}
              onChange={(value) => setFilter('priority', value)}
              options={DEFECT_PRIORITIES.map((p) => ({
                value: p,
                label: t(`codes.defectPriority.${p}`),
              }))}
            />
            <SelectFilter
              label={t('pages.bugs.assigneeFilter')}
              value={values.assignee}
              onChange={(value) => setFilter('assignee', value)}
              options={[
                ...(me.data ? [{ value: 'me', label: t('pages.bugs.mine') }] : []),
                { value: 'none', label: t('pages.bugs.unassigned') },
                ...(members.data ?? [])
                  .filter((m) => m.role_code !== 'VIEWER')
                  .map((m) => ({ value: m.user.id, label: m.user.display_name })),
              ]}
            />
            <SelectFilter
              label={t('filters.cycle')}
              value={values.cycle}
              onChange={(value) => setFilter('cycle', value)}
              options={[
                { value: 'none', label: t('pages.bugs.noCycle') },
                ...(cycles.data ?? []).map((cy) => ({
                  value: cy.id,
                  label: `${cy.cycle_code} - ${cy.title}`,
                })),
              ]}
            />
          </>
        }
      >
        <SearchField
          label={t('filters.keyword')}
          placeholder={t('pages.bugs.searchPlaceholder')}
          value={values.q}
          onSearch={(value) => setFilter('q', value)}
        />
      </FilterBar>
      <div className="mb-4">
        <ChipFilter
          label={t('filters.status')}
          value={
            QUICK_STATUSES.includes(values.status as DefectStatus | 'open') ? values.status : ''
          }
          onChange={(value) => setFilter('status', value)}
          options={QUICK_STATUSES.map((s) => ({
            value: s,
            label: s === 'open' ? t('filters.openOnly') : t(`codes.defectStatus.${s}`),
          }))}
        />
      </div>

      <Section>
        {defects.isPending && <LoadingState />}
        {defects.isError && (
          <ErrorState error={defects.error} onRetry={() => void defects.refetch()} />
        )}
        {defects.isSuccess && defects.data.total === 0 && (
          <EmptyState
            filtered={active}
            description={active ? t('pages.bugs.emptyFiltered') : t('pages.bugs.empty')}
          />
        )}
        {report && <BulkReport result={report} onClose={() => setReport(null)} />}
        {canBulk && (
          <BulkBar count={selected.ids.length} onClear={selected.clear}>
            <BugBulkActions
              code={code}
              ids={selected.ids}
              isLead={can('run.assign')}
              onDone={(result) => {
                setReport(result)
                selected.clear()
              }}
            />
          </BulkBar>
        )}
        {defects.isSuccess && defects.data.total > 0 && (
          <div className={defects.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <ResponsiveTable<DefectListItem>
              selection={canBulk ? selected.selection : undefined}
              caption={t('pages.bugs.title')}
              rows={defects.data.data}
              rowKey={(row) => row.id}
              rowLink={(row) => projectPath(code, `bugs/${row.id}`)}
              primary={(row) => ({ code: row.bug_code, title: row.title })}
              cardFields={(row) => (
                <>
                  <DefectStatusBadge status={row.status_code} />
                  <SeverityBadge severity={row.severity_code} />
                </>
              )}
              columns={[
                {
                  key: 'code',
                  header: t('fields.bugCode'),
                  render: (row) => row.bug_code,
                  className: 'whitespace-nowrap',
                },
                { key: 'title', header: t('fields.title'), render: (row) => row.title },
                {
                  key: 'status',
                  header: t('fields.status'),
                  render: (row) => <DefectStatusBadge status={row.status_code} />,
                },
                {
                  key: 'severity',
                  header: t('fields.severity'),
                  render: (row) => <SeverityBadge severity={row.severity_code} />,
                },
                {
                  key: 'priority',
                  header: t('fields.priority'),
                  render: (row) => <DefectPriorityBadge priority={row.priority_code} />,
                  hideBelow: 'lg',
                },
                {
                  key: 'cycle',
                  header: t('fields.cycle'),
                  render: (row) => row.cycle?.cycle_code ?? t('fields.none'),
                  className: 'whitespace-nowrap',
                  hideBelow: 'xl',
                },
                {
                  key: 'assignee',
                  header: t('fields.assignee'),
                  render: (row) => row.assigned_to?.display_name ?? t('fields.none'),
                  hideBelow: 'xl',
                },
                {
                  key: 'updated',
                  header: t('fields.updatedAt'),
                  render: (row) => (
                    <span className="text-ink-muted tabular-nums">
                      {formatShortDateTime(row.updated_at, locale)}
                    </span>
                  ),
                  className: 'whitespace-nowrap',
                  hideBelow: 'xl',
                },
              ]}
            />
            <Pagination
              page={defects.data.page}
              pageSize={defects.data.page_size}
              total={defects.data.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </Section>
    </>
  )
}

/**
 * Bug Reporting (ADR 0019): one problem list per project, filled during UAT and, after
 * go-live, by the public. An Admin also reviews public reports and decides what the public
 * page shows, with its own ON/OFF switch.
 */
export function BugsPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const can = useCan(code)
  const manager = can('run.write')
  const [params, setParams] = useSearchParams()
  const reports = usePublicReports(code, manager)
  const settings = useBugReporting(code, manager)
  const tabs = [
    { id: 'daftar', label: t('bugReporting.tabs.list'), content: <BugList /> },
    ...(manager
      ? [
          {
            id: 'laporan',
            label: t('bugReporting.tabs.reports'),
            count: reports.data?.length ?? 0,
            content: <PublicReportsTab code={code} />,
          },
          {
            id: 'publik',
            label: t('bugReporting.tabs.public'),
            content: settings.isSuccess ? (
              <BugPublicTab
                key={JSON.stringify(settings.data)}
                code={code}
                settings={settings.data}
              />
            ) : settings.isError ? (
              <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
            ) : (
              <LoadingState rows={4} />
            ),
          },
        ]
      : []),
  ]
  const active = params.get('tab') ?? 'daftar'
  const isPublic = settings.data?.is_public ?? false
  return (
    <>
      <PageHeader
        title={t('bugReporting.title')}
        subtitle={t('bugReporting.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('bugReporting.title') }]}
        badges={
          manager && settings.isSuccess ? (
            <Badge
              tone={isPublic ? 'success' : 'muted'}
              label={isPublic ? t('bugReporting.publicOn') : t('bugReporting.publicOff')}
            />
          ) : undefined
        }
        actions={
          <>
            {isPublic && (
              <Link
                to={`/publik/masalah/${encodeURIComponent(code)}`}
                target="_blank"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-neutral-soft"
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                {t('workshop.publicPage')}
              </Link>
            )}
            {can('defect.create') && (
              <ButtonLink to={projectPath(code, 'bugs/new')} icon={Plus}>
                {t('pages.bugs.newBug')}
              </ButtonLink>
            )}
          </>
        }
      />
      {tabs.length === 1 ? (
        <BugList />
      ) : (
        <Tabs
          label={t('bugReporting.tabsLabel')}
          tabs={tabs}
          active={tabs.some((tab) => tab.id === active) ? active : 'daftar'}
          onChange={(id) => setParams({ tab: id }, { replace: true })}
        />
      )}
    </>
  )
}
