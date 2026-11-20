import { DEFECT_SEVERITIES, type DefectSeverity } from '@testboard/shared'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { formatNumber, toLocale } from '../../lib/format'

/**
 * Single-series horizontal bar chart: bars <= 24px thick, square at the baseline with a
 * 4px rounded data-end, value at the tip, no legend (the heading names the series).
 * Each bar links to the matching filtered bug list.
 */
export function SeverityBars({
  counts,
  linkFor,
}: {
  counts: Record<DefectSeverity, number>
  linkFor: (severity: DefectSeverity) => string
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const max = Math.max(1, ...DEFECT_SEVERITIES.map((s) => counts[s]))

  return (
    <ul className="space-y-1">
      {DEFECT_SEVERITIES.map((severity) => {
        const value = counts[severity]
        const label = t(`codes.severity.${severity}`)
        return (
          <li key={severity}>
            <Link
              to={linkFor(severity)}
              aria-label={t('pages.dashboard.severityBarLabel', { severity: label, count: value })}
              className="group grid min-h-9 grid-cols-[6.5rem_1fr] items-center gap-3 rounded-md px-1 hover:bg-brand-50"
            >
              <span className="text-sm text-ink-muted">{label}</span>
              <span className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="h-4 rounded-r bg-brand-500 transition-[width,opacity] duration-500 ease-soft group-hover:opacity-80"
                  style={{ width: value === 0 ? '0' : `calc(${(value / max) * 100}% - 2.5rem)` }}
                />
                <span aria-hidden="true" className="text-sm font-semibold tabular-nums">
                  {formatNumber(value, locale)}
                </span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
