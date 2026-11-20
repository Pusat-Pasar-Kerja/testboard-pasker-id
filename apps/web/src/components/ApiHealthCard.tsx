import type { Locale } from '@testboard/shared'
import { useQuery } from '@tanstack/react-query'
import { CircleAlert, CircleCheck, LoaderCircle, RotateCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDateTime } from '../lib/format'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

export function ApiHealthCard() {
  const { t, i18n } = useTranslation()
  const dataSource = useDataSource()
  const health = useQuery({
    queryKey: ['health', dataSource.kind],
    queryFn: () => dataSource.getHealth(),
    retry: false,
  })

  const locale: Locale = i18n.resolvedLanguage === 'en' ? 'en' : 'id'

  return (
    <section
      aria-labelledby="api-health-heading"
      className="rounded-xl border border-line bg-surface p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="api-health-heading" className="text-base font-semibold">
          {t('foundation.apiStatus')}
        </h2>
        <p aria-live="polite" className="flex items-center gap-2 text-sm font-medium">
          {health.isPending && (
            <>
              <LoaderCircle aria-hidden="true" className="size-4 animate-spin text-info" />
              <span>{t('status.loading')}</span>
            </>
          )}
          {health.isSuccess && (
            <>
              <CircleCheck aria-hidden="true" className="size-4 text-success" />
              <span className="text-success">{t('status.ok')}</span>
            </>
          )}
          {health.isError && (
            <>
              <CircleAlert aria-hidden="true" className="size-4 text-danger" />
              <span className="text-danger">{t('status.error')}</span>
            </>
          )}
        </p>
      </div>

      {health.isSuccess && (
        <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-ink-muted">{t('foundation.service')}</dt>
            <dd className="font-medium break-all">{health.data.service}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t('foundation.version')}</dt>
            <dd className="font-medium">{health.data.version}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t('foundation.database')}</dt>
            <dd className="font-medium">{t(`status.database.${health.data.database}`)}</dd>
          </div>
          <div>
            <dt className="text-ink-muted">{t('foundation.checkedAt')}</dt>
            <dd className="font-medium">{formatDateTime(health.data.time, locale)}</dd>
          </div>
        </dl>
      )}

      {health.isError && (
        <div className="mt-4 space-y-3 text-sm">
          <p>
            {health.error instanceof ApiClientError
              ? t(`errors.${health.error.code}`)
              : t('errors.INTERNAL_ERROR')}
          </p>
          {health.error instanceof ApiClientError && health.error.requestId && (
            <p className="text-ink-muted">
              {t('errors.reference', { id: health.error.requestId })}
            </p>
          )}
          <button
            type="button"
            onClick={() => void health.refetch()}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 font-semibold text-white hover:bg-brand-600"
          >
            <RotateCw aria-hidden="true" className="size-4" />
            {t('foundation.retry')}
          </button>
        </div>
      )}
    </section>
  )
}
