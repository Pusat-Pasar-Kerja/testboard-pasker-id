import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleHelp, LogOut, QrCode } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router'
import { AnnouncementBanner } from '../components/AnnouncementBanner'
import { AccessibilityMenu } from '../components/a11y/AccessibilityMenu'
import { ConfirmDialog } from '../components/ui/Dialog'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useCurrentUser } from '../hooks/queries'
import { useWorkshopSession } from '../hooks/workshop-queries'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'
import { HEADER_ICON, HEADER_PILL_QUIET } from './header-styles'
import { OutboxProvider } from './outbox-context'
import { rememberPage } from './return-path'
import { SiteFooter } from './SiteFooter'
import { SessionContext } from './table-session'
import { TopBar } from './TopBar'
import { groupLabel } from '../lib/uat'

/** Shown when the card was blocked, renewed or has expired: a calm way back in. */
function CardClosed({ reason }: { reason: string }) {
  const { t } = useTranslation()
  const known: 'NOT_YET' | 'EXPIRED' | 'REVOKED' =
    reason === 'NOT_YET' || reason === 'EXPIRED' ? reason : 'REVOKED'
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="inline-flex size-16 items-center justify-center rounded-3xl bg-pastel-peach text-pastel-peach-ink">
        <QrCode aria-hidden="true" className="size-8" />
      </span>
      <h1 className="text-2xl font-bold">{t(`easy.closed.${known}.title`)}</h1>
      <p className="text-lg text-ink-muted">{t(`easy.closed.${known}.body`)}</p>
      <Link
        to="/meja"
        className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-brand-700 px-6 text-lg font-semibold text-white"
      >
        <QrCode aria-hidden="true" className="size-6" />
        {t('easy.closed.again')}
      </Link>
    </div>
  )
}

/**
 * Mode Mudah (ADR 0016): the screens of a table card. Large text and buttons, one thing
 * per screen. The header and footer are the ones of the whole website; the header always
 * says which group this is, and the right end is how to leave.
 */
export function EasyLayout({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const isTable = me.data?.account_kind === 'TABLE'
  const session = useWorkshopSession(isTable)
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirmLeave, setConfirmLeave] = useState(false)
  const { pathname, search } = useLocation()
  // "Kembali ke meja" on the guide comes back to the very screen the table was on.
  useEffect(() => rememberPage('table', pathname + search), [pathname, search])
  const leave = useMutation({
    mutationFn: () => ds.logout(),
    onSettled: () => {
      queryClient.clear()
      navigate('/meja', { replace: true })
    },
  })

  if (me.isPending) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <LoadingState rows={4} />
      </div>
    )
  }
  if (!isTable) return <Navigate to="/meja" replace />
  if (session.isPending) {
    return (
      <div className="mx-auto max-w-3xl p-8">
        <LoadingState rows={4} />
      </div>
    )
  }
  if (session.isError) {
    if (session.error instanceof ApiClientError && session.error.status === 401) {
      return <CardClosed reason={session.error.details[0]?.message ?? 'REVOKED'} />
    }
    return (
      <div className="mx-auto max-w-3xl p-8">
        <ErrorState error={session.error} onRetry={() => void session.refetch()} />
      </div>
    )
  }
  const data = session.data

  return (
    <SessionContext.Provider value={data}>
      <div className="flex min-h-dvh flex-col bg-canvas text-[1.0625rem]">
        <TopBar
          home="/meja/kerja"
          homeLabel={data.table.name}
          width="max-w-4xl"
          context={
            <div className="min-w-0 leading-tight">
              <p className="truncate text-base font-bold text-ink">{groupLabel(t, data.table)}</p>
              <p className="truncate text-xs text-ink-muted">
                {data.run?.name ?? data.cycle.title} · {data.project.name}
              </p>
            </div>
          }
          actions={
            <>
              <AccessibilityMenu />
              <Link
                to="/panduan#peserta"
                aria-label={t('easy.help')}
                data-tip={t('easy.help')}
                className={`inline-flex ${HEADER_ICON}`}
              >
                <CircleHelp aria-hidden="true" className="size-5" />
              </Link>
            </>
          }
          account={
            <button
              type="button"
              onClick={() => setConfirmLeave(true)}
              className={`inline-flex ${HEADER_PILL_QUIET}`}
            >
              <LogOut aria-hidden="true" className="size-4" />
              {t('easy.leave')}
            </button>
          }
        />
        <AnnouncementBanner />
        <OutboxProvider tableId={data.table.id}>
          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6">
            {children ?? <Outlet />}
          </main>
        </OutboxProvider>
        <SiteFooter width="max-w-4xl" />
        <ConfirmDialog
          open={confirmLeave}
          title={t('easy.leaveTitle', { name: data.table.name })}
          body={t('easy.leaveBody')}
          confirmLabel={t('easy.leave')}
          tone="primary"
          busy={leave.isPending}
          onConfirm={() => leave.mutate()}
          onCancel={() => setConfirmLeave(false)}
        />
      </div>
    </SessionContext.Provider>
  )
}
