import { LoaderCircle, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 shadow-xs',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-neutral-soft',
  danger: 'bg-danger text-white hover:bg-danger/90 shadow-xs',
  ghost: 'text-brand-700 hover:bg-brand-50',
}

const BASE =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold whitespace-nowrap active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50'

export function Button({
  variant = 'primary',
  icon: Icon,
  loading = false,
  children,
  className = '',
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  icon?: LucideIcon
  loading?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`${BASE} ${VARIANT[variant]} ${className}`}
    >
      {loading ? (
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
      ) : (
        Icon && <Icon aria-hidden="true" className="size-4" />
      )}
      {children}
    </button>
  )
}

export function ButtonLink({
  to,
  variant = 'primary',
  icon: Icon,
  children,
}: {
  to: string
  variant?: Variant
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <Link to={to} className={`${BASE} ${VARIANT[variant]}`}>
      {Icon && <Icon aria-hidden="true" className="size-4" />}
      {children}
    </Link>
  )
}
