import { useMutation, useQueryClient } from '@tanstack/react-query'
import { LoaderCircle, LogIn, QrCode } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Navigate, useLocation, useNavigate } from 'react-router'
import { FormAlert } from '../components/ui/Form'
import { useCurrentUser } from '../hooks/queries'
import { PublicSiteLayout } from '../layout/PublicSiteLayout'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

const digitsOf = (value: string) => value.replace(/\D/g, '').slice(0, 6)

/**
 * "Masuk dengan Kartu Meja": scan the QR on the table card (the code arrives after "#",
 * never sent to the server log) or type the 6 digits printed under it.
 */
export function TableJoinPage() {
  const { t } = useTranslation()
  const ds = useDataSource()
  const me = useCurrentUser()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const fromQr = digitsOf(location.hash.replace(/^#/, ''))
  const [code, setCode] = useState(fromQr)
  const autoTried = useRef(false)

  const join = useMutation({
    mutationFn: (value: string) => ds.joinWorkshop(value),
    onSuccess: async (session) => {
      // Drop everything cached for whoever used this device before.
      queryClient.clear()
      queryClient.setQueryData(['workshop', 'session'], session)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate('/meja/kerja', { replace: true })
    },
  })

  // A scanned card signs in right away; the code is removed from the address bar.
  useEffect(() => {
    if (fromQr.length === 6 && !autoTried.current) {
      autoTried.current = true
      window.history.replaceState(null, '', window.location.pathname + window.location.search)
      join.mutate(fromQr)
    }
  }, [fromQr, join])

  if (me.data?.account_kind === 'TABLE' && !join.isPending) {
    return <Navigate to="/meja/kerja" replace />
  }

  const error = join.error
  type Reason = 'WRONG_CODE' | 'NOT_YET' | 'EXPIRED' | 'REVOKED' | 'RATE_LIMITED' | 'OTHER'
  const known = (value: string | undefined): Reason =>
    value === 'NOT_YET' || value === 'EXPIRED' || value === 'REVOKED' ? value : 'WRONG_CODE'
  const reason: Reason | null =
    error instanceof ApiClientError
      ? error.status === 429
        ? 'RATE_LIMITED'
        : error.status === 401
          ? known(error.details[0]?.message)
          : 'OTHER'
      : error
        ? 'OTHER'
        : null
  const staffName =
    me.data && me.data.account_kind !== 'TABLE' && ds.kind !== 'mock' ? me.data.display_name : null

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (code.length === 6) join.mutate(code)
  }

  return (
    <PublicSiteLayout>
      <div className="mx-auto max-w-xl rounded-3xl border border-line bg-surface p-6 shadow-sm sm:p-10">
        <span className="inline-flex size-14 items-center justify-center rounded-2xl bg-pastel-sky text-pastel-sky-ink">
          <QrCode aria-hidden="true" className="size-7" />
        </span>
        <h1 className="mt-4 text-3xl font-bold">{t('easy.join.title')}</h1>
        <p className="mt-2 text-lg text-ink-muted">{t('easy.join.subtitle')}</p>

        {join.isPending && fromQr ? (
          <p className="mt-8 flex items-center gap-3 text-lg" role="status">
            <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-brand-700" />
            {t('easy.join.checking')}
          </p>
        ) : (
          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-5">
            <label className="block">
              <span className="block text-lg font-semibold">{t('easy.join.codeLabel')}</span>
              <span className="block text-sm text-ink-muted">{t('easy.join.codeHint')}</span>
              <input
                value={code.length > 3 ? `${code.slice(0, 3)} ${code.slice(3)}` : code}
                onChange={(e) => setCode(digitsOf(e.target.value))}
                inputMode="numeric"
                autoComplete="one-time-code"
                aria-invalid={reason === 'WRONG_CODE' || undefined}
                placeholder="123 456"
                className="mt-2 block min-h-16 w-full rounded-2xl border-2 border-line-strong bg-surface px-4 text-center font-mono text-4xl tracking-[0.25em] text-ink focus:border-brand-500"
              />
            </label>
            {staffName && (
              <p className="rounded-xl bg-warning-soft p-4 text-warning">
                {t('easy.join.staffWarning', { name: staffName })}
              </p>
            )}
            <FormAlert message={reason ? t(`easy.join.error.${reason}`) : null} />
            <button
              type="submit"
              disabled={code.length !== 6 || join.isPending}
              className="inline-flex min-h-16 w-full items-center justify-center gap-3 rounded-2xl bg-brand-700 px-6 text-xl font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
            >
              {join.isPending ? (
                <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />
              ) : (
                <LogIn aria-hidden="true" className="size-6" />
              )}
              {t('easy.join.submit')}
            </button>
          </form>
        )}
        <p className="mt-6 text-sm text-ink-muted">{t('easy.join.noCard')}</p>
      </div>
    </PublicSiteLayout>
  )
}
