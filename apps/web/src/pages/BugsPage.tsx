import {
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  type DefectListItem,
  type DefectStatus,
} from '@testboard/shared'
import { useTranslation } from 'react-i18next'
import {
  DefectPriorityBadge,
  DefectStatusBadge,
  SeverityBadge,
} from '../components/status/StatusBadges'
import { FilterBar, SearchField, SelectFilter } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useDefects } from '../hooks/queries'
import { oneOf, projectPath, useProjectCode, useUrlFilters } from '../hooks/route-state'
import { formatShortDateTime, toLocale } from '../lib/format'

const FILTER_KEYS = ['q', 'status', 'severity', 'priority'] as const
const STATUS_FILTERS: readonly (DefectStatus | 'open')[] = ['open', ...DEFECT_STATUSES]

export function BugsPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const { values, page, setFilter, setPage, reset, active } = useUrlFilters(FILTER_KEYS)
  const defects = useDefects(code, {
    q: values.q || undefined,
    status: oneOf(STATUS_FILTERS, values.status),
    severity: oneOf(DEFECT_SEVERITIES, values.severity),
    priority: oneOf(DEFECT_PRIORITIES, values.priority),
    page,
  })

  return (
    <>
      <PageHeader
        title={t('pages.bugs.title')}
        subtitle={t('pages.bugs.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('pages.bugs.title') }]}
      />

      <FilterBar onReset={active ? reset : undefined}>
        <SearchField
          label={t('filters.keyword')}
          placeholder={t('pages.bugs.searchPlaceholder')}
          value={values.q}
          onSearch={(value) => setFilter('q', value)}
        />
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
          options={DEFECT_SEVERITIES.map((s) => ({ value: s, label: t(`codes.severity.${s}`) }))}
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
      </FilterBar>

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
        {defects.isSuccess && defects.data.total > 0 && (
          <div className={defects.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <ResponsiveTable<DefectListItem>
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
