import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  BookOpen,
  Eye,
  EyeOff,
  FlaskConical,
  LoaderCircle,
  LogIn,
  QrCode,
  UserRound,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { WelcomeIllustration } from '../components/illustrations/WelcomeIllustration'
import { Button } from '../components/ui/Button'
import { CheckboxField, FormAlert, TextField } from '../components/ui/Form'
import { useCurrentUser, usePublicSettings } from '../hooks/queries'
import { storeLocale } from '../i18n'
import { PublicSiteLayout } from '../layout/PublicSiteLayout'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

/** The two ways in (owner, 2026-11-24): a table card, or a personal user account. */
export type SignInWay = 'meja' | 'pengguna'

const WAY_KEY = 'tb-signin-way'
const PATHS: Record<SignInWay, string> = { meja: '/meja', pengguna: '/login' }

function rememberedWay(): SignInWay {
  try {
    return localStorage.getItem(WAY_KEY) === 'pengguna' ? 'pengguna' : 'meja'
  } catch {
    return 'meja'
  }
}

function rememberWay(way: SignInWay) {
  try {
    localStorage.setItem(WAY_KEY, way)
  } catch {
    // private mode: the default is fine
  }
}

/** Only same-app paths are allowed as a post-login target (no open redirect). */
function safeNext(value: string | null): string {
  return value &&
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.startsWith('/login') &&
    !value.startsWith('/masuk')
    ? value
    : '/projects'
}

const digitsOf = (value: string) => value.replace(/\D/g, '').slice(0, 6)

/** "Kartu Meja": scan the QR on the card (the code arrives after "#") or type 6 digits. */
function TableCardForm() {
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

  // A scanned card signs in right away; the code is removed from the address bar (it is
  // never sent to the server log).
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

  if (join.isPending && fromQr) {
    return (
      <p className="flex items-center gap-3 py-6 text-lg" role="status">
        <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-brand-700" />
        {t('easy.join.checking')}
      </p>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      <p className="text-ink-muted">{t('easy.join.subtitle')}</p>
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
        className="inline-flex min-h-14 w-full items-center justify-center gap-3 rounded-2xl bg-brand-700 px-6 text-lg font-semibold text-white shadow-sm hover:bg-brand-800 disabled:opacity-50"
      >
        {join.isPending ? (
          <LoaderCircle aria-hidden="true" className="size-6 animate-spin" />
        ) : (
          <LogIn aria-hidden="true" className="size-6" />
        )}
        {t('easy.join.submit')}
      </button>
      <p className="rounded-xl bg-pastel-sky p-4 text-sm text-pastel-sky-ink">
        {t('easy.join.noCard')}
      </p>
    </form>
  )
}

/** Sample-data mode (no server): one button signs in as the sample user. */
function DemoLogin() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const role = me.data?.projects[0]?.role_code
  return (
    <div className="space-y-4">
      <p className="flex gap-2 rounded-xl bg-warning-soft p-4 text-sm text-warning">
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
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
      >
        <LogIn aria-hidden="true" className="size-4" />
        {t('actions.signInDemo')}
      </Link>
    </div>
  )
}

/** "Akun Pengguna": e-mail + password for Super Admin, Admin and Users. */
function PasswordForm({ next }: { next: string }) {
  const { t, i18n } = useTranslation()
  const publicSettings = usePublicSettings()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember, setRemember] = useState(false)
  const rememberDays = publicSettings.data?.['auth.remember_days'] ?? 0
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})

  const login = useMutation({
    mutationFn: () => ds.login(email.trim(), password, remember && rememberDays > 0),
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
      <p className="text-ink-muted">{t('signIn.user.intro')}</p>
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
          <span className="sr-only">{t('signIn.user.showPassword')}</span>
        </button>
      </div>
      {rememberDays > 0 && (
        <CheckboxField
          label={t('pages.login.remember')}
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />
      )}
      <FormAlert message={message} />
      <Button type="submit" icon={LogIn} loading={login.isPending} className="min-h-12 w-full">
        {t('pages.login.submit')}
      </Button>
      <p className="text-sm text-ink-muted">{t('pages.login.noAccount')}</p>
    </form>
  )
}

const WAYS: { way: SignInWay; icon: LucideIcon }[] = [
  { way: 'meja', icon: QrCode },
  { way: 'pengguna', icon: UserRound },
]

/**
 * The one sign-in page (owner, 2026-11-24): "Kartu Meja" for participants at a table, or
 * "Akun Pengguna" for everyone with an account. /meja (printed QR cards point here) and
 * /login open their tab directly; /masuk opens the tab used last on this device.
 */
