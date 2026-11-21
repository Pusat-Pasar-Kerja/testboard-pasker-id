import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, FlaskConical, LogIn } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router'
import { Button } from '../components/ui/Button'
import { FormAlert, TextField } from '../components/ui/Form'
import { useCurrentUser, usePublicSettings } from '../hooks/queries'
import { storeLocale } from '../i18n'
import { PublicLayout } from '../layout/PublicLayout'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

/** Only same-app paths are allowed as a post-login target (no open redirect). */
function safeNext(value: string | null): string {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/login')
    ? value
    : '/projects'
}

function DemoLogin() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const role = me.data?.projects[0]?.role_code
  return (
    <>
      <p className="flex gap-2 rounded-lg bg-warning-soft p-3 text-sm text-warning">
        <FlaskConical aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>{t('pages.login.demoNotice')}</span>
      </p>
      {me.data && role && (
        <p className="text-sm text-ink-muted">
          {t('pages.login.demoUser', { name: me.data.display_name, role: t(`codes.role.${role}`) })}
        </p>
      )}
      <Link
        to="/projects"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
      >
        <LogIn aria-hidden="true" className="size-4" />
        {t('actions.signInDemo')}
      </Link>
    </>
  )
}

function PasswordLogin({ next }: { next: string }) {
  const { t, i18n } = useTranslation()
  const publicSettings = usePublicSettings()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  const login = useMutation({
    mutationFn: () => ds.login(email.trim(), password),
    onSuccess: async (user) => {
      queryClient.clear()
      queryClient.setQueryData(['me'], user)
      await i18n.changeLanguage(user.preferred_locale)
      storeLocale(user.preferred_locale)
      navigate(next, { replace: true })
    },
    onError: () => setPassword(''),
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const errors = {
      email: email.trim() ? undefined : t('form.required'),
      password: password ? undefined : t('form.required'),
    }
    setFieldErrors(errors)
    if (errors.email || errors.password) return
    login.mutate()
  }

  const error = login.error
  const message =
    error instanceof ApiClientError
      ? error.status === 401
        ? t('pages.login.invalid')
        : error.status === 429
          ? t('pages.login.locked')
          : t(`errors.${error.code}`)
      : error
        ? t('errors.INTERNAL_ERROR')
        : null

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <TextField
        label={t('fields.email')}
        type="email"
        name="email"
        autoComplete="username"
        inputMode="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
      />
      <div className="relative">
        <TextField
          label={t('fields.password')}
          type={showPassword ? 'text' : 'password'}
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={fieldErrors.password}
          className="[&_input]:pr-12"
        />
        <button
          type="button"
          onClick={() => setShowPassword((v) => !v)}
          aria-pressed={showPassword}
          className="absolute top-7 right-1 inline-flex size-10 items-center justify-center rounded-md text-ink-muted hover:bg-neutral-soft"
        >
          {showPassword ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
          <span className="sr-only">{t('fields.password')}</span>
        </button>
      </div>
      <FormAlert message={message} />
      <Button type="submit" icon={LogIn} loading={login.isPending} className="w-full">
        {t('pages.login.submit')}
      </Button>
      <p className="text-xs text-ink-muted">{t('pages.login.noAccount')}</p>
      {publicSettings.data?.['site.support_contact'] && (
        <p className="text-xs whitespace-pre-line text-ink-muted">
          {t('pages.login.support', { contact: publicSettings.data['site.support_contact'] })}
        </p>
      )}
    </form>
  )
}

export function LoginPage() {
  const { t } = useTranslation()
  const publicSettings = usePublicSettings()
  const ds = useDataSource()
  const me = useCurrentUser()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const demo = ds.kind === 'mock'

  if (!demo && me.data) return <Navigate to={next} replace />

  return (
    <PublicLayout>
      <div className="space-y-2">
        <h1 className="text-xl font-bold">
          {publicSettings.data
            ? t('pages.login.titleSite', { name: publicSettings.data['site.name'] })
            : t('pages.login.title')}
        </h1>
        <p className="text-sm text-ink-muted">{t('app.tagline')}</p>
      </div>
      {demo ? <DemoLogin /> : <PasswordLogin next={next} />}
      <nav
        aria-label={t('recovery.help')}
        className="flex flex-wrap justify-center gap-x-4 gap-y-1 border-t border-line pt-4 text-sm"
      >
        <Link to="/recover" className="font-medium text-brand-700 hover:underline">
          {t('recovery.forgotPassword')}
        </Link>
        <Link to="/recover?type=email" className="font-medium text-brand-700 hover:underline">
          {t('recovery.forgotEmail')}
        </Link>
      </nav>
    </PublicLayout>
  )
}
