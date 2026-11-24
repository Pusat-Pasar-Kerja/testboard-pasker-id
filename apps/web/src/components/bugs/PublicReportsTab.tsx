import type { PublicReportItem } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePublicReports } from '../../hooks/structure-queries'
import { apiErrorText } from '../../lib/api-errors'
import { useDataSource } from '../../services/use-data-source'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import { EmptyState, ErrorState, LoadingState } from '../ui/States'
import { useToast } from '../ui/toast-context'
import { InboxCard } from '../workshop/admin/InboxTab'

/**
 * Reports sent through the public form (after go-live). Nothing shows publicly until an
 * Admin has looked: mark it reviewed, say it is the same as a known problem, or throw it
 * away when it is not a problem (spam, a test, the wrong place).
 */
export function PublicReportsTab({ code }: { code: string }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const reports = usePublicReports(code)
  const [discarding, setDiscarding] = useState<PublicReportItem | null>(null)
  const discard = useMutation({
    mutationFn: (item: PublicReportItem) => ds.deletePublicReport(code, item.id),
    onSuccess: async (_r, item) => {
      setDiscarding(null)
      await queryClient.invalidateQueries({ queryKey: ['public-reports', code] })
      await queryClient.invalidateQueries({ queryKey: ['defects', code] })
      toast.show(t('bugReporting.reports.discarded', { code: item.bug_code }))
    },
    onError: (error) => {
      setDiscarding(null)
      toast.show(apiErrorText(t, error), 'error')
    },
  })
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-muted">{t('bugReporting.reports.intro')}</p>
      {reports.isPending && <LoadingState rows={3} />}
      {reports.isError && (
        <ErrorState error={reports.error} onRetry={() => void reports.refetch()} />
      )}
      {reports.isSuccess && reports.data.length === 0 && (
        <EmptyState description={t('bugReporting.reports.empty')} />
      )}
      {reports.isSuccess && reports.data.length > 0 && (
        <ul className="space-y-4">
          {reports.data.map((item) => (
            <InboxCard
              key={item.id}
              code={code}
              item={item}
              canReview
              review={(input) => ds.reviewPublicReport(code, item.id, input)}
              refreshKeys={[['public-reports', code], ['defects', code], ['public']]}
              from={
                <>
                  {item.reporter ?? t('bugReporting.reports.anonymous')}
                  {item.contact && (
                    <span className="ml-1">
                      ({t('bugReporting.reports.contact')}: {item.contact})
                    </span>
                  )}
                </>
              }
              actions={
                <Button variant="ghost" icon={Trash2} onClick={() => setDiscarding(item)}>
                  {t('bugReporting.reports.discard')}
                </Button>
              }
            />
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={discarding !== null}
        title={
          discarding ? t('bugReporting.reports.discardTitle', { code: discarding.bug_code }) : ''
        }
        body={t('bugReporting.reports.discardBody')}
        confirmLabel={t('bugReporting.reports.discard')}
        busy={discard.isPending}
        onConfirm={() => discarding && discard.mutate(discarding)}
        onCancel={() => setDiscarding(null)}
      />
    </div>
  )
}
