import {
  LOCALES,
  SITE_SETTING_KEYS,
  siteSettingsUpdateSchema,
  type SiteSettingKey,
  type SiteSettings,
  type SiteSettingsDto,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Save } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '../components/ui/Button'
import { FormAlert, SelectField, TextArea, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCurrentUser, useSiteSettings } from '../hooks/queries'
import { apiErrorText, apiFieldErrors } from '../lib/api-errors'
import { formatShortDateTime, toLocale } from '../lib/format'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

type Draft = { [K in SiteSettingKey]: string }

const NUMERIC: SiteSettingKey[] = [
  'auth.session_hours',
  'auth.idle_minutes',
  'recovery.link_hours',
  'retention.unused_file_days',
  'retention.import_days',
]

const toDraft = (values: SiteSettings): Draft =>
  Object.fromEntries(SITE_SETTING_KEYS.map((key) => [key, String(values[key])])) as Draft

function SettingsForm({ data }: { data: SiteSettingsDto }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [draft, setDraft] = useState<Draft>(() => toDraft(data.values))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [alert, setAlert] = useState<string | null>(null)

  const changes = () => {
    const out: Record<string, unknown> = {}
    for (const key of SITE_SETTING_KEYS) {
      const value = NUMERIC.includes(key) ? Number(draft[key]) : draft[key].trim()
      if (String(value) !== String(data.values[key])) out[key] = value
    }
    return out
  }

  const save = useMutation({
    mutationFn: (input: Record<string, unknown>) => ds.updateSiteSettings(input),
    onSuccess: async (saved) => {
      setDraft(toDraft(saved.values))
      queryClient.setQueryData(['site-settings'], saved)
      await queryClient.invalidateQueries({ queryKey: ['public-settings'] })
      toast.show(t('pages.adminSettings.saved'))
    },
    onError: (error) => {
      setErrors(
        Object.fromEntries(Object.keys(apiFieldErrors(error)).map((k) => [k, t('form.invalid')])),
      )
      setAlert(apiErrorText(t, error))
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setAlert(null)
    const input = changes()
    if (Object.keys(input).length === 0) {
      toast.show(t('pages.adminSettings.noChanges'))
      return
    }
    const parsed = siteSettingsUpdateSchema.safeParse(input)
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [String(issue.path[0]), t('form.invalid')]),
        ),
      )
      return
    }
    setErrors({})
    save.mutate(parsed.data)
  }

  const set = (key: SiteSettingKey) => (value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }))
  const meta = (key: SiteSettingKey): string => {
    const changed = data.changed[key]
    return changed
      ? t('pages.adminSettings.lastChanged', {
          date: formatShortDateTime(changed.at, locale),
          name: changed.by?.display_name ?? '-',
        })
      : t('pages.adminSettings.isDefault')
  }
  const hint = (text: string, key: SiteSettingKey): ReactNode => `${text} · ${meta(key)}`
  const number = (key: SiteSettingKey, label: string, help: string, min: number, max: number) => (
    <TextField
      label={label}
      hint={hint(help, key)}
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      required
      value={draft[key]}
      onChange={(e) => set(key)(e.target.value)}
      error={errors[key]}
    />
  )

  return (
    <form onSubmit={submit} noValidate className="space-y-6">
      <Section title={t('pages.adminSettings.general')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <TextField
            label={t('pages.adminSettings.siteName')}
            hint={hint(t('pages.adminSettings.siteNameHint'), 'site.name')}
            required
            maxLength={80}
            value={draft['site.name']}
            onChange={(e) => set('site.name')(e.target.value)}
            error={errors['site.name']}
          />
          <SelectField
            label={t('pages.adminSettings.defaultLocale')}
            hint={hint(t('pages.adminSettings.defaultLocaleHint'), 'site.default_locale')}
            value={draft['site.default_locale']}
            onChange={(e) => set('site.default_locale')(e.target.value)}
            options={LOCALES.map((l) => ({
              value: l,
              label: t(`pages.reports.export.languages.${l}`),
            }))}
          />
          <TextArea
            className="md:col-span-2"
            label={t('pages.adminSettings.announcement')}
            hint={hint(t('pages.adminSettings.announcementHint'), 'site.announcement')}
            rows={2}
            maxLength={500}
            value={draft['site.announcement']}
            onChange={(e) => set('site.announcement')(e.target.value)}
            error={errors['site.announcement']}
          />
          <TextArea
            className="md:col-span-2"
            label={t('pages.adminSettings.supportContact')}
            hint={hint(t('pages.adminSettings.supportContactHint'), 'site.support_contact')}
            rows={2}
            maxLength={300}
            value={draft['site.support_contact']}
            onChange={(e) => set('site.support_contact')(e.target.value)}
            error={errors['site.support_contact']}
          />
        </div>
      </Section>

      <Section title={t('pages.adminSettings.security')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {number(
            'auth.session_hours',
            t('pages.adminSettings.sessionHours'),
            t('pages.adminSettings.sessionHoursHint'),
            1,
            72,
          )}
          {number(
            'auth.idle_minutes',
            t('pages.adminSettings.idleMinutes'),
            t('pages.adminSettings.idleMinutesHint'),
            5,
            1440,
          )}
          {number(
            'recovery.link_hours',
            t('pages.adminSettings.linkHours'),
            t('pages.adminSettings.linkHoursHint'),
            1,
            168,
          )}
        </div>
      </Section>

      <Section title={t('pages.adminSettings.retention')}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {number(
            'retention.unused_file_days',
            t('pages.adminSettings.unusedFileDays'),
            t('pages.adminSettings.unusedFileDaysHint'),
            7,
            3650,
          )}
          {number(
            'retention.import_days',
            t('pages.adminSettings.importDays'),
            t('pages.adminSettings.importDaysHint'),
            7,
            3650,
          )}
        </div>
      </Section>

      <FormAlert message={alert} />
      <div className="flex justify-end">
        <Button type="submit" icon={Save} loading={save.isPending}>
          {t('pages.adminSettings.save')}
        </Button>
      </div>
    </form>
  )
}

export function AdminSettingsPage() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const isSuperAdmin = Boolean(me.data?.is_super_admin)
  const settings = useSiteSettings(isSuperAdmin)

  if (!isSuperAdmin) return <NotFoundPage reason="item" />
  return (
    <>
      <PageHeader
        title={t('pages.adminSettings.title')}
        subtitle={t('pages.adminSettings.subtitle')}
      />
      {settings.isPending && <LoadingState rows={6} />}
      {settings.isError && (
        <ErrorState error={settings.error} onRetry={() => void settings.refetch()} />
      )}
      {settings.data && <SettingsForm data={settings.data} />}
    </>
  )
}
