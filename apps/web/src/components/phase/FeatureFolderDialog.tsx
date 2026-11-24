import { phaseFeatureSchema, type PhaseDto } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModules } from '../../hooks/queries'
import { invalidateStructure } from '../../hooks/structure-queries'
import { apiErrorText } from '../../lib/api-errors'
import { useDataSource } from '../../services/use-data-source'
import { FormAlert, SelectField, TextField } from '../ui/Form'
import { FormDialog } from '../ui/FormDialog'
import { useToast } from '../ui/toast-context'

const NEW = '__new__'

/**
 * A feature folder inside a Fase (ADR 0019): one of the project's features, or a new one.
 * The folder can stay empty until scenarios are written or imported into it.
 */
export function FeatureFolderDialog({
  code,
  phase,
  onClose,
}: {
  code: string
  phase: PhaseDto & { id: string }
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const modules = useModules(code)
  const inPhase = new Set(phase.features.map((f) => f.module.id))
  const available = (modules.data ?? []).filter((m) => !inPhase.has(m.id))
  const [choice, setChoice] = useState('')
  const [moduleCode, setModuleCode] = useState('')
  const [name, setName] = useState('')
  const [errors, setErrors] = useState<{ choice?: string; module_code?: string; name?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)
  const isNew = choice === NEW || (modules.isSuccess && available.length === 0)

  const add = useMutation({
    mutationFn: (input: { module_code: string; name?: string }) =>
      ds.addPhaseFeature(code, phase.id, input),
    onSuccess: async () => {
      await invalidateStructure(queryClient, code)
      toast.show(t('phases.featureAdded', { phase: phase.title ?? '' }))
      onClose()
    },
    onError: (error) => setFormError(apiErrorText(t, error)),
  })

  const submit = () => {
    setFormError(null)
    if (!isNew) {
      const module = available.find((m) => m.id === choice)
      if (!module) {
        setErrors({ choice: t('form.required') })
        return
      }
      add.mutate({ module_code: module.module_code })
      return
    }
    const input = { module_code: moduleCode.trim(), name: name.trim() }
    const result = phaseFeatureSchema.safeParse(input)
    const next: typeof errors = {}
    if (!input.name) next.name = t('form.required')
    if (!result.success) {
      next.module_code = input.module_code ? t('phases.featureCodeHint') : t('form.required')
    }
    if (Object.keys(next).length > 0) {
      setErrors(next)
      setFormError(t('form.invalid'))
      return
    }
    add.mutate(input)
  }

  return (
    <FormDialog
      open
      title={t('phases.addFeatureTitle', { phase: phase.title ?? '' })}
      description={t('phases.addFeatureIntro')}
      submitLabel={t('phases.addFeature')}
      busy={add.isPending}
      onSubmit={submit}
      onCancel={onClose}
    >
      {available.length > 0 && (
        <SelectField
          label={t('fields.feature')}
          required
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value)
            setErrors({})
          }}
          error={errors.choice}
          options={[
            { value: '', label: t('phases.chooseFeature') },
            ...available.map((m) => ({ value: m.id, label: m.name })),
            { value: NEW, label: t('phases.newFeature') },
          ]}
        />
      )}
      {isNew && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <TextField
            label={t('phases.featureName')}
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value)
              setErrors((x) => ({ ...x, name: undefined }))
            }}
            error={errors.name}
            placeholder={t('phases.featureNamePlaceholder')}
          />
          <TextField
            label={t('phases.featureCode')}
            required
            value={moduleCode}
            onChange={(e) => {
              setModuleCode(e.target.value.toUpperCase())
              setErrors((x) => ({ ...x, module_code: undefined }))
            }}
            error={errors.module_code}
            hint={t('phases.featureCodeHint')}
            autoCapitalize="characters"
            autoComplete="off"
          />
        </div>
      )}
      <FormAlert message={formError} />
    </FormDialog>
  )
}
