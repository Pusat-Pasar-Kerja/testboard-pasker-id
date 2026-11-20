import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatNumber, toLocale } from '../../lib/format'

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number
  pageSize: number
  total: number
  onPageChange: (page: number) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const button =
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-lg border border-line bg-surface px-3 text-sm font-medium hover:bg-brand-50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-surface'

  return (
    <nav
      aria-label={t('pagination.label')}
      className="flex flex-wrap items-center justify-between gap-3 pt-4"
    >
      <p className="text-sm text-ink-muted tabular-nums">
        {t('pagination.summary', {
          from: formatNumber(from, locale),
          to: formatNumber(to, locale),
          total: formatNumber(total, locale),
        })}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={button}
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only">{t('pagination.previous')}</span>
        </button>
        <span className="text-sm tabular-nums" aria-live="polite">
          {t('pagination.page', { page, pages })}
        </span>
        <button
          type="button"
          className={button}
          disabled={page >= pages}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="sr-only sm:not-sr-only">{t('pagination.next')}</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
    </nav>
  )
}
