import { passwordSchema, type ResetLinkProblem } from '@testboard/shared'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CircleCheck, KeyRound, LinkIcon, LogIn } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation, useNavigate } from 'react-router'
import { ValidityBar } from '../components/recovery/ValidityBar'
import { Button } from '../components/ui/Button'
import { FormAlert, TextField } from '../components/ui/Form'
import { LoadingState } from '../components/ui/States'
import { PublicLayout } from '../layout/PublicLayout'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

/** The token travels after `#`, so the browser never sends it to the server or in a Referer. */
function tokenFromHash(hash: string): string {
  try {
    return decodeURIComponent(hash.replace(/^#/, '')).trim()
  } catch {
    return ''
  }
}

function problemOf(error: unknown): ResetLinkProblem {
  if (error instanceof ApiClientError && error.status === 404) {
    const reason = error.details[0]?.message
    if (reason === 'EXPIRED' || reason === 'USED' || reason === 'REVOKED') return reason
  }
  return 'INVALID'
}

function LinkProblem({ problem }: { problem: ResetLinkProblem }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-4">
      <div role="alert" className="space-y-2 rounded-xl bg-danger-soft p-4 text-sm">
        <p className="flex items-center gap-2 font-semibold text-danger">
          <LinkIcon aria-hidden="true" className="size-4" />
          {t(`recovery.reset.problem.${problem}`)}
        </p>
        <p>{t('recovery.reset.askAgain')}</p>
      </div>
      <Link to="/recover" className="text-sm font-medium text-brand-700 hover:underline">
        {t('recovery.reset.newRequest')}
      </Link>
    </div>
  )
}

export function ResetPasswordPage() {
  const { t } = useTranslation()
  const ds = useDataSource()
  const location = useLocation()
  const navigate = useNavigate()
  const [token] = useState(() => tokenFromHash(location.hash))
  // Keep the token in memory only: remove it from the address bar and browser history.
  useEffect(() => {
    if (location.hash) {
      navigate({ pathname: location.pathname, search: location.search }, { replace: true })
    }
  }, [location.hash, location.pathname, location.search, navigate])
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})

  const link = useQuery({
    queryKey: ['reset-link', token],
    queryFn: () => ds.checkResetLink(token),
    enabled: token !== '',
    retry: false,
    staleTime: Infinity,
  })

  const reset = useMutation({
    mutationFn: () => ds.resetPassword({ token, new_password: password }),
    onError: (error) => {
      if (error instanceof ApiClientError && error.status === 422) {
        setErrors({
          password: error.fieldErrors().new_password?.includes('e-mail')
            ? t('recovery.reset.containsEmail')
            : t('pages.profile.passwordHint'),
        })
      }
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = {
      password: passwordSchema.safeParse(password).success
        ? undefined
        : t('form.tooShort', { min: 8 }),
      confirm: confirm === password ? undefined : t('pages.profile.mismatch'),
    }
    setErrors(next)
    if (!next.password && !next.confirm) reset.mutate()
  }

  const linkProblem = reset.error instanceof ApiClientError && reset.error.status === 404

  return (
    <PublicLayout>
      <div className="space-y-2">
        <h1 className="text-xl font-bold">{t('recovery.reset.title')}</h1>
      </div>
      {token === '' && <LinkProblem problem="INVALID" />}
      {token !== '' && link.isPending && <LoadingState rows={2} />}
      {link.isError && <LinkProblem problem={problemOf(link.error)} />}
      {reset.isSuccess && (
        <div className="space-y-4">
          <div role="status" className="space-y-2 rounded-xl bg-success-soft p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-success">
              <CircleCheck aria-hidden="true" className="size-5" />
              {t('recovery.reset.doneTitle')}
            </p>
            <p>{t('recovery.reset.doneBody')}</p>
          </div>
          <Link
            to="/login"
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
          >
            <LogIn aria-hidden="true" className="size-4" />
            {t('recovery.reset.toLogin')}
          </Link>
        </div>
      )}
      {link.isSuccess && !reset.isSuccess && linkProblem && (
        <LinkProblem problem={problemOf(reset.error)} />
      )}
      {link.isSuccess && !reset.isSuccess && !linkProblem && (
        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="space-y-1 rounded-xl border border-line bg-canvas p-3 text-sm">
            <p className="text-ink-muted">{t('recovery.reset.account')}</p>
            <p className="font-semibold">{link.data.display_name}</p>
            <p className="font-mono text-sm break-all">{link.data.email}</p>
          </div>
          <ValidityBar issuedAt={link.data.issued_at} expiresAt={link.data.expires_at} />
          {/* Lets password managers save the new password for the right account. */}
          <input
            type="email"
            name="username"
            autoComplete="username"
            value={link.data.email}
            readOnly
            hidden
          />
          <TextField
            label={t('pages.profile.newPassword')}
            hint={t('pages.profile.passwordHint')}
            type="password"
            name="new-password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={errors.password}
          />
          <TextField
            label={t('pages.profile.confirmPassword')}
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={errors.confirm}
          />
          <FormAlert
            message={
              reset.isError &&
              !(reset.error instanceof ApiClientError && reset.error.status === 422)
                ? t('errors.INTERNAL_ERROR')
                : null
            }
          />
          <Button type="submit" icon={KeyRound} loading={reset.isPending} className="w-full">
            {t('recovery.reset.submit')}
          </Button>
        </form>
      )}
    </PublicLayout>
  )
}
