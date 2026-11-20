import { ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

export interface Crumb {
  label: string
  to?: string
}

export function PageHeader({
  title,
  subtitle,
  crumbs = [],
  badges,
  actions,
}: {
  title: ReactNode
  subtitle?: ReactNode
  crumbs?: Crumb[]
  badges?: ReactNode
  actions?: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <header className="mb-6 space-y-3">
      {crumbs.length > 0 && (
        <nav aria-label={t('shell.breadcrumb')}>
          <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-muted">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight aria-hidden="true" className="size-3.5" />}
                {crumb.to ? (
                  <Link to={crumb.to} className="rounded hover:text-brand-700 hover:underline">
                    {crumb.label}
                  </Link>
                ) : (
                  <span aria-current="page">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-bold tracking-tight break-words">{title}</h1>
          {badges && <div className="flex flex-wrap items-center gap-2">{badges}</div>}
          {subtitle && <p className="max-w-3xl text-sm text-ink-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
