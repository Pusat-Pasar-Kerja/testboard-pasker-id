import { LOCALES, passwordSchema, type Locale } from '@testboard/shared'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, LogOut, Monitor, Save, Smartphone } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FormAlert, SelectField, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCurrentUser } from '../hooks/queries'
import { storeLocale } from '../i18n'
import { apiErrorText } from '../lib/api-errors'
import { formatShortDateTime, toLocale } from '../lib/format'
import { describeUserAgent } from '../lib/user-agent'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

function AccountForm({
  name: initialName,
  locale: initialLocale,
}: {
  name: string
  locale: Locale
}) {
  const { t, i18n } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState(initialName)
  const [locale, setLocale] = useState<Locale>(initialLocale)

  const save = useMutation({
    mutationFn: () => ds.updateProfile({ display_name: name.trim(), preferred_locale: locale }),
    onSuccess: async (user) => {
      queryClient.setQueryData(['me'], user)
      await i18n.changeLanguage(user.preferred_locale)
      storeLocale(user.preferred_locale)
      toast.show(t('pages.profile.saved'))
    },
  })

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault()
        if (name.trim()) save.mutate()
      }}
      className="space-y-5"
    >
      <TextField
        label={t('fields.displayName')}
        required
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={name.trim() ? undefined : t('form.required')}
      />
      <SelectField
        label={t('fields.language')}
        required
        value={locale}
        onChange={(e) => setLocale(e.target.value as Locale)}
        options={LOCALES.map((l) => ({ value: l, label: t(`language.${l}`) }))}
      />
      <FormAlert
        message={
          save.isError
            ? save.error instanceof ApiClientError
              ? t(`errors.${save.error.code}`)
              : t('errors.INTERNAL_ERROR')
            : null
        }
      />
      <Button type="submit" icon={Save} loading={save.isPending}>
        {t('actions.save')}
      </Button>
    </form>
  )
}

function PasswordForm({ demo }: { demo: boolean }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({})

  const change = useMutation({
    mutationFn: () => ds.changePassword({ current_password: current, new_password: next }),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setConfirm('')
      toast.show(t('pages.profile.passwordChanged'))
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        const fields = error.fieldErrors()
        setErrors({ current: fields.current_password, next: fields.new_password })
      }
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    const nextErrors = {
      current: current ? undefined : t('form.required'),
      next: passwordSchema.safeParse(next).success ? undefined : t('form.tooShort', { min: 12 }),
      confirm: confirm === next ? undefined : t('pages.profile.mismatch'),
    }
    setErrors(nextErrors)
    if (!nextErrors.current && !nextErrors.next && !nextErrors.confirm) change.mutate()
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {demo && (
        <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">
          {t('pages.profile.demoNote')}
        </p>
      )}
      <TextField
        label={t('pages.profile.currentPassword')}
        type="password"
        autoComplete="current-password"
        required
        value={current}
        onChange={(e) => setCurrent(e.target.value)}
        error={errors.current}
      />
      <TextField
        label={t('pages.profile.newPassword')}
        type="password"
        autoComplete="new-password"
        required
        value={next}
        onChange={(e) => setNext(e.target.value)}
        hint={t('pages.profile.passwordHint')}
        error={errors.next}
      />
      <TextField
        label={t('pages.profile.confirmPassword')}
        type="password"
        autoComplete="new-password"
        required
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
        error={errors.confirm}
      />
      <FormAlert
        message={
          change.isError && !(change.error instanceof ApiClientError && change.error.status === 422)
            ? change.error instanceof ApiClientError
              ? t(`errors.${change.error.code}`)
              : t('errors.INTERNAL_ERROR')
            : null
        }
      />
      <Button type="submit" icon={KeyRound} loading={change.isPending}>
        {t('pages.profile.passwordTitle')}
      </Button>
    </form>
  )
}

/** "Perangkat yang sedang masuk" with "Keluar dari semua perangkat lain" (ADR 0015). */
function DevicesSection() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [confirm, setConfirm] = useState(false)
  const devices = useQuery({ queryKey: ['my-sessions'], queryFn: () => ds.listMySessions() })
  const revoke = useMutation({
    mutationFn: () => ds.revokeOtherSessions(),
    onSuccess: async () => {
      setConfirm(false)
      await queryClient.invalidateQueries({ queryKey: ['my-sessions'] })
      toast.show(t('pages.profile.devices.revoked'))
    },
    onError: (error) => {
      setConfirm(false)
      toast.show(apiErrorText(t, error), 'error')
    },
  })
  const others = (devices.data ?? []).filter((d) => !d.current).length

  return (
    <Section title={t('pages.profile.devices.title')}>
      <p className="mb-3 text-sm text-ink-muted">{t('pages.profile.devices.subtitle')}</p>
      {devices.isPending && <LoadingState rows={2} />}
      {devices.isError && (
        <ErrorState error={devices.error} onRetry={() => void devices.refetch()} />
      )}
      {devices.isSuccess && (
        <ul className="divide-y divide-line">
          {devices.data.map((device) => {
            const label = describeUserAgent(device.user_agent)
            const Icon = label.mobile ? Smartphone : Monitor
            const name =
              [label.browser, label.os].filter(Boolean).join(' · ') ||
              t('pages.profile.devices.unknown')
            return (
              <li key={device.key} className="flex items-start gap-3 py-3 text-sm">
                <Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-ink-muted" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {name}
                    {device.current && (
                      <Badge
                        tone="success"
                        label={t('pages.profile.devices.current')}
                        className="ml-2"
                      />
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {t('pages.profile.devices.lastSeen', {
                      date: formatShortDateTime(device.last_seen_at, locale),
                    })}
                    {' · '}
                    {device.remembered
                      ? t('pages.profile.devices.rememberedUntil', {
                          date: formatShortDateTime(device.expires_at, locale),
                        })
                      : t('pages.profile.devices.notRemembered')}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
      <div className="mt-4">
        <Button
          variant="secondary"
          icon={LogOut}
          disabled={others === 0}
          onClick={() => setConfirm(true)}
        >
          {t('pages.profile.devices.revokeOthers')}
        </Button>
      </div>
      <ConfirmDialog
        open={confirm}
        title={t('pages.profile.devices.revokeTitle')}
        body={t('pages.profile.devices.revokeBody', { count: others })}
        confirmLabel={t('pages.profile.devices.revokeOthers')}
        busy={revoke.isPending}
        onConfirm={() => revoke.mutate()}
        onCancel={() => setConfirm(false)}
      />
    </Section>
  )
}

export function ProfilePage() {
  const { t } = useTranslation()
  const ds = useDataSource()
  const me = useCurrentUser()
  if (!me.data) return <LoadingState rows={4} />
  return (
    <>
      <PageHeader
        title={t('pages.profile.title')}
        subtitle={me.data.email}
        badges={
          me.data.is_super_admin ? <Badge tone="brand" label={t('shell.superAdmin')} /> : undefined
        }
      />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title={t('pages.profile.account')}>
          <AccountForm
            key={me.data.id}
            name={me.data.display_name}
            locale={me.data.preferred_locale}
          />
        </Section>
        <Section title={t('pages.profile.passwordTitle')}>
          <PasswordForm demo={ds.kind === 'mock'} />
        </Section>
        <div className="lg:col-span-2">
          <DevicesSection />
        </div>
      </div>
    </>
  )
}
