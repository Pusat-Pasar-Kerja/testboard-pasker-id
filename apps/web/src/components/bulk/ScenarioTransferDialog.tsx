import type { BulkResult } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateStructure } from '../../hooks/structure-queries'
import { apiErrorText } from '../../lib/api-errors'
import { useDataSource } from '../../services/use-data-source'
import { NO_PHASE, PhasePicker } from '../phase/PhasePicker'
import { FormAlert } from '../ui/Form'
import { FormDialog } from '../ui/FormDialog'

/**
 * "Salin ke Fase" / "Pindahkan ke Fase" for the selected scenarios (ADR 0019, 0020): choose the
 * target Fase as a card, like Salin / Pindahkan in Google Drive.
 */
export function ScenarioTransferDialog({
  code,
  ids,
  mode,
  onClose,
  onDone,
}: {
  code: string
  ids: string[]
  mode: 'copy' | 'move'
  onClose: () => void
  onDone: (result: BulkResult) => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const [target, setTarget] = useState('')
  const [error, setError] = useState<string | null>(null)
  const send = useMutation({
    mutationFn: () =>
      ds.bulkTestCases(
        code,
        mode === 'copy'
          ? { action: 'copy_to_phase', case_ids: ids, cycle_id: target }
          : {
              action: 'move_to_phase',
              case_ids: ids,
              cycle_id: target === NO_PHASE ? null : target,
            },
      ),
    onSuccess: async (result) => {
      await invalidateStructure(queryClient, code)
      await queryClient.invalidateQueries({ queryKey: ['test-case', code] })
      onDone(result)
      onClose()
    },
  })
  return (
    <FormDialog
      open
      title={t(
        mode === 'copy' ? 'phases.transfer.copyScenarios' : 'phases.transfer.moveScenarios',
        {
          count: ids.length,
        },
      )}
      description={
        mode === 'copy'
          ? t('phases.transfer.copyScenariosHint')
          : t('phases.transfer.moveScenariosHint')
      }
      submitLabel={
        mode === 'copy' ? t('phases.transfer.submitCopy') : t('phases.transfer.submitMove')
      }
      busy={send.isPending}
      onSubmit={() => {
        if (!target) {
          setError(t('phases.transfer.chooseTarget'))
          return
        }
        send.mutate()
      }}
      onCancel={onClose}
    >
      <PhasePicker
        code={code}
        value={target}
        onChange={(value) => {
          setTarget(value)
          setError(null)
        }}
        allowUnassigned={mode === 'move'}
        error={error ?? undefined}
      />
      <FormAlert message={send.isError ? apiErrorText(t, send.error) : null} />
    </FormDialog>
  )
}
