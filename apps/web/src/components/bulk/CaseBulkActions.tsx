import { TEST_CASE_PRIORITIES, type BulkResult, type CaseBulkInput } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useModules, useRuns } from '../../hooks/queries'
import { apiErrorText } from '../../lib/api-errors'
import { useDataSource } from '../../services/use-data-source'
import { BULK_SELECT } from '../ui/BulkBar'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/Dialog'
import { useToast } from '../ui/toast-context'

type CaseAction = 'ready' | 'draft' | 'set_module' | 'set_priority' | 'add_to_run' | 'archive'

/**
 * Bulk actions on selected test cases (ADR 0013): mark ready / draft, move to a module,
 * change priority, add to a run, archive. Every case gets its own new version.
 */
export function CaseBulkActions({
  code,
  ids,
  onDone,
}: {
  code: string
  ids: string[]
  onDone: (result: BulkResult) => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const modules = useModules(code)
  const runs = useRuns(code)
  const [action, setAction] = useState<CaseAction>('ready')
  const [value, setValue] = useState('')
  const [confirmArchive, setConfirmArchive] = useState(false)

  const openRuns = (runs.data ?? []).filter(
    (r) => r.status_code === 'PLANNED' || r.status_code === 'ACTIVE',
  )
  const valueOptions: Partial<Record<CaseAction, { value: string; label: string }[]>> = {
    set_module: (modules.data ?? []).map((m) => ({
      value: m.module_code,
      label: `${m.module_code} - ${m.name}`,
    })),
    set_priority: TEST_CASE_PRIORITIES.map((p) => ({
      value: p,
      label: t(`codes.casePriority.${p}`),
    })),
    add_to_run: openRuns.map((r) => ({ value: r.id, label: `${r.run_code} - ${r.name}` })),
  }
  const needsValue = action in valueOptions

  const apply = useMutation({
    mutationFn: async (): Promise<BulkResult> => {
      if (action === 'add_to_run') {
        const added = await ds.addRunCases(code, value, { test_case_ids: ids })
        return {
          updated: added.added,
          unchanged: added.skipped.filter((s) => s.reason === 'ALREADY_IN_RUN').length,
          skipped: added.skipped
            .filter((s) => s.reason !== 'ALREADY_IN_RUN')
            .map((s) => ({ id: s.test_case_id, code: '', reason: s.reason })),
        }
      }
      const input: CaseBulkInput =
        action === 'ready' || action === 'draft'
          ? {
              action: 'set_status',
              case_ids: ids,
              case_status: action === 'ready' ? 'READY' : 'DRAFT',
            }
          : action === 'archive'
            ? { action: 'archive', case_ids: ids }
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
    'set_module',
    'set_priority',
    'add_to_run',
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
          <option value="">
            {action === 'add_to_run' && openRuns.length === 0
              ? t('bulk.noOpenRun')
              : t('bulk.chooseValue')}
          </option>
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
        onClick={() => (action === 'archive' ? setConfirmArchive(true) : apply.mutate())}
      >
        {t('bulk.apply', { count: ids.length })}
      </Button>
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
