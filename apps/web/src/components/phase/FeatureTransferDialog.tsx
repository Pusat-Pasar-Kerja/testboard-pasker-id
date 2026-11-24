import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Copy, FolderInput } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateStructure, usePhaseTree } from '../../hooks/structure-queries'
import { apiErrorText } from '../../lib/api-errors'
import { useDataSource } from '../../services/use-data-source'
import { FormAlert } from '../ui/Form'
import { FormDialog } from '../ui/FormDialog'
import { useToast } from '../ui/toast-context'
import { NO_PHASE, PhasePicker } from './PhasePicker'

type Mode = 'move' | 'copy'

/**
 * Copy or move whole feature folders - with every scenario in them - to another Fase, like
 * Salin / Pindahkan in Google Drive (ADR 0020). Opened from a folder's button, the selection
 * bar, or by dropping folders on a Fase in the left panel.
 */
export function FeatureTransferDialog({
  code,
  from,
  features,
  initialTarget = '',
  initialMode = 'move',
  onClose,
  onDone,
}: {
  code: string
  /** The Fase the folders come from; null = "Belum masuk Fase". */
  from: string | null
  features: { id: string; name: string }[]
  initialTarget?: string
  initialMode?: Mode
  onClose: () => void
  onDone?: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const tree = usePhaseTree(code)
  const [mode, setMode] = useState<Mode>(initialMode)
  const [target, setTarget] = useState(initialTarget)
  const [error, setError] = useState<string | null>(null)
  const [alert, setAlert] = useState<string | null>(null)
  const targetName =
    target === NO_PHASE
      ? t('phases.unassigned')
      : (tree.data?.phases.find((p) => p.id === target)?.title ?? '')

  const send = useMutation({
    mutationFn: () =>
      ds.transferPhaseFeatures(code, {
        from_cycle_id: from,
        to_cycle_id: target === NO_PHASE ? null : target,
        module_ids: features.map((f) => f.id),
        mode,
      }),
    onSuccess: async (result) => {
      await invalidateStructure(queryClient, code)
      toast.show(
        t(mode === 'move' ? 'phases.transfer.doneMove' : 'phases.transfer.doneCopy', {
          count: result.features,
          scenarios: result.scenarios,
          target: targetName,
        }),
      )
      onDone?.()
      onClose()
    },
    onError: (e) => setAlert(apiErrorText(t, e)),
  })

  const submit = () => {
    setAlert(null)
    if (!target || (mode === 'copy' && target === NO_PHASE)) {
      setError(t('phases.transfer.chooseTarget'))
      return
    }
    send.mutate()
  }

  return (
    <FormDialog
      open
      title={t('phases.transfer.title', { count: features.length })}
      description={t('phases.transfer.features', {
        names: features.map((f) => f.name).join(', '),
      })}
      submitLabel={
        mode === 'move' ? t('phases.transfer.submitMove') : t('phases.transfer.submitCopy')
      }
      busy={send.isPending}
      onSubmit={submit}
      onCancel={onClose}
    >
      <fieldset>
        <legend className="mb-2 text-sm font-medium">{t('phases.transfer.modeLabel')}</legend>
        <div className="grid grid-cols-2 gap-2">
          {(['move', 'copy'] as const).map((value) => {
            const Icon = value === 'move' ? FolderInput : Copy
            return (
              <label
                key={value}
                className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border px-3 font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-brand-300 ${
                  mode === value
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : 'border-line-strong bg-surface text-ink hover:bg-brand-50'
                }`}
              >
                <input
                  type="radio"
                  name="transfer-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => {
                    setMode(value)
                    setError(null)
                    if (value === 'copy' && target === NO_PHASE) setTarget('')
                  }}
                  className="sr-only"
                />
                <Icon aria-hidden="true" className="size-5" />
                {value === 'move' ? t('phases.transfer.move') : t('phases.transfer.copy')}
              </label>
            )
          })}
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          {mode === 'move' ? t('phases.transfer.moveHint') : t('phases.transfer.copyHint')}
        </p>
      </fieldset>
      <PhasePicker
        code={code}
        value={target}
        onChange={(value) => {
          setTarget(value)
          setError(null)
        }}
        exclude={from ?? NO_PHASE}
        allowUnassigned={mode === 'move'}
        error={error ?? undefined}
      />
      <FormAlert message={alert} />
    </FormDialog>
  )
}
