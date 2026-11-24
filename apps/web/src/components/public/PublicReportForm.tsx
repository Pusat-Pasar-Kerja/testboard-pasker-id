import { publicBugReportSchema } from '@testboard/shared'
import { useMutation } from '@tanstack/react-query'
import { CircleCheckBig, Send } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { apiErrorText } from '../../lib/api-errors'
import { ApiClientError } from '../../services/api-client'
import { useDataSource } from '../../services/use-data-source'
import { Button } from '../ui/Button'
import { FormAlert, TextArea, TextField } from '../ui/Form'

const EMPTY = {
  title: '',
  description: '',
  feature: '',
  reporter_name: '',
  contact: '',
  website: '',
}

/**
 * "Laporkan masalah" for the public (after go-live, ADR 0019). Name and contact are
 * optional and never shown publicly; an Admin reviews every report before it appears. The
 * hidden "website" field catches robots.
 */
export function PublicReportForm({ projectCode }: { projectCode: string }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof typeof EMPTY, string>>>({})
  const [alert, setAlert] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const set = (key: keyof typeof EMPTY) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }
  const send = useMutation({
    mutationFn: () =>
      ds.sendPublicBugReport(projectCode, {
        title: form.title.trim(),
        description: form.description.trim(),
        feature: form.feature.trim() || null,
        reporter_name: form.reporter_name.trim() || null,
        contact: form.contact.trim() || null,
        website: form.website,
      }),
    onSuccess: () => {
      setForm(EMPTY)
      setSent(true)
    },
    onError: (error) =>
      setAlert(
        error instanceof ApiClientError && error.status === 429
          ? t('public.report.tooMany')
          : apiErrorText(t, error),
      ),
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setAlert(null)
    const parsed = publicBugReportSchema.safeParse({
      title: form.title.trim(),
      description: form.description.trim(),
      feature: form.feature.trim() || null,
      reporter_name: form.reporter_name.trim() || null,
      contact: form.contact.trim() || null,
    })
    if (!parsed.success) {
      const next: typeof errors = {}
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? '') as keyof typeof EMPTY
        next[key] =
          key === 'title'
            ? t('public.report.titleHint')
            : key === 'description'
              ? t('public.report.descriptionHint')
              : t('form.invalid')
      }
      setErrors(next)
      setAlert(t('form.invalid'))
      return
    }
    send.mutate()
  }

  if (sent) {
    return (
      <div role="status" className="rounded-2xl border-2 border-success/40 bg-success-soft p-6">
        <p className="flex items-center gap-2 text-xl font-semibold text-success">
          <CircleCheckBig aria-hidden="true" className="size-6" />
          {t('public.report.thanks')}
        </p>
        <p className="mt-2 text-ink">{t('public.report.thanksBody')}</p>
        <Button variant="secondary" className="mt-4" onClick={() => setSent(false)}>
          {t('public.report.another')}
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <TextField
        label={t('public.report.title')}
        required
        value={form.title}
        maxLength={200}
        placeholder={t('public.report.titlePlaceholder')}
        onChange={(e) => set('title')(e.target.value)}
        error={errors.title}
      />
      <TextArea
        label={t('public.report.description')}
        required
        rows={5}
        maxLength={5000}
        value={form.description}
        hint={t('public.report.descriptionHint')}
        onChange={(e) => set('description')(e.target.value)}
        error={errors.description}
      />
      <TextField
        label={t('public.report.feature')}
        value={form.feature}
        maxLength={200}
        placeholder={t('public.report.featurePlaceholder')}
        onChange={(e) => set('feature')(e.target.value)}
        error={errors.feature}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          label={t('public.report.name')}
          value={form.reporter_name}
          maxLength={100}
          autoComplete="name"
          onChange={(e) => set('reporter_name')(e.target.value)}
          error={errors.reporter_name}
        />
        <TextField
          label={t('public.report.contact')}
          value={form.contact}
          maxLength={200}
          autoComplete="email"
          hint={t('public.report.contactHint')}
          onChange={(e) => set('contact')(e.target.value)}
          error={errors.contact}
        />
      </div>
      {/* Robots fill every field; people never see this one. */}
      <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(e) => set('website')(e.target.value)}
          />
        </label>
      </div>
      <p className="text-sm text-ink-muted">{t('public.report.privacy')}</p>
      <FormAlert message={alert} />
      <Button type="submit" icon={Send} loading={send.isPending}>
        {t('public.report.send')}
      </Button>
    </form>
  )
}
