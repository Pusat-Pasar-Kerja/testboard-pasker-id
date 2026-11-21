import { linkValidity } from '@testboard/shared'
import { Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatShortDateTime, toLocale } from '../../lib/format'
import { formatRemaining, useNow } from './validity'

const BAR_TONE = {
  ok: 'bg-success',
  warn: 'bg-warning',
  low: 'bg-danger',
} as const

/**
 * How long a reset link stays valid: remaining time, end time and a bar that empties as
 * the time runs out (green > half, amber, red under 15 %). Ticks every second.
 */
export function ValidityBar({
  issuedAt,
  expiresAt,
  compact = false,
}: {
  issuedAt: string
  expiresAt: string
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const now = useNow(compact ? 15_000 : 1_000)
  const { remainingMs, fraction, expired } = linkValidity(issuedAt, expiresAt, now)
  const tone = fraction > 0.5 ? 'ok' : fraction > 0.15 ? 'warn' : 'low'
  const text = expired
    ? t('recovery.validity.expired')
    : t('recovery.validity.remaining', { time: formatRemaining(t, remainingMs) })
  const percent = Math.round(fraction * 100)

  return (
    <div className={compact ? 'space-y-1' : 'space-y-1.5'}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
        <span
          className={`inline-flex items-center gap-1 font-semibold ${expired ? 'text-danger' : 'text-ink'}`}
        >
          <Clock aria-hidden="true" className="size-3.5" />
          {text}
        </span>
        <span className="text-ink-muted">
          {t('recovery.validity.until', { date: formatShortDateTime(expiresAt, locale) })}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={t('recovery.validity.label')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-valuetext={text}
        className={`overflow-hidden rounded-full bg-neutral-soft ${compact ? 'h-1.5' : 'h-2.5'}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-700 ease-out ${BAR_TONE[tone]}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}
