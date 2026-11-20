import { MessageSquare } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import {
  DefectPriorityBadge,
  DefectStatusBadge,
  ExecutionStatusBadge,
  SeverityBadge,
} from '../components/status/StatusBadges'
import { PageHeader } from '../components/ui/PageHeader'
import { DescriptionList, Section } from '../components/ui/Section'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useDefect } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { formatDateTime, formatShortDateTime, toLocale } from '../lib/format'
import { ApiClientError } from '../services/api-client'
import { NotFoundPage } from './NotFoundPage'

export function BugDetailPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const { bugId = '' } = useParams()
  const defect = useDefect(code, bugId)
  const none = t('fields.none')

  if (defect.isPending) return <LoadingState rows={6} />
  if (defect.isError) {
    return defect.error instanceof ApiClientError && defect.error.status === 404 ? (
      <NotFoundPage reason="item" />
    ) : (
      <ErrorState error={defect.error} onRetry={() => void defect.refetch()} />
    )
  }
  const d = defect.data

  return (
    <>
      <PageHeader
        title={d.title}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('pages.bugs.title'), to: projectPath(code, 'bugs') },
          { label: d.bug_code },
        ]}
        badges={
          <>
            <span className="text-sm font-semibold text-brand-700">{d.bug_code}</span>
            <DefectStatusBadge status={d.status_code} />
            <SeverityBadge severity={d.severity_code} />
            <DefectPriorityBadge priority={d.priority_code} />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Section title={t('pages.bugDetail.details')}>
            <DescriptionList
              items={[
                { label: t('fields.description'), value: d.description ?? none, wide: true },
                {
                  label: t('fields.stepsToReproduce'),
                  value: d.steps_to_reproduce ?? none,
                  wide: true,
                },
                { label: t('fields.expectedBehavior'), value: d.expected_behavior ?? none },
                { label: t('fields.actualBehavior'), value: d.actual_behavior ?? none },
              ]}
            />
          </Section>

          <Section title={t('pages.bugDetail.linkedExecutions')}>
            {d.linked_executions.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('pages.bugDetail.noLinked')}</p>
            ) : (
              <ul className="divide-y divide-line">
                {d.linked_executions.map((link) => (
                  <li
                    key={link.execution_id}
                    className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm">
                      <Link
                        to={projectPath(code, `runs/${link.run_id}`)}
                        className="font-semibold text-brand-700 hover:underline"
                      >
                        {link.run_code}
                      </Link>{' '}
                      / {link.case_code} / {t('fields.attempt', { n: link.attempt_number })}
                    </span>
                    <span className="flex items-center gap-2">
                      <ExecutionStatusBadge status={link.result_status} />
                      {link.tested_at && (
                        <span className="text-xs text-ink-muted">
                          {formatShortDateTime(link.tested_at, locale)}
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('pages.bugDetail.comments')}>
            {d.comments.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('pages.bugDetail.noComments')}</p>
            ) : (
              <ul className="space-y-4">
                {d.comments.map((comment) => (
                  <li key={comment.id} className="flex gap-3">
                    <MessageSquare
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-ink-muted"
                    />
                    <div>
                      <p className="text-sm">
                        <strong className="font-semibold">
                          {comment.author?.display_name ?? none}
                        </strong>{' '}
                        <span className="text-xs text-ink-muted">
                          {formatDateTime(comment.created_at, locale)}
                        </span>
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-line">{comment.body}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section headingLevel={2}>
            <DescriptionList
              items={[
                { label: t('fields.reporter'), value: d.reported_by?.display_name ?? none },
                { label: t('fields.assignee'), value: d.assigned_to?.display_name ?? none },
                {
                  label: t('fields.module'),
                  value: d.module ? `${d.module.module_code} - ${d.module.name}` : none,
                },
                { label: t('fields.source'), value: t(`codes.defectSource.${d.source_kind}`) },
                { label: t('fields.environment'), value: d.environment_name ?? none },
                { label: t('fields.build'), value: d.build_version ?? none },
                { label: t('fields.browser'), value: d.browser_name ?? none },
                { label: t('fields.fixedIn'), value: d.fixed_in_version ?? none },
                { label: t('fields.createdAt'), value: formatDateTime(d.created_at, locale) },
                { label: t('fields.updatedAt'), value: formatDateTime(d.updated_at, locale) },
              ]}
            />
          </Section>

          <Section title={t('pages.bugDetail.history')}>
            <ol className="relative space-y-4 border-l border-line pl-5">
              {d.history.map((entry, index) => (
                <li key={index} className="relative">
                  <span
                    aria-hidden="true"
                    className="absolute top-1.5 -left-[25px] size-2.5 rounded-full bg-brand-600 ring-2 ring-surface"
                  />
                  <div className="flex flex-wrap items-center gap-1.5 text-sm">
                    {entry.from_status ? (
                      <>
                        <DefectStatusBadge status={entry.from_status} />
                        <span aria-hidden="true">→</span>
                        <DefectStatusBadge status={entry.to_status} />
                      </>
                    ) : (
                      <span>
                        {t('pages.bugDetail.created', {
                          to: t(`codes.defectStatus.${entry.to_status}`),
                        })}
                      </span>
                    )}
                  </div>
                  {entry.change_comment && <p className="mt-1 text-sm">{entry.change_comment}</p>}
                  <p className="mt-1 text-xs text-ink-muted">
                    {entry.changed_by?.display_name ?? none} ·{' '}
                    {formatDateTime(entry.changed_at, locale)}
                  </p>
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </>
  )
}
