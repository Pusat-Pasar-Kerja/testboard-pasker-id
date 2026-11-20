import { totalOf, type ExecutionStatus, type StatusCounts } from '@testboard/shared'
import { useTranslation } from 'react-i18next'
import { formatNumber, formatPercent, toLocale } from '../../lib/format'

/**
 * Segmented bar "one whole, split into parts" (dataviz spec): no baseline, 2px surface gap
 * between parts, NOT_RUN is the unfilled track. Order keeps green and red apart.
 * Status colour is never alone: legend + labels + accessible names carry identity.
 */
const STATUS_ORDER: ExecutionStatus[] = [
  'PASSED',
  'BLOCKED',
  'FAILED',
  'IN_PROGRESS',
  'SKIPPED',
  'NOT_RUN',
]

const FILL: Record<ExecutionStatus, string> = {
  PASSED: 'bg-chart-passed',
  BLOCKED: 'bg-chart-blocked',
  FAILED: 'bg-chart-failed',
  IN_PROGRESS: 'bg-chart-progress',
  SKIPPED: 'bg-chart-skipped',
  NOT_RUN: 'bg-chart-track',
}

// Inside-label ink per fill: white, except near-black on warning and the light track.
const INK: Record<ExecutionStatus, string> = {
  PASSED: 'text-white',
  BLOCKED: 'text-[#0b0b0b]',
  FAILED: 'text-white',
  IN_PROGRESS: 'text-white',
  SKIPPED: 'text-white',
  NOT_RUN: 'text-[#0b0b0b]',
}

/** Minimum share (%) for the tall bar to print a part's share inside it. */
const LABEL_MIN_SHARE = 9

export function StatusBar({
  counts,
  variant = 'tall',
}: {
  counts: StatusCounts
  variant?: 'tall' | 'thin'
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const total = totalOf(counts)
  const parts = STATUS_ORDER.filter((status) => counts[status] > 0).map((status) => ({
    status,
    count: counts[status],
    share: total === 0 ? 0 : (counts[status] / total) * 100,
  }))
  const describe = (part: (typeof parts)[number]) =>
    `${t(`codes.execution.${part.status}`)}: ${formatNumber(part.count, locale)} (${formatPercent(part.share, locale, 0)})`
  const summary = parts.map(describe).join(', ')

  if (variant === 'thin') {
    return (
      <div
        role="img"
        aria-label={t('pages.dashboard.statusBarLabel', { summary })}
        title={summary}
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-chart-track"
      >
        {parts.map((part) => (
          <span
            key={part.status}
            className={`${FILL[part.status]} h-full first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${part.share}%` }}
          />
        ))}
      </div>
    )
  }

  return (
    <div>
      <div
        role="group"
        aria-label={t('pages.dashboard.statusBarLabel', { summary })}
        className="flex h-7 w-full gap-0.5"
      >
        {total === 0 && <span className="h-full w-full rounded bg-chart-track" />}
        {parts.map((part) => (
          <span
            key={part.status}
            tabIndex={0}
            aria-label={describe(part)}
            className={`group relative flex h-full min-w-1 items-center rounded px-1.5 text-xs font-semibold tabular-nums outline-offset-2 transition-opacity hover:opacity-85 ${FILL[part.status]} ${INK[part.status]}`}
            style={{ width: `${part.share}%` }}
          >
            {part.share >= LABEL_MIN_SHARE && (
              <span aria-hidden="true">{formatPercent(part.share, locale, 0)}</span>
            )}
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 hidden -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow group-hover:block group-focus-visible:block"
            >
              <strong className="font-semibold">{formatNumber(part.count, locale)}</strong>{' '}
              {t(`codes.execution.${part.status}`)}
            </span>
          </span>
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
        {parts.map((part) => (
          <li key={part.status} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`size-3 rounded-sm ${FILL[part.status]}`} />
            <span className="text-ink-muted">{t(`codes.execution.${part.status}`)}</span>
            <span className="font-semibold tabular-nums">{formatNumber(part.count, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
