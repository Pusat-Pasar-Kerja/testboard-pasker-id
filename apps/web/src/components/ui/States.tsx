import { CircleAlert, Inbox, RotateCw, SearchX } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ApiClientError } from '../../services/api-client'

/** Skeleton placeholder; announces loading to assistive tech once. */
export function LoadingState({ rows = 5 }: { rows?: number }) {
  const { t } = useTranslation()
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{t('states.loading')}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-10 animate-soft-pulse rounded-lg bg-neutral-soft"
          style={{ opacity: 1 - index * 0.12 }}
        />
      ))}
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
  filtered = false,
}: {
  title?: string
  description: string
  action?: ReactNode
  filtered?: boolean
}) {
  const { t } = useTranslation()
  const Icon = filtered ? SearchX : Inbox
  return (
    <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <Icon aria-hidden="true" className="size-10 text-line-strong" />
      <p className="font-semibold">
        {title ?? (filtered ? t('states.filteredTitle') : t('states.emptyTitle'))}
      </p>
      <p className="max-w-md text-sm text-ink-muted">{description}</p>
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation()
  const apiError = error instanceof ApiClientError ? error : null
  return (
    <div role="alert" className="flex flex-col items-center gap-3 px-4 py-10 text-center">
      <CircleAlert aria-hidden="true" className="size-10 text-danger" />
      <p className="font-semibold">{t('states.errorTitle')}</p>
      <p className="max-w-md text-sm text-ink-muted">
        {apiError ? t(`errors.${apiError.code}`) : t('errors.INTERNAL_ERROR')}
      </p>
      {apiError?.requestId && (
        <p className="text-xs text-ink-muted">
          {t('errors.reference', { id: apiError.requestId })}
        </p>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          <RotateCw aria-hidden="true" className="size-4" />
          {t('actions.retry')}
        </button>
      )}
    </div>
  )
}
