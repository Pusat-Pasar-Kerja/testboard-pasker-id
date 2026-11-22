import { DEFECT_SEVERITIES, type DefectSeverity, type WorkshopInboxItem } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, ExternalLink, ThumbsUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useWorkshopInbox } from '../../../hooks/workshop-queries'
import { projectPath } from '../../../hooks/route-state'
import { apiErrorText } from '../../../lib/api-errors'
import { formatShortDateTime, toLocale } from '../../../lib/format'
import type { DefectReviewInput } from '@testboard/shared'
import { useDataSource } from '../../../services/use-data-source'
import { Button } from '../../ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../../ui/States'
import { useToast } from '../../ui/toast-context'

function InboxCard({
  code,
  cycleId,
  item,
  canReview,
}: {
  code: string
  cycleId: string
  item: WorkshopInboxItem
  canReview: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const review = useMutation({
    mutationFn: (input: DefectReviewInput) => ds.reviewWorkshopBug(code, cycleId, item.id, input),
    onSuccess: async (_bug, input) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['workshop-inbox', code, cycleId] }),
        queryClient.invalidateQueries({ queryKey: ['workshop-board', code, cycleId] }),
      ])
      if (input.duplicate_of_id)
        toast.show(t('workshop.inbox.markedDuplicate', { code: item.bug_code }))
      else if (input.reviewed) toast.show(t('workshop.inbox.reviewed', { code: item.bug_code }))
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })

  return (
    <li className="space-y-3 rounded-xl border border-line bg-surface p-4 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm text-brand-700">{item.bug_code}</p>
        <p className="text-sm text-ink-muted">
          {[item.table_name, item.tester_name].filter(Boolean).join(' · ')} ·{' '}
          {formatShortDateTime(item.reported_at, locale)}
        </p>
      </div>
      <p className="text-lg font-semibold break-words">{item.title}</p>
      {item.scenario && (
        <p className="text-sm text-ink-muted">
          {t('workshop.inbox.scenario', {
            code: item.scenario.case_code,
            title: item.scenario.title,
          })}
        </p>
      )}
      {item.description && <p className="whitespace-pre-line break-words">{item.description}</p>}
      {item.files.some((f) => f.ready) && (
        <ul className="flex flex-wrap gap-2">
          {item.files
            .filter((f) => f.ready)
            .map((file) => (
              <li key={file.id}>
                <a
                  href={ds.fileUrl(code, file.id, 'preview')}
                  target="_blank"
                  rel="noreferrer"
                  className="block overflow-hidden rounded-lg border border-line"
                >
                  <img
                    src={ds.fileUrl(code, file.id, 'thumbnail')}
                    alt={file.original_filename}
                    className="size-24 object-cover"
                    loading="lazy"
                  />
                </a>
              </li>
            ))}
        </ul>
      )}
      {item.confirmations > 0 && (
        <p className="inline-flex items-center gap-1 text-sm font-semibold text-pastel-peach-ink">
          <ThumbsUp aria-hidden="true" className="size-4" />
          {t('easy.bugs.alsoSeen', { count: item.confirmations })}
        </p>
      )}
      {item.similar.length > 0 && (
        <div className="rounded-lg bg-info-soft p-3">
          <p className="text-sm font-semibold text-info">{t('workshop.inbox.similar')}</p>
          <ul className="mt-2 space-y-2">
            {item.similar.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-mono">{s.bug_code}</span> {s.title}{' '}
                  <span className="text-ink-muted">({Math.round(s.score * 100)}%)</span>
                </span>
                {canReview && (
                  <Button
                    variant="secondary"
                    icon={Copy}
                    loading={review.isPending && review.variables?.duplicate_of_id === s.id}
                    onClick={() => review.mutate({ duplicate_of_id: s.id })}
                  >
                    {t('workshop.inbox.sameAs', { code: s.bug_code })}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {canReview && (
        <div className="space-y-2 border-t border-line pt-3">
          <p className="text-sm font-semibold">{t('workshop.inbox.severity')}</p>
          <div
            role="radiogroup"
            aria-label={t('workshop.inbox.severity')}
            className="flex flex-wrap gap-1"
          >
            {DEFECT_SEVERITIES.map((severity: DefectSeverity) => (
              <button
                key={severity}
                type="button"
                role="radio"
                aria-checked={item.severity_code === severity}
                onClick={() => review.mutate({ severity_code: severity })}
                className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${
                  item.severity_code === severity
                    ? 'bg-brand-700 text-white'
                    : 'border border-line-strong bg-surface hover:bg-neutral-soft'
                }`}
              >
                {t(`codes.severity.${severity}`)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              icon={Check}
              loading={review.isPending && review.variables?.reviewed === true}
              onClick={() => review.mutate({ reviewed: true })}
            >
              {t('workshop.inbox.markReviewed')}
            </Button>
            <Link
              to={projectPath(code, `bugs/${item.id}`)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              <ExternalLink aria-hidden="true" className="size-4" />
              {t('workshop.inbox.openBug')}
            </Link>
          </div>
        </div>
      )}
    </li>
  )
}

/** "Masalah masuk": problems sent by tables that a facilitator has not reviewed yet. */
export function InboxTab({
  code,
  cycleId,
  canReview,
}: {
  code: string
  cycleId: string
  canReview: boolean
}) {
  const { t } = useTranslation()
  const inbox = useWorkshopInbox(code, cycleId)
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-muted">{t('workshop.inbox.intro')}</p>
      {inbox.isPending && <LoadingState rows={4} />}
      {inbox.isError && <ErrorState error={inbox.error} onRetry={() => void inbox.refetch()} />}
      {inbox.isSuccess && inbox.data.length === 0 && (
        <EmptyState description={t('workshop.inbox.empty')} />
      )}
      {inbox.isSuccess && inbox.data.length > 0 && (
        <ul className="space-y-4">
          {inbox.data.map((item) => (
            <InboxCard
              key={item.id}
              code={code}
              cycleId={cycleId}
              item={item}
              canReview={canReview}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
