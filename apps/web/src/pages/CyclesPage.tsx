import {
  CYCLE_STATUSES,
  cycleCreateSchema,
  type CycleDto,
  type CycleStatus,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { Pencil, Plus, Presentation } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { CycleStatusBadge } from '../components/status/StatusBadges'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FormAlert, SelectField, TextArea, TextField } from '../components/ui/Form'
import { FormDialog } from '../components/ui/FormDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { useCycles } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { apiErrorText, apiFieldErrors } from '../lib/api-errors'
import { formatDate, toLocale } from '../lib/format'
import type { CycleInput } from '../services/data-source'
import { useDataSource } from '../services/use-data-source'

const EMPTY = {
  cycle_code: '',
  title: '',
  description: '',
  starts_on: '',
  ends_on: '',
  status_code: 'PLANNED' as CycleStatus,
}
type CycleForm = typeof EMPTY

function cycleInput(form: CycleForm) {
  return {
    cycle_code: form.cycle_code.trim().toUpperCase(),
    title: form.title,
    description: form.description || null,
    starts_on: form.starts_on || null,
    ends_on: form.ends_on || null,
    status_code: form.status_code,
  }
}

/** Field messages for an invalid cycle, or null when it is valid. */
function cycleErrors(
  t: TFunction,
  input: ReturnType<typeof cycleInput>,
): Partial<Record<keyof CycleForm, string>> | null {
  const result = cycleCreateSchema.safeParse(input)
  if (result.success) return null
  const next: Partial<Record<keyof CycleForm, string>> = {}
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '') as keyof CycleForm
    next[key] =
      key === 'ends_on'
        ? t('pages.cycles.dateOrder')
        : issue.code === 'too_small'
          ? t('form.required')
          : key === 'cycle_code'
            ? t('pages.cycles.codeHint')
            : issue.message
  }
  return next
}

