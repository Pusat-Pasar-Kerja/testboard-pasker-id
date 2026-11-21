import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  TEST_TYPES,
  type BulkResult,
  type TestCaseListItem,
} from '@testboard/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CaseBulkActions } from '../components/bulk/CaseBulkActions'
import { BulkBar, BulkReport } from '../components/ui/BulkBar'
import { ButtonLink } from '../components/ui/Button'
import { useCan } from '../hooks/permissions'
import { CaseStatusBadge } from '../components/status/StatusBadges'
import { FilterBar, SearchField, SelectFilter } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useModules, useTestCases } from '../hooks/queries'
import { useRowSelection } from '../hooks/use-row-selection'
import { oneOf, projectPath, useProjectCode, useUrlFilters } from '../hooks/route-state'
import { formatShortDateTime, toLocale } from '../lib/format'

const FILTER_KEYS = ['q', 'module', 'priority', 'type', 'status'] as const

export function TestCasesPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const modules = useModules(code)
  const can = useCan(code)
  const { values, page, setFilter, setPage, reset, active } = useUrlFilters(FILTER_KEYS)
  const cases = useTestCases(code, {
    q: values.q || undefined,
    module: values.module || undefined,
    priority: oneOf(TEST_CASE_PRIORITIES, values.priority),
    type: oneOf(TEST_TYPES, values.type),
    status: oneOf(TEST_CASE_STATUSES, values.status),
    page,
  })
  const [report, setReport] = useState<BulkResult | null>(null)
  const canBulk = can('case.write')
  const selected = useRowSelection<TestCaseListItem>(
    cases.data?.data ?? [],
    (row) => row.id,
    {
      row: (row) => t('bulk.selectRow', { code: row.case_code }),
      all: t('bulk.selectPage'),
    },
    JSON.stringify(values),
  )

  return (
    <>
      <PageHeader
        title={t('pages.cases.title')}
        subtitle={t('pages.cases.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('pages.cases.title') }]}
        actions={
          can('case.write') && (
            <ButtonLink to={projectPath(code, 'test-cases/new')} icon={Plus}>
              {t('pages.cases.create')}
            </ButtonLink>
          )
        }
      />

      <FilterBar onReset={active ? reset : undefined}>
        <SearchField
          label={t('filters.keyword')}
          placeholder={t('pages.cases.searchPlaceholder')}
          value={values.q}
          onSearch={(value) => setFilter('q', value)}
        />
        <SelectFilter
          label={t('filters.module')}
          value={values.module}
          onChange={(value) => setFilter('module', value)}
          options={(modules.data ?? []).map((m) => ({
            value: m.module_code,
            label: `${m.module_code} - ${m.name}`,
          }))}
        />
        <SelectFilter
          label={t('filters.priority')}
          value={values.priority}
          onChange={(value) => setFilter('priority', value)}
          options={TEST_CASE_PRIORITIES.map((p) => ({
            value: p,
            label: t(`codes.casePriority.${p}`),
          }))}
        />
        <SelectFilter
          label={t('filters.type')}
          value={values.type}
          onChange={(value) => setFilter('type', value)}
          options={TEST_TYPES.map((type) => ({ value: type, label: t(`codes.testType.${type}`) }))}
        />
        <SelectFilter
          label={t('filters.status')}
          value={values.status}
          onChange={(value) => setFilter('status', value)}
          options={TEST_CASE_STATUSES.map((s) => ({ value: s, label: t(`codes.caseStatus.${s}`) }))}
        />
      </FilterBar>

      <Section>
        {cases.isPending && <LoadingState />}
        {cases.isError && <ErrorState error={cases.error} onRetry={() => void cases.refetch()} />}
        {cases.isSuccess && cases.data.total === 0 && (
          <EmptyState
            filtered={active}
            description={active ? t('pages.cases.emptyFiltered') : t('pages.cases.empty')}
          />
        )}
        {report && <BulkReport result={report} onClose={() => setReport(null)} />}
        {canBulk && (
          <BulkBar count={selected.ids.length} onClear={selected.clear}>
            <CaseBulkActions
              code={code}
              ids={selected.ids}
              onDone={(result) => {
                setReport(result)
                selected.clear()
              }}
            />
          </BulkBar>
        )}
        {cases.isSuccess && cases.data.total > 0 && (
          <div className={cases.isPlaceholderData ? 'opacity-60 transition-opacity' : undefined}>
            <ResponsiveTable<TestCaseListItem>
              selection={canBulk ? selected.selection : undefined}
              caption={t('pages.cases.title')}
              rows={cases.data.data}
              rowKey={(row) => row.id}
              rowLink={(row) => projectPath(code, `test-cases/${row.id}`)}
              primary={(row) => ({ code: row.case_code, title: row.title })}
              cardFields={(row) => (
                <>
                  <CaseStatusBadge status={row.case_status} />
                  <span className="text-xs text-ink-muted">
                    {row.module?.module_code} · {t(`codes.casePriority.${row.priority_code}`)} ·{' '}
                    {t(`codes.testType.${row.test_type_code}`)}
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
                { key: 'title', header: t('fields.title'), render: (row) => row.title },
                {
                  key: 'module',
                  header: t('fields.module'),
                  render: (row) => row.module?.module_code ?? t('fields.none'),
                },
                {
                  key: 'priority',
                  header: t('fields.priority'),
                  render: (row) => t(`codes.casePriority.${row.priority_code}`),
                  className: 'whitespace-nowrap',
                  hideBelow: 'lg',
                },
                {
                  key: 'type',
                  header: t('fields.type'),
                  render: (row) => t(`codes.testType.${row.test_type_code}`),
                  hideBelow: 'lg',
                },
                {
                  key: 'status',
                  header: t('fields.status'),
                  render: (row) => <CaseStatusBadge status={row.case_status} />,
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
              page={cases.data.page}
              pageSize={cases.data.page_size}
              total={cases.data.total}
              onPageChange={setPage}
            />
          </div>
        )}
      </Section>
    </>
  )
}
