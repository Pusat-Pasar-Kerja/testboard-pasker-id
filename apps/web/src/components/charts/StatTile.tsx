import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'

/** Stat tile: label (sentence case) + value (semibold, proportional figures). */
export function StatTile({
  label,
  value,
  hint,
  icon: Icon,
  to,
}: {
  label: string
  value: ReactNode
  hint?: ReactNode
  icon?: LucideIcon
  to?: string
}) {
  const body = (
    <>
      <span className="flex items-center gap-2 text-sm text-ink-muted">
        {Icon && <Icon aria-hidden="true" className="size-4" />}
        {label}
      </span>
      <span className="mt-1 block text-3xl font-semibold tracking-tight">{value}</span>
      {hint && <span className="mt-1 block text-xs text-ink-muted">{hint}</span>}
    </>
  )
  const base = 'block rounded-xl border border-line bg-surface p-4 shadow-xs'
  return to ? (
    <Link to={to} className={`${base} hover:border-brand-300 hover:bg-brand-50/40`}>
      {body}
    </Link>
  ) : (
    <div className={base}>{body}</div>
  )
}
