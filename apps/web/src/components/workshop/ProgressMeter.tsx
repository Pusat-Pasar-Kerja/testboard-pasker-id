import type { ResultCounts } from '@testboard/shared'
import { useTranslation } from 'react-i18next'
import { formatNumber, toLocale } from '../../lib/format'
import { triedPercent } from '../../lib/workshop'

type Part = 'passed' | 'failed' | 'blocked' | 'skipped' | 'untried'

const FILL: Record<Part, string> = {
  passed: 'bg-chart-passed',
  blocked: 'bg-chart-blocked',
  failed: 'bg-chart-failed',
  skipped: 'bg-chart-skipped',
  untried: 'bg-chart-track',
}
const ORDER = ['passed', 'blocked', 'failed', 'skipped'] as const

/**
 * Progress of a table or feature in plain words: "12 dari 40 sudah dicoba", a segmented
 * bar (Sesuai / Tidak bisa dicoba / Tidak sesuai) and, when asked, a legend with counts.
 * Colour never carries meaning alone: the legend and the accessible name spell it out.
 */
export function ProgressMeter({
  counts,
  size = 'md',
  legend = false,
  headline = true,
}: {
  counts: ResultCounts
  size?: 'sm' | 'md' | 'lg'
  legend?: boolean
  headline?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const n = (value: number) => formatNumber(value, locale)
  const parts = ORDER.map((part) => ({ part, value: counts[part] })).filter((p) => p.value > 0)
  const share = (value: number) => (counts.total === 0 ? 0 : (value / counts.total) * 100)
  const summary = [
    t('progress.summary', { tried: n(counts.tried), total: n(counts.total) }),
    ...parts.map((p) => `${t(`progress.${p.part}`)} ${n(p.value)}`),
  ].join(', ')
  const height = size === 'lg' ? 'h-5' : size === 'md' ? 'h-3' : 'h-2'

  return (
    <div>
      {headline && (
        <p
          className={`flex items-baseline justify-between gap-3 ${size === 'lg' ? 'text-lg' : 'text-sm'}`}
        >
          <span>
            <strong className="font-semibold tabular-nums">{n(counts.tried)}</strong>{' '}
            <span className="text-ink-muted">{t('progress.of', { total: n(counts.total) })}</span>
          </span>
          <span className="font-semibold text-brand-700 tabular-nums">{triedPercent(counts)}%</span>
        </p>
      )}
      <div
        role="img"
        aria-label={summary}
        title={summary}
        className={`mt-1.5 flex w-full gap-0.5 overflow-hidden rounded-full bg-chart-track ${height}`}
      >
        {parts.map((p) => (
          <span
            key={p.part}
            className={`${FILL[p.part]} h-full transition-[width] duration-500 ease-soft first:rounded-l-full last:rounded-r-full`}
            style={{ width: `${share(p.value)}%` }}
          />
        ))}
      </div>
      {legend && (
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {[...ORDER, 'untried' as const].map((part) => {
            const value = part === 'untried' ? counts.total - counts.tried : counts[part]
            if (value <= 0 && part !== 'untried') return null
            return (
              <li key={part} className="flex items-center gap-1.5">
                <span aria-hidden="true" className={`size-3 rounded-sm ${FILL[part]}`} />
                <span className="text-ink-muted">{t(`progress.${part}`)}</span>
                <span className="font-semibold tabular-nums">{n(value)}</span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
