import { LOCALES, passwordSchema, type Locale } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Save } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { FormAlert, SelectField, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCurrentUser } from '../hooks/queries'
import { storeLocale } from '../i18n'
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
      </div>
    </>
  )
}
