import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleHelp, LogOut, QrCode } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, Outlet, useNavigate } from 'react-router'
import { AnnouncementBanner } from '../components/AnnouncementBanner'
import { TestBoardMark } from '../components/brand/TestBoardMark'
import { FontSizeControl } from '../components/FontSizeControl'
import { ConfirmDialog } from '../components/ui/Dialog'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useCurrentUser } from '../hooks/queries'
import { useWorkshopSession } from '../hooks/workshop-queries'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'
import { OutboxProvider } from './outbox-context'
import { SessionContext } from './table-session'

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
 * per screen, a header that always says which table this is and how to leave.
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
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <Link to="/meja/kerja" className="flex min-w-0 items-center gap-3">
              <TestBoardMark className="size-10 shrink-0 text-brand-mark" />
              <span className="min-w-0">
                <span className="block text-xl leading-tight font-bold">{data.table.name}</span>
                <span className="block truncate text-sm text-ink-muted">
                  {data.cycle.title} · {data.project.name}
                </span>
              </span>
            </Link>
            <div className="flex items-center gap-2">
              <FontSizeControl />
              <Link
                to="/panduan#peserta"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 font-semibold text-brand-700 hover:bg-brand-50"
              >
                <CircleHelp aria-hidden="true" className="size-5" />
                {t('easy.help')}
              </Link>
              <button
                type="button"
                onClick={() => setConfirmLeave(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 font-semibold text-ink hover:bg-neutral-soft"
              >
                <LogOut aria-hidden="true" className="size-5" />
                {t('easy.leave')}
              </button>
            </div>
          </div>
        </header>
        <AnnouncementBanner />
        <OutboxProvider tableId={data.table.id}>
          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
            {children ?? <Outlet />}
          </main>
        </OutboxProvider>
        <footer className="bg-brand-800 px-4 py-4 text-center text-sm text-white/80">
          {t('easy.footer')}
        </footer>
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
