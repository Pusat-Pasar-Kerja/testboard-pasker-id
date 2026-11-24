import {
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  TEST_TYPES,
  type BulkResult,
  type TestCaseListItem,
} from '@testboard/shared'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useCan } from '../../hooks/permissions'
import { useCycles, useModules, useTestCases } from '../../hooks/queries'
import { oneOf, projectPath, useUrlFilters } from '../../hooks/route-state'
import { useRowSelection } from '../../hooks/use-row-selection'
import { formatShortDateTime, toLocale } from '../../lib/format'
import { CaseBulkActions } from '../bulk/CaseBulkActions'
import { CaseStatusBadge } from '../status/StatusBadges'
import { BulkBar, BulkReport } from '../ui/BulkBar'
import { ChipFilter } from '../ui/ChipFilter'
import { FilterBar, SearchField, SelectFilter } from '../ui/Filters'
import { Pagination } from '../ui/Pagination'
import { ResponsiveTable } from '../ui/ResponsiveTable'
import { Section } from '../ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../ui/States'

const FILTER_KEYS = ['q', 'cycle', 'module', 'priority', 'type', 'status'] as const

/**
 * Scenarios as a list, with search, simple filters and bulk actions (Salin / Pindahkan ke
 * Fase, Siap, Draf, ...). Inside a feature folder the Fase and the feature are fixed; on
 * "Semua skenario" they are filters (ADR 0019).
 */
export function ScenarioList({
  code,
  cycle,
  module,
  emptyText,
  emptyAction,
}: {
  code: string
  /** Fixed Fase id ('none' = not in a Fase yet). */
  cycle?: string
  /** Fixed feature code. */
  module?: string
  emptyText?: string
  emptyAction?: ReactNode
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const modules = useModules(code)
  const cycles = useCycles(code)
  const can = useCan(code)
  const { values, page, setFilter, setPage, reset, active } = useUrlFilters(FILTER_KEYS)
  const fixedCycle = cycle !== undefined
  const fixedModule = module !== undefined
  const cases = useTestCases(code, {
    q: values.q || undefined,
    cycle: cycle ?? (values.cycle || undefined),
    module: module ?? (values.module || undefined),
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
      <FilterBar onReset={active ? reset : undefined}>
        <SearchField
          label={t('filters.keyword')}
          placeholder={t('pages.cases.searchPlaceholder')}
          value={values.q}
          onSearch={(value) => setFilter('q', value)}
        />
        {!fixedCycle && (
          <SelectFilter
            label={t('filters.phase')}
            value={values.cycle}
            onChange={(value) => setFilter('cycle', value)}
            options={[
              ...(cycles.data ?? []).map((c) => ({
                value: c.id,
                label: `${c.cycle_code} - ${c.title}`,
              })),
              { value: 'none', label: t('phases.unassigned') },
            ]}
          />
        )}
        {!fixedModule && (
          <SelectFilter
            label={t('filters.module')}
            value={values.module}
            onChange={(value) => setFilter('module', value)}
            options={(modules.data ?? []).map((m) => ({
              value: m.module_code,
              label: m.name,
            }))}
          />
        )}
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
      </FilterBar>
      <div className="mb-4">
        <ChipFilter
          label={t('filters.status')}
          value={values.status}
          onChange={(value) => setFilter('status', value)}
          options={TEST_CASE_STATUSES.map((s) => ({ value: s, label: t(`codes.caseStatus.${s}`) }))}
        />
      </div>

      <Section>
        {cases.isPending && <LoadingState />}
        {cases.isError && <ErrorState error={cases.error} onRetry={() => void cases.refetch()} />}
        {cases.isSuccess && cases.data.total === 0 && (
          <EmptyState
            filtered={active}
            description={
              active ? t('pages.cases.emptyFiltered') : (emptyText ?? t('pages.cases.empty'))
            }
            action={active ? undefined : emptyAction}
          />
        )}
        {report && <BulkReport result={report} onClose={() => setReport(null)} />}
        {canBulk && (
          <BulkBar count={selected.ids.length} onClear={selected.clear}>
            <CaseBulkActions
              code={code}
              ids={selected.ids}
              rows={selected.rows}
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
                    {[
                      fixedCycle ? null : (row.cycle?.title ?? t('phases.unassigned')),
                      fixedModule ? null : row.module?.name,
                      t(`codes.casePriority.${row.priority_code}`),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
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
                ...(fixedCycle
                  ? []
                  : [
                      {
                        key: 'phase',
                        header: t('fields.phase'),
                        render: (row: TestCaseListItem) =>
                          row.cycle?.title ?? (
                            <span className="text-ink-muted">{t('phases.unassigned')}</span>
                          ),
                        hideBelow: 'lg' as const,
                      },
                    ]),
                ...(fixedModule
                  ? []
                  : [
                      {
                        key: 'module',
                        header: t('fields.feature'),
                        render: (row: TestCaseListItem) => row.module?.name ?? t('fields.none'),
                      },
                    ]),
                {
                  key: 'priority',
                  header: t('fields.priority'),
                  render: (row) => t(`codes.casePriority.${row.priority_code}`),
                  className: 'whitespace-nowrap',
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