/** Code, title, description and period of an existing cycle (status is changed on the card). */
function EditCycleDialog({
  code,
  cycle,
  onClose,
}: {
  code: string
  cycle: CycleDto
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CycleForm>({
    cycle_code: cycle.cycle_code,
    title: cycle.title,
    description: cycle.description ?? '',
    starts_on: cycle.starts_on?.slice(0, 10) ?? '',
    ends_on: cycle.ends_on?.slice(0, 10) ?? '',
    status_code: cycle.status_code,
  })
  const [errors, setErrors] = useState<Partial<Record<keyof CycleForm, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const set = (key: keyof CycleForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const save = useMutation({
    mutationFn: (input: CycleInput) => ds.updateCycle(code, cycle.id, input),
    onSuccess: async (updated) => {
      // Runs, bugs and filters show the cycle code too.
      await queryClient.invalidateQueries()
      toast.show(t('pages.cycles.updated', { code: updated.cycle_code }))
      onClose()
    },
    onError: (error) => {
      const fields = apiFieldErrors(error)
      if (fields.cycle_code) setErrors({ cycle_code: t('form.alreadyUsed') })
      setFormError(apiErrorText(t, error))
    },
  })

  const submit = () => {
    setFormError(null)
    const input = cycleInput(form)
    const next = cycleErrors(t, input)
    if (next) {
      setErrors(next)
      setFormError(t('form.invalid'))
      return
    }
    save.mutate({
      cycle_code: input.cycle_code,
      title: input.title,
      description: input.description,
      starts_on: input.starts_on,
      ends_on: input.ends_on,
    })
  }

  return (
    <FormDialog
      open
      title={t('pages.cycles.editTitle', { code: cycle.cycle_code })}
      submitLabel={t('actions.save')}
      busy={save.isPending}
      onSubmit={submit}
      onCancel={onClose}
    >
      <TextField
        label={t('fields.cycleCode')}
        required
        value={form.cycle_code}
        onChange={(e) => set('cycle_code')(e.target.value.toUpperCase())}
        hint={t('pages.cycles.editCodeHint')}
        error={errors.cycle_code}
        autoComplete="off"
      />
      <TextField
        label={t('fields.title')}
        required
        value={form.title}
        onChange={(e) => set('title')(e.target.value)}
        error={errors.title}
      />
      <TextArea
        label={t('fields.description')}
        value={form.description}
        onChange={(e) => set('description')(e.target.value)}
        rows={2}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          type="date"
          label={t('fields.startsOn')}
          value={form.starts_on}
          onChange={(e) => set('starts_on')(e.target.value)}
          error={errors.starts_on}
        />
        <TextField
          type="date"
          label={t('fields.endsOn')}
          value={form.ends_on}
          onChange={(e) => set('ends_on')(e.target.value)}
          error={errors.ends_on}
        />
      </div>
      <FormAlert message={formError} />
    </FormDialog>
  )
}

function NewCycleForm({ code }: { code: string }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<CycleForm>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof CycleForm, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)

  const set = (key: keyof CycleForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const create = useMutation({
    mutationFn: (input: CycleInput) => ds.createCycle(code, input),
    onSuccess: async (cycle) => {
      setForm(EMPTY)
      await queryClient.invalidateQueries({ queryKey: ['cycles', code] })
      toast.show(t('pages.cycles.created', { code: cycle.cycle_code }))
    },
    onError: (error) => {
      const fields = apiFieldErrors(error)
      if (fields.cycle_code) setErrors({ cycle_code: t('form.alreadyUsed') })
      setFormError(apiErrorText(t, error))
    },
  })

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setFormError(null)
    const input = cycleInput(form)
    const next = cycleErrors(t, input)
    if (next) {
      setErrors(next)
      setFormError(t('form.invalid'))
      return
    }
    create.mutate(input)
  }

  return (
    <Section title={t('pages.cycles.newHeading')}>
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          label={t('fields.cycleCode')}
          required
          value={form.cycle_code}
          onChange={(e) => set('cycle_code')(e.target.value)}
          hint={t('pages.cycles.codeHint')}
          error={errors.cycle_code}
          autoCapitalize="characters"
        />
        <TextField
          label={t('fields.title')}
          required
          value={form.title}
          onChange={(e) => set('title')(e.target.value)}
          error={errors.title}
        />
        <TextArea
          label={t('fields.description')}
          value={form.description}
          onChange={(e) => set('description')(e.target.value)}
          rows={2}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            type="date"
            label={t('fields.startsOn')}
            value={form.starts_on}
            onChange={(e) => set('starts_on')(e.target.value)}
            error={errors.starts_on}
          />
          <TextField
            type="date"
            label={t('fields.endsOn')}
            value={form.ends_on}
            onChange={(e) => set('ends_on')(e.target.value)}
            error={errors.ends_on}
          />
        </div>
        <SelectField
          label={t('fields.status')}
          required
          value={form.status_code}
          onChange={(e) => set('status_code')(e.target.value)}
          options={CYCLE_STATUSES.map((s) => ({ value: s, label: t(`codes.cycleStatus.${s}`) }))}
        />
        <FormAlert message={formError} />
        <Button type="submit" icon={Plus} loading={create.isPending} className="w-full">
          {t('actions.create')}
        </Button>
      </form>
    </Section>
  )
}

function CycleCard({ code, cycle, canEdit }: { code: string; cycle: CycleDto; canEdit: boolean }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  // A status change is confirmed first (audit 2026-11-24: nothing changes by accident).
  const [pendingStatus, setPendingStatus] = useState<CycleStatus | null>(null)
  const update = useMutation({
    mutationFn: (status_code: CycleStatus) => ds.updateCycle(code, cycle.id, { status_code }),
    onSettled: () => setPendingStatus(null),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['cycles', code] })
      toast.show(t('pages.cycles.updated', { code: updated.cycle_code }))
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })
  const period =
    cycle.starts_on || cycle.ends_on
      ? `${cycle.starts_on ? formatDate(cycle.starts_on, locale) : '…'} – ${
          cycle.ends_on ? formatDate(cycle.ends_on, locale) : '…'
        }`
      : t('fields.none')

  return (
    <li className="rounded-xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-brand-700">{cycle.cycle_code}</p>
          <h2 className="text-lg font-semibold break-words">{cycle.title}</h2>
          {cycle.description && (
            <p className="mt-1 text-sm whitespace-pre-line text-ink-muted">{cycle.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cycle.is_public && <Badge tone="success" label={t('workshop.publicOn')} />}
          <CycleStatusBadge status={cycle.status_code} />
        </div>
      </div>
      <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <dt className="text-xs text-ink-muted">{t('fields.period')}</dt>
          <dd className="tabular-nums">{period}</dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">{t('nav.workshop')}</dt>
          <dd>
            <Link
              to={projectPath(code, `workshop/${cycle.id}`)}
              className="inline-flex items-center gap-1 font-semibold text-brand-700 hover:underline"
            >
              <Presentation aria-hidden="true" className="size-4" />
              {t('workshop.open')}
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-muted">{t('fields.runCount')}</dt>
          <dd>
            <Link
              to={`${projectPath(code, 'runs')}?cycle=${encodeURIComponent(cycle.id)}`}
              className="font-semibold text-brand-700 hover:underline"
            >
              {t('pages.cycles.runs', { count: cycle.run_count ?? 0 })}
            </Link>
          </dd>
        </div>
      </dl>
      {canEdit && (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-56 max-w-full">
            <SelectField
              label={t('pages.cycles.statusLabel', { code: cycle.cycle_code })}
              required
              value={cycle.status_code}
              disabled={update.isPending}
              onChange={(e) => {
                const next = e.target.value as CycleStatus
                if (next !== cycle.status_code) setPendingStatus(next)
              }}
              options={CYCLE_STATUSES.map((s) => ({
                value: s,
                label: t(`codes.cycleStatus.${s}`),
              }))}
            />
          </div>
          <ConfirmDialog
            open={pendingStatus !== null}
            title={t('pages.cycles.statusConfirmTitle', {
              code: cycle.cycle_code,
              status: pendingStatus ? t(`codes.cycleStatus.${pendingStatus}`) : '',
            })}
            body={t('pages.cycles.statusConfirmBody')}
            confirmLabel={t('pages.cycles.statusConfirm')}
            tone="primary"
            busy={update.isPending}
            onConfirm={() => pendingStatus && update.mutate(pendingStatus)}
            onCancel={() => setPendingStatus(null)}
          />
          <Button
            variant="secondary"
            icon={Pencil}
            aria-label={t('pages.cycles.editTitle', { code: cycle.cycle_code })}
            onClick={() => setEditing(true)}
          >
            {t('pages.cycles.edit')}
          </Button>
        </div>
      )}
      {editing && <EditCycleDialog code={code} cycle={cycle} onClose={() => setEditing(false)} />}
    </li>
  )
}

export function CyclesPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const can = useCan(code)
  const cycles = useCycles(code)
  const canEdit = can('run.write')

  return (
    <>
      <PageHeader
        title={t('pages.cycles.title')}
        subtitle={t('pages.cycles.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('pages.cycles.title') }]}
      />
      <div
        className={`grid grid-cols-1 gap-6 ${canEdit ? 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]' : ''}`}
      >
        <div>
          {cycles.isPending && <LoadingState rows={3} />}
          {cycles.isError && (
            <ErrorState error={cycles.error} onRetry={() => void cycles.refetch()} />
          )}
          {cycles.isSuccess && cycles.data.length === 0 && (
            <EmptyState description={t('pages.cycles.empty')} />
          )}
          {cycles.isSuccess && cycles.data.length > 0 && (
            <ul className="space-y-4" aria-label={t('pages.cycles.title')}>
              {cycles.data.map((cycle) => (
                <CycleCard key={cycle.id} code={code} cycle={cycle} canEdit={canEdit} />
              ))}
            </ul>
          )}
        </div>
        {canEdit && (
          <div className="xl:sticky xl:top-20 xl:self-start">
            <NewCycleForm code={code} />
          </div>
        )}
      </div>
    </>
  )
}