export function SignInPage({ way: fixedWay }: { way?: SignInWay }) {
  const { t } = useTranslation()
  const publicSettings = usePublicSettings()
  const ds = useDataSource()
  const me = useCurrentUser()
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const demo = ds.kind === 'mock'
  const way = fixedWay ?? rememberedWay()
  const tabRefs = useRef<Record<SignInWay, HTMLButtonElement | null>>({
    meja: null,
    pengguna: null,
  })

  useEffect(() => {
    if (fixedWay) rememberWay(fixedWay)
  }, [fixedWay])

  // Already signed in: a person goes on to where they were heading, a table to Mode Mudah.
  if (!demo && me.data && me.data.account_kind !== 'TABLE' && way === 'pengguna') {
    return <Navigate to={next} replace />
  }
  if (!fixedWay && me.data) {
    return <Navigate to={me.data.account_kind === 'TABLE' ? '/meja/kerja' : next} replace />
  }

  function choose(target: SignInWay) {
    rememberWay(target)
    navigate(`${PATHS[target]}${location.search}`, { replace: true })
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    const target: SignInWay =
      event.key === 'Home'
        ? 'meja'
        : event.key === 'End'
          ? 'pengguna'
          : way === 'meja'
            ? 'pengguna'
            : 'meja'
    choose(target)
    tabRefs.current[target]?.focus()
  }

  const siteName = publicSettings.data?.['site.name']
  const support = publicSettings.data?.['site.support_contact']

  return (
    <PublicSiteLayout>
      <div className="mx-auto grid max-w-5xl overflow-hidden rounded-[28px] card-pasker lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <aside className="hidden flex-col justify-between gap-8 bg-gradient-to-br from-brand-50 via-white to-teal-50 p-10 lg:flex">
          <div>
            <p className="text-sm font-semibold tracking-wide text-teal-700 uppercase">
              {t('signIn.welcome.eyebrow')}
            </p>
            <h2 className="mt-2 text-3xl font-bold text-brand-800">{t('signIn.welcome.title')}</h2>
            <p className="mt-3 text-ink-muted">{t('signIn.welcome.body')}</p>
          </div>
          <WelcomeIllustration className="mx-auto w-full max-w-sm" />
          <Link
            to="/panduan#masuk"
            className="inline-flex items-center gap-2 self-start rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand-700 shadow-xs ring-1 ring-brand-100 hover:bg-brand-50"
          >
            <BookOpen aria-hidden="true" className="size-4" />
            {t('signIn.welcome.guide')}
          </Link>
        </aside>

        <section className="p-6 sm:p-10">
          <h1 className="text-2xl font-bold text-brand-800 sm:text-3xl">
            {siteName ? t('pages.login.titleSite', { name: siteName }) : t('pages.login.title')}
          </h1>
          <p className="mt-2 text-ink-muted">{t('signIn.choose')}</p>

          <div
            role="tablist"
            aria-label={t('signIn.tabsLabel')}
            className="mt-6 grid gap-3 sm:grid-cols-2"
          >
            {WAYS.map(({ way: option, icon: Icon }) => {
              const selected = option === way
              return (
                <button
                  key={option}
                  ref={(node) => {
                    tabRefs.current[option] = node
                  }}
                  type="button"
                  role="tab"
                  id={`masuk-tab-${option}`}
                  aria-selected={selected}
                  aria-controls="masuk-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => choose(option)}
                  onKeyDown={onTabKey}
                  className={`flex items-start gap-3 rounded-2xl border-2 p-4 text-left transition-colors ${
                    selected
                      ? 'border-brand-600 bg-brand-50 shadow-xs'
                      : 'border-line bg-surface hover:border-brand-300 hover:bg-brand-50/50'
                  }`}
                >
                  <span
                    className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${
                      selected ? 'chip-gradient' : 'bg-neutral-soft text-ink-muted'
                    }`}
                  >
                    <Icon aria-hidden="true" className="size-6" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">
                      {t(`signIn.${option}.title`)}
                    </span>
                    <span className="mt-0.5 block text-sm text-ink-muted">
                      {t(`signIn.${option}.who`)}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>

          <div
            role="tabpanel"
            id="masuk-panel"
            aria-labelledby={`masuk-tab-${way}`}
            className="mt-6"
          >
            {way === 'meja' ? (
              <TableCardForm />
            ) : demo ? (
              <DemoLogin />
            ) : (
              <PasswordForm next={next} />
            )}
          </div>

          {way === 'pengguna' && (
            <nav
              aria-label={t('recovery.help')}
              className="mt-6 flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-4 text-sm"
            >
              <Link to="/recover" className="font-semibold text-brand-700 hover:underline">
                {t('recovery.forgotPassword')}
              </Link>
              <Link
                to="/recover?type=email"
                className="font-semibold text-brand-700 hover:underline"
              >
                {t('recovery.forgotEmail')}
              </Link>
            </nav>
          )}
          {support && (
            <p className="mt-4 text-sm whitespace-pre-line text-ink-muted">
              {t('pages.login.support', { contact: support })}
            </p>
          )}
          <Link
            to="/panduan#masuk"
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline lg:hidden"
          >
            <BookOpen aria-hidden="true" className="size-4" />
            {t('signIn.welcome.guide')}
          </Link>
        </section>
      </div>
    </PublicSiteLayout>
  )
}
