import type { LucideIcon } from 'lucide-react'

export type Tone = 'success' | 'danger' | 'warning' | 'info' | 'neutral' | 'brand' | 'muted'

const TONE_CLASS: Record<Tone, string> = {
  success: 'bg-success-soft text-success ring-success/20',
  danger: 'bg-danger-soft text-danger ring-danger/20',
  warning: 'bg-warning-soft text-warning ring-warning/25',
  info: 'bg-info-soft text-info ring-info/20',
  neutral: 'bg-neutral-soft text-neutral ring-neutral/20',
  brand: 'bg-brand-50 text-brand-700 ring-brand-700/20',
  muted: 'bg-surface text-ink-muted ring-line-strong',
}

/** Status pill: colour is never the only signal - always an icon and a text label. */
export function Badge({
  tone,
  icon: Icon,
  label,
  className = '',
}: {
  tone: Tone
  icon?: LucideIcon
  label: string
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ring-1 ring-inset ${TONE_CLASS[tone]} ${className}`}
    >
      {Icon && <Icon aria-hidden="true" className="size-3.5 shrink-0" />}
      {label}
    </span>
  )
}
