import { TEST_CASE_PRIORITIES, type BulkResult, type CaseBulkInput } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useCycles, useModules } from '../../hooks/queries'
import { apiErrorText } from '../../lib/api-errors'
import { useDataSource } from '../../services/use-data-source'
import { BULK_SELECT } from '../ui/BulkBar'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import { MergeDialog, type MergeCandidate } from './MergeDialog'
import { useToast } from '../ui/toast-context'

type CaseAction =
  | 'ready'
  | 'draft'
  | 'copy_to_phase'
  | 'move_to_phase'
  | 'set_module'
  | 'set_priority'
  | 'merge'
  | 'archive'

/** "Belum masuk fase" in the Fase list of "Pindahkan ke Fase". */
const NO_PHASE = 'none'

/**
 * Bulk actions on selected scenarios (ADR 0013, 0019): mark ready / draft, copy or move to a
 * Fase (like Salin / Pindahkan in Google Drive), move to a feature, change priority, merge,
 * archive. Every scenario gets its own new version; open UATs of a Fase follow by themselves.
 */
export function CaseBulkActions({
  code,
  ids,
  rows,
  onDone,
}: {
  code: string
  ids: string[]
  /** The selected cases (for the merge dialog). */
  rows: MergeCandidate[]
  onDone: (result: BulkResult) => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const modules = useModules(code)
  const cycles = useCycles(code)
  const [action, setAction] = useState<CaseAction>('ready')
  const [value, setValue] = useState('')
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [merging, setMerging] = useState(false)

  const phases = (cycles.data ?? []).map((c) => ({
    value: c.id,
    label: `${c.cycle_code} - ${c.title}`,
  }))
  const valueOptions: Partial<Record<CaseAction, { value: string; label: string }[]>> = {
    copy_to_phase: phases,
    move_to_phase: [...phases, { value: NO_PHASE, label: t('phases.unassigned') }],
    set_module: (modules.data ?? []).map((m) => ({
      value: m.module_code,
      label: `${m.module_code} - ${m.name}`,
    })),
    set_priority: TEST_CASE_PRIORITIES.map((p) => ({
      value: p,
      label: t(`codes.casePriority.${p}`),
    })),
  }
  const needsValue = action in valueOptions

  const apply = useMutation({
    mutationFn: async (): Promise<BulkResult> => {
      const input: CaseBulkInput =
        action === 'ready' || action === 'draft'
          ? {
              action: 'set_status',
              case_ids: ids,
              case_status: action === 'ready' ? 'READY' : 'DRAFT',
            }
          : action === 'archive'
            ? { action: 'archive', case_ids: ids }
            : action === 'copy_to_phase'
              ? { action: 'copy_to_phase', case_ids: ids, cycle_id: value }
              : action === 'move_to_phase'
                ? {
                    action: 'move_to_phase',
                    case_ids: ids,
                    cycle_id: value === NO_PHASE ? null : value,
                  }
                : action === 'set_module'
                  ? { action: 'set_module', case_ids: ids, module_code: value }
                  : {
                      action: 'set_priority',
                      case_ids: ids,
                      priority_code: value as (typeof TEST_CASE_PRIORITIES)[number],
                    }
      return ds.bulkTestCases(code, input)
    },
    onSuccess: async (result) => {
      setConfirmArchive(false)
      await Promise.all(
        [
          ['test-cases', code],
          ['test-case', code],
          ['phase-tree', code],
          ['uats', code],
          ['uat', code],
          ['runs', code],
          ['run', code],
          ['dashboard', code],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
      onDone(result)
    },
    onError: (error) => {
      setConfirmArchive(false)
      toast.show(apiErrorText(t, error), 'error')
    },
  })

  const actions: CaseAction[] = [
    'ready',
    'draft',
    'copy_to_phase',
    'move_to_phase',
    'set_module',
    'set_priority',
    ...(ids.length >= 2 ? (['merge'] as const) : []),
    'archive',
  ]
  return (
    <>
      <select
        aria-label={t('bulk.action')}
        className={BULK_SELECT}
        value={action}
        onChange={(e) => {
          setAction(e.target.value as CaseAction)
          setValue('')
        }}
      >
        {actions.map((a) => (
          <option key={a} value={a}>
            {t(`bulk.caseActions.${a}`)}
          </option>
        ))}
      </select>
      {needsValue && (
        <select
          aria-label={t('bulk.newValue')}
          className={BULK_SELECT}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        >
          <option value="">{t('bulk.chooseValue')}</option>
          {(valueOptions[action] ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      <Button
        icon={Check}
        disabled={needsValue && !value}
        loading={apply.isPending && !confirmArchive}
        onClick={() =>
          action === 'archive'
            ? setConfirmArchive(true)
            : action === 'merge'
              ? setMerging(true)
              : apply.mutate()
        }
      >
        {t('bulk.apply', { count: ids.length })}
      </Button>
      {merging && (
        <MergeDialog
          open
          code={code}
          cases={rows}
          onClose={() => setMerging(false)}
          onMerged={(result) => {
            setMerging(false)
            onDone({ updated: result.merged.length, unchanged: 0, skipped: [] })
          }}
        />
      )}
      <ConfirmDialog
        open={confirmArchive}
        title={t('bulk.archiveTitle', { count: ids.length })}
        body={t('bulk.archiveBody')}
        confirmLabel={t('bulk.caseActions.archive')}
        busy={apply.isPending}
        onConfirm={() => apply.mutate()}
        onCancel={() => setConfirmArchive(false)}
      />
    </>
  )
}
