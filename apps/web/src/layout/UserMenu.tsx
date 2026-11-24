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

/**
 * The account at the right end of the top bar: only the round initials (owner, 2026-11-24:
 * one calm row). Name, e-mail and role are inside the menu.
 */
export function UserMenu() {
  const { t } = useTranslation()
  const ds = useDataSource()
  const me = useCurrentUser()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const details = useRef<HTMLDetailsElement>(null)
  const demo = ds.kind === 'mock'
  const name = me.data?.display_name ?? '…'
  const role = me.data?.system_role ?? null
  const close = () => details.current?.removeAttribute('open')

  const logout = useMutation({
    mutationFn: () => ds.logout(),
    onSettled: () => {
      queryClient.clear()
      navigate('/login', { replace: true })
    },
  })

  return (
    <div className="flex shrink-0 items-center gap-2">
      {demo && (
        <span className="hidden rounded-full bg-warning-soft px-2 py-0.5 text-[11px] font-bold text-warning sm:inline">
          {t('mode.demoShort')}
        </span>
      )}
      <details ref={details} className="relative">
        <summary
          className="header-tip flex size-11 cursor-pointer list-none items-center justify-center rounded-full hover:bg-neutral-soft [&::-webkit-details-marker]:hidden"
          aria-label={t('shell.signedInAs', { name })}
          data-tip={name}
          data-tip-align="end"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-9 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-800"
          >
            {initials(name)}
          </span>
        </summary>
        <div className="absolute right-0 z-30 mt-2 w-72 origin-top-right animate-pop-in rounded-xl border border-line bg-surface p-2 shadow-lg">
          <div className="flex items-center gap-3 px-3 py-2">
            <span
              aria-hidden="true"
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-800"
            >
              {initials(name)}
            </span>
            <span className="min-w-0 text-sm">
              <span className="block truncate font-semibold">{name}</span>
              {me.data?.email && (
                <span className="block truncate text-xs text-ink-muted">{me.data.email}</span>
              )}
              {role && (
                <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 text-[11px] font-semibold text-brand-700">
                  {t(`codes.systemRole.${role}`)}
                </span>
              )}
            </span>
          </div>
          {demo && <p className="px-3 pb-2 text-xs text-warning">{t('mode.demo')}</p>}
          <div className="my-1 border-t border-line" />
          <Link to="/profile" className={ITEM} onClick={close}>
            <UserRound aria-hidden="true" className="size-4" />
            {t('nav.profile')}
          </Link>
          {role && (
            <Link
              to={role === 'SUPER_ADMIN' ? '/admin/users' : '/admin/projects'}
              className={ITEM}
              onClick={close}
            >
              <UsersRound aria-hidden="true" className="size-4" />
              {t('nav.adminSection')}
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
    </div>
  )
}
