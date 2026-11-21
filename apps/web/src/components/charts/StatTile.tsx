import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { PASTEL_CHIP, type Pastel } from '../ui/pastel'

/**
 * Stat tile: label (sentence case) + value (semibold, proportional figures). The icon sits
 * in a soft pastel chip; `tone` picks the pastel (decoration only).
 */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'lavender',
  to,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  tone?: Pastel
  to?: string
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        {Icon && (
          <span
            className={`inline-flex size-7 shrink-0 items-center justify-center rounded-lg ${PASTEL_CHIP[tone]}`}
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
        )}
        {label}
      </span>
      <span className="mt-1 block text-3xl font-semibold tracking-tight">{value}</span>
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </>
  )
  const base = 'block rounded-xl border border-line bg-surface p-4 shadow-xs'
  return to ? (
    <Link
      to={to}
      className={`${base} hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm`}
    >
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  )
}
