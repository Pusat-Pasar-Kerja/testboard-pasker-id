import {
  CYCLE_STATUSES,
  cycleCreateSchema,
  type CycleDto,
  type CycleStatus,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateStructure } from '../../hooks/structure-queries'
import { apiErrorText, apiFieldErrors } from '../../lib/api-errors'
import type { CycleInput } from '../../services/data-source'
import { useDataSource } from '../../services/use-data-source'
import { FormAlert, SelectField, TextArea, TextField } from '../ui/Form'
import { FormDialog } from '../ui/FormDialog'
import { useToast } from '../ui/toast-context'

interface PhaseForm {
  cycle_code: string
  title: string
  description: string
  starts_on: string
  ends_on: string
  status_code: CycleStatus
}

const EMPTY: PhaseForm = {
  cycle_code: '',
  title: '',
  description: '',
  starts_on: '',
  ends_on: '',
  status_code: 'PLANNED',
}

/**
 * Create or change a Fase (a folder at the top of the project, ADR 0019): a short code, a
 * name, an optional description and period. The status of an existing Fase is changed on
 * its page, with a confirmation.
 */
export function PhaseFormDialog({
  code,
  phase,
  onClose,
  onSaved,
}: {
  code: string
  /** The Fase to change; none = a new Fase. */
  phase?: CycleDto
  onClose: () => void
  onSaved?: (phase: CycleDto) => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<PhaseForm>(
    phase
      ? {
          cycle_code: phase.cycle_code,
          title: phase.title,
          description: phase.description ?? '',
          starts_on: phase.starts_on?.slice(0, 10) ?? '',
          ends_on: phase.ends_on?.slice(0, 10) ?? '',
          status_code: phase.status_code,
        }
      : EMPTY,
  )
  const [errors, setErrors] = useState<Partial<Record<keyof PhaseForm, string>>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const set = (key: keyof PhaseForm) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }))
    setErrors((e) => ({ ...e, [key]: undefined }))
  }

  const save = useMutation({
    mutationFn: (input: CycleInput) =>
      phase ? ds.updateCycle(code, phase.id, input) : ds.createCycle(code, input),
    onSuccess: async (saved) => {
      await invalidateStructure(queryClient, code)
      toast.show(t(phase ? 'phases.updated' : 'phases.created', { name: saved.title }))
      onSaved?.(saved)
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
    const input = {
      cycle_code: form.cycle_code.trim().toUpperCase(),
      title: form.title.trim(),
      description: form.description.trim() || null,
      starts_on: form.starts_on || null,
      ends_on: form.ends_on || null,
      status_code: form.status_code,
    }
    const result = cycleCreateSchema.safeParse(input)
    if (!result.success) {
      const next: Partial<Record<keyof PhaseForm, string>> = {}
      for (const issue of result.error.issues) {
        const key = String(issue.path[0] ?? '') as keyof PhaseForm
        next[key] =
          key === 'ends_on'
            ? t('pages.cycles.dateOrder')
            : issue.code === 'too_small'
              ? t('form.required')
              : key === 'cycle_code'
                ? t('pages.cycles.codeHint')
                : issue.message
      }
      setErrors(next)
      setFormError(t('form.invalid'))
      return
    }
    if (phase) {
      const { status_code: _status, ...changes } = input
      save.mutate(changes)
    } else {
      save.mutate(input)
    }
  }

  return (
    <FormDialog
      open
      title={phase ? t('phases.editTitle', { name: phase.title }) : t('phases.new')}
      description={phase ? undefined : t('phases.newIntro')}
      submitLabel={phase ? t('actions.save') : t('phases.create')}
      busy={save.isPending}
      onSubmit={submit}
      onCancel={onClose}
    >
      <TextField
        label={t('phases.name')}
        required
        value={form.title}
        onChange={(e) => set('title')(e.target.value)}
        error={errors.title}
        placeholder={t('phases.namePlaceholder')}
      />
      <TextField
        label={t('phases.code')}
        required
        value={form.cycle_code}
        onChange={(e) => set('cycle_code')(e.target.value.toUpperCase())}
        hint={t('phases.codeHint')}
        error={errors.cycle_code}
        autoComplete="off"
        autoCapitalize="characters"
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
      {!phase && (
        <SelectField
          label={t('fields.status')}
          required
          value={form.status_code}
          onChange={(e) => set('status_code')(e.target.value)}
          options={CYCLE_STATUSES.map((s) => ({ value: s, label: t(`codes.cycleStatus.${s}`) }))}
        />
      )}
      <FormAlert message={formError} />
    </FormDialog>
  )
}
