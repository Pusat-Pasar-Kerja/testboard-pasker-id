import { recoveryRequestSchema, type RecoveryKind } from '@testboard/shared'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, MailCheck, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { Button } from '../components/ui/Button'
import { FormAlert, TextArea, TextField } from '../components/ui/Form'
import { usePublicSettings } from '../hooks/queries'
import { PublicLayout } from '../layout/PublicLayout'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

type Draft = { email: string; name: string; contact: string; message: string; website: string }
const EMPTY: Draft = { email: '', name: '', contact: '', message: '', website: '' }

function RequestForm({ kind, onSent }: { kind: RecoveryKind; onSent: () => void }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const [draft, setDraft] = useState<Draft>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }))
  const forgotEmail = kind === 'FORGOT_EMAIL'

  const send = useMutation({
    mutationFn: () =>
      ds.submitRecoveryRequest(
        forgotEmail
          ? {
              kind,
              name: draft.name,
              contact: draft.contact,
              message: draft.message,
              website: draft.website,
            }
          : {
              kind,
              email: draft.email,
              name: draft.name,
              contact: draft.contact,
              message: draft.message,
              website: draft.website,
            },
      ),
    onSuccess: onSent,
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const parsed = recoveryRequestSchema.safeParse(
      forgotEmail ? { kind, ...draft, email: undefined } : { kind, ...draft },
    )
    if (!parsed.success) {
      const next: Partial<Record<keyof Draft, string>> = {}
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as keyof Draft
        const empty = !draft[field]?.trim()
        next[field] ??= empty
          ? t('form.required')
          : field === 'email'
            ? t('recovery.request.invalidEmail')
            : t('form.tooShort', { min: 3 })
      }
      setErrors(next)
      return
    }
    setErrors({})
    send.mutate()
  }

  const error = send.error
  const alert =
    error instanceof ApiClientError
      ? error.status === 429
        ? t('recovery.request.tooMany')
        : t(`errors.${error.code}`)
      : error
        ? t('errors.INTERNAL_ERROR')
        : null

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <p className="text-sm text-ink-muted">
        {forgotEmail ? t('recovery.request.introEmail') : t('recovery.request.introPassword')}
      </p>
      {!forgotEmail && (
        <TextField
          label={t('recovery.request.accountEmail')}
          type="email"
          name="email"
          autoComplete="email"
          inputMode="email"
          required
          value={draft.email}
          onChange={(e) => set('email')(e.target.value)}
          error={errors.email}
        />
      )}
      <TextField
        label={t('fields.displayName')}
        name="name"
        autoComplete="name"
        required
        maxLength={120}
        value={draft.name}
        onChange={(e) => set('name')(e.target.value)}
        error={errors.name}
      />
      <TextField
        label={t('recovery.request.contact')}
        hint={t('recovery.request.contactHint')}
        name="contact"
        required={forgotEmail}
        maxLength={200}
        value={draft.contact}
        onChange={(e) => set('contact')(e.target.value)}
        error={errors.contact}
      />
      <TextArea
        label={t('recovery.request.message')}
        hint={forgotEmail ? t('recovery.request.messageHintEmail') : undefined}
        name="message"
        rows={3}
        maxLength={1000}
        value={draft.message}
        onChange={(e) => set('message')(e.target.value)}
        error={errors.message}
      />
      {/* Left empty by people; filled in by form-filling bots (silently ignored). */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            name="website"
            value={draft.website}
            onChange={(e) => set('website')(e.target.value)}
          />
        </label>
      </div>
      <FormAlert message={alert} />
      <Button type="submit" icon={Send} loading={send.isPending} className="w-full">
        {t('recovery.request.submit')}
      </Button>
    </form>
  )
}

/** "Lupa kata sandi / Lupa email": the request goes to the Super Admins (ADR 0012). */
export function RecoverPage() {
  const { t } = useTranslation()
  const publicSettings = usePublicSettings()
  const [params, setParams] = useSearchParams()
  const kind: RecoveryKind = params.get('type') === 'email' ? 'FORGOT_EMAIL' : 'FORGOT_PASSWORD'
  const [sent, setSent] = useState<RecoveryKind | null>(null)
  const contact = publicSettings.data?.['site.support_contact']

  const tab = (value: RecoveryKind, label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={kind === value}
      onClick={() => {
        setSent(null)
        setParams(value === 'FORGOT_EMAIL' ? { type: 'email' } : {}, { replace: true })
      }}
      className={`min-h-11 flex-1 rounded-lg px-3 text-sm font-semibold transition-colors ${
        kind === value ? 'bg-surface text-brand-700 shadow-sm' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {label}
    </button>
  )

  return (
    <PublicLayout>
      <div className="space-y-2">
        <h1 className="text-xl font-bold">{t('recovery.request.title')}</h1>
        <p className="text-sm text-ink-muted">{t('recovery.request.subtitle')}</p>
      </div>
      <div role="tablist" className="flex gap-1 rounded-xl bg-neutral-soft p-1">
        {tab('FORGOT_PASSWORD', t('recovery.forgotPasswordTab'))}
        {tab('FORGOT_EMAIL', t('recovery.forgotEmailTab'))}
      </div>
      {sent === kind ? (
        <div role="status" className="space-y-3 rounded-xl bg-success-soft p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-success">
            <MailCheck aria-hidden="true" className="size-5" />
            {t('recovery.request.sentTitle')}
          </p>
          <p>{t('recovery.request.sentBody')}</p>
          {contact && (
            <p className="whitespace-pre-line text-ink-muted">
              {t('pages.login.support', { contact })}
            </p>
          )}
        </div>
      ) : (
        <RequestForm key={kind} kind={kind} onSent={() => setSent(kind)} />
      )}
      <Link
        to="/login"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('recovery.backToLogin')}
      </Link>
    </PublicLayout>
  )
}
