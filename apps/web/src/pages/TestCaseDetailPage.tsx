import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { AttachmentsPanel } from '../components/evidence/AttachmentsPanel'
import { CaseStatusBadge, ExecutionStatusBadge } from '../components/status/StatusBadges'
import { Badge } from '../components/ui/Badge'
import { PageHeader } from '../components/ui/PageHeader'
import { DescriptionList, Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { Tabs } from '../components/ui/Tabs'
import { useCan } from '../hooks/permissions'
import { useTestCase } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { formatDateTime, toLocale } from '../lib/format'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'
import { TestCaseActions } from './TestCaseActions'

export function TestCaseDetailPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const { caseId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const can = useCan(code)
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const testCase = useTestCase(code, caseId)
  const none = t('fields.none')

  if (testCase.isPending) return <LoadingState rows={6} />
  if (testCase.isError) {
    return testCase.error instanceof ApiClientError && testCase.error.status === 404 ? (
      <NotFoundPage reason="item" />
    ) : (
      <ErrorState error={testCase.error} onRetry={() => void testCase.refetch()} />
    )
  }
  const c = testCase.data

  return (
    <>
      <PageHeader
        title={c.title}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('pages.cases.title'), to: projectPath(code, 'test-cases') },
          { label: c.case_code },
        ]}
        badges={
          <>
            <span className="text-sm font-semibold text-brand-700">{c.case_code}</span>
            <CaseStatusBadge status={c.case_status} />
            <Badge tone="muted" label={`${t('fields.version')} ${c.current_version}`} />
          </>
        }
        actions={<TestCaseActions code={code} testCase={c} />}
      />

      {c.case_status === 'ARCHIVED' && (
        <p className="mb-4 rounded-lg bg-neutral-soft p-3 text-sm text-ink-muted">
          {t('pages.caseDetail.archivedNotice')}
        </p>
      )}

      <Tabs
        label={c.case_code}
        active={params.get('tab') ?? 'overview'}
        onChange={(tab) => setParams(tab === 'overview' ? {} : { tab }, { replace: true })}
        tabs={[
          {
            id: 'overview',
            label: t('pages.caseDetail.tabOverview'),
            content: (
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className="space-y-6">
                  <Section title={t('fields.preconditions')} headingLevel={3}>
                    <p className="text-sm whitespace-pre-line">{c.preconditions ?? none}</p>
                  </Section>
                  <Section
                    title={t('fields.steps')}
                    description={t('pages.caseDetail.stepsPreserved')}
                    headingLevel={3}
                  >
                    <ol className="space-y-2">
                      {c.steps.map((step) => (
                        <li key={step.step_number} className="flex gap-3 text-sm">
                          <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                            {step.step_number}
                          </span>
                          <span className="pt-0.5">{step.instruction}</span>
                        </li>
                      ))}
                    </ol>
                  </Section>
                  <Section title={t('fields.expectedResult')} headingLevel={3}>
                    <p className="text-sm whitespace-pre-line">{c.expected_result ?? none}</p>
                  </Section>
                </div>
                <Section headingLevel={3}>
                  <DescriptionList
                    items={[
                      {
                        label: t('fields.module'),
                        value: c.module ? `${c.module.module_code} - ${c.module.name}` : none,
                      },
                      { label: t('fields.suite'), value: c.suite_name ?? none },
                      { label: t('fields.category'), value: c.category ?? none },
                      { label: t('fields.actor'), value: c.actor_label ?? none },
                      {
                        label: t('fields.priority'),
                        value: t(`codes.casePriority.${c.priority_code}`),
                      },
                      { label: t('fields.type'), value: t(`codes.testType.${c.test_type_code}`) },
                      { label: t('fields.requirementRefs'), value: c.requirement_refs ?? none },
                      { label: t('fields.source'), value: t(`codes.caseSource.${c.source_kind}`) },
                      {
                        label: t('fields.contentLanguage'),
                        value: t(`language.${c.source_locale}`),
                      },
                      { label: t('fields.updatedAt'), value: formatDateTime(c.updated_at, locale) },
                    ]}
                  />
                </Section>
              </div>
            ),
          },
          {
            id: 'runs',
            label: t('pages.caseDetail.tabRuns'),
            count: c.used_in_runs.length,
            content:
              c.used_in_runs.length === 0 ? (
                <EmptyState description={t('pages.caseDetail.notUsed')} />
              ) : (
                <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                  {c.used_in_runs.map((usage) => (
                    <li key={usage.run_case_id}>
                      <Link
                        to={projectPath(code, `runs/${usage.run_id}`)}
                        className="flex flex-col gap-2 p-4 hover:bg-brand-50/50 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <span>
                          <span className="block text-xs font-semibold text-brand-700">
                            {usage.run_code}
                          </span>
                          <span className="block text-sm">{usage.run_name}</span>
                        </span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                          <ExecutionStatusBadge status={usage.latest_status} />
                          {t('fields.version')} {usage.case_version} · {t('fields.attempts')}{' '}
                          {usage.attempts}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ),
          },
          {
            id: 'revisions',
            label: t('pages.caseDetail.tabRevisions'),
            count: c.revisions.length,
            content:
              c.revisions.length === 0 ? (
                <EmptyState description={t('pages.caseDetail.noRevisions')} />
              ) : (
                <ol className="space-y-3">
                  {c.revisions.map((revision) => (
                    <li
                      key={revision.revision_number}
                      className="rounded-xl border border-line bg-surface p-4"
                    >
                      <p className="text-sm font-semibold">
                        {t('pages.caseDetail.revision', { n: revision.revision_number })}
                      </p>
                      <p className="mt-1 text-sm">{revision.change_reason ?? none}</p>
                      <p className="mt-1 text-xs text-ink-muted">
                        {revision.changed_by?.display_name ?? none} ·{' '}
                        {formatDateTime(revision.changed_at, locale)}
                      </p>
                    </li>
                  ))}
                </ol>
              ),
          },
          {
            id: 'evidence',
            label: t('pages.caseDetail.files'),
            count: c.files.length,
            content: (
              <Section headingLevel={3}>
                <AttachmentsPanel
                  projectCode={code}
                  files={c.files}
                  canAttach={can('case.write')}
                  canDetach={() => can('case.write')}
                  onAttach={async (refs) => {
                    await ds.attachCaseFiles(code, c.id, refs)
                    await queryClient.invalidateQueries({ queryKey: ['test-case', code, c.id] })
                  }}
                  onDetach={async (fileId) => {
                    await ds.detachCaseFile(code, c.id, fileId)
                    await queryClient.invalidateQueries({ queryKey: ['test-case', code, c.id] })
                  }}
                />
              </Section>
            ),
          },
        ]}
      />
    </>
  )
}
