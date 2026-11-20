import { LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { useCurrentUser } from '../hooks/queries'
import { useDataSource } from '../services/use-data-source'

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

export function UserMenu() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const demo = useDataSource().kind === 'mock'
  const name = me.data?.display_name ?? '…'

  return (
    <details className="relative">
      <summary
        className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-1.5 hover:bg-neutral-soft [&::-webkit-details-marker]:hidden"
        aria-label={t('shell.signedInAs', { name })}
      >
        <span
          aria-hidden="true"
          className="inline-flex size-8 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800"
        >
          {initials(name)}
        </span>
        <span className="hidden text-left leading-tight xl:block">
          <span className="block text-sm font-semibold">{name}</span>
          {demo && (
            <span className="block text-[11px] font-semibold text-warning">
              {t('mode.demoShort')}
            </span>
          )}
        </span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 origin-top-right animate-pop-in rounded-xl border border-line bg-surface p-2 shadow-lg">
        <p className="px-3 py-2 text-sm">
          {t('shell.signedInAs', { name })}
          {demo && <span className="mt-1 block text-xs text-warning">{t('mode.demo')}</span>}
        </p>
        <Link
          to="/login"
          className="flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm hover:bg-neutral-soft"
        >
          <LogOut aria-hidden="true" className="size-4" />
          {t('shell.signOutDemo')}
        </Link>
      </div>
    </details>
  )
}
