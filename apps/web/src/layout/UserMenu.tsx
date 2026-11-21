import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LogOut, ShieldCheck, UserRound, UsersRound } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
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

const ITEM =
  'flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-neutral-soft'

export function UserMenu() {
  const { t } = useTranslation()
  const ds = useDataSource()
  const me = useCurrentUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const details = useRef<HTMLDetailsElement>(null)
  const demo = ds.kind === 'mock'
  const name = me.data?.display_name ?? '…'
  const close = () => details.current?.removeAttribute('open')

  const logout = useMutation({
    mutationFn: () => ds.logout(),
    onSettled: () => {
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  return (
    <details ref={details} className="relative">
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
          {demo ? (
            <span className="block text-[11px] font-semibold text-warning">
              {t('mode.demoShort')}
            </span>
          ) : (
            me.data?.is_super_admin && (
              <span className="block text-[11px] font-semibold text-brand-700">
                {t('shell.superAdmin')}
              </span>
            )
          )}
        </span>
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-64 origin-top-right animate-pop-in rounded-xl border border-line bg-surface p-2 shadow-lg">
        <p className="px-3 py-2 text-sm">
          {t('shell.signedInAs', { name })}
          {me.data && (
            <span className="block truncate text-xs text-ink-muted">{me.data.email}</span>
          )}
          {demo && <span className="mt-1 block text-xs text-warning">{t('mode.demo')}</span>}
        </p>
        <Link to="/profile" className={ITEM} onClick={close}>
          <UserRound aria-hidden="true" className="size-4" />
          {t('nav.profile')}
        </Link>
        {me.data?.is_super_admin && (
          <Link to="/admin/projects" className={ITEM} onClick={close}>
            <UsersRound aria-hidden="true" className="size-4" />
            {t('nav.adminUsers')}
            <ShieldCheck aria-hidden="true" className="ml-auto size-4 text-brand-600" />
          </Link>
        )}
        {demo ? (
          <Link to="/login" className={ITEM} onClick={close}>
            <LogOut aria-hidden="true" className="size-4" />
            {t('shell.signOutDemo')}
          </Link>
        ) : (
          <button
            type="button"
            className={ITEM}
            disabled={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut aria-hidden="true" className="size-4" />
            {t('shell.signOut')}
          </button>
        )}
      </div>
    </details>
  )
}
