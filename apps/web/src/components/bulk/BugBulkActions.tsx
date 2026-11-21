import {
  DEFECT_PRIORITIES,
  DEFECT_REASON_REQUIRED,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  type BulkResult,
  type DefectBulkInput,
  type DefectStatus,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateDefectData, useCycles, useMembers, useModules } from '../../hooks/queries'
import { apiErrorText } from '../../lib/api-errors'
import { useDataSource } from '../../services/use-data-source'
import { BULK_SELECT } from '../ui/BulkBar'
import { Button } from '../ui/Button'
import { useToast } from '../ui/toast-context'

type BulkField =
  'status' | 'severity_code' | 'priority_code' | 'module_id' | 'cycle_id' | 'assigned_to'

/** No bug is ever moved back INTO "open"; every other status follows the workflow. */
const TARGET_STATUSES = DEFECT_STATUSES.filter(
  (s): s is Exclude<DefectStatus, 'OPEN'> => s !== 'OPEN',
)

/**
 * Change one property of all selected bugs (ADR 0013). Leads can change every property;
 * other roles only the status. Each bug follows its own rules; refused ones are reported.
 */
export function BugBulkActions({
  code,
  ids,
  isLead,
  onDone,
}: {
  code: string
  ids: string[]
  isLead: boolean
  onDone: (result: BulkResult) => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const modules = useModules(code)
  const cycles = useCycles(code)
  const members = useMembers(code)
  const [field, setField] = useState<BulkField>('status')
  const [value, setValue] = useState('')
  const [comment, setComment] = useState('')

  const options: Record<BulkField, { value: string; label: string }[]> = {
    status: TARGET_STATUSES.map((s) => ({ value: s, label: t(`codes.defectStatus.${s}`) })),
    severity_code: DEFECT_SEVERITIES.map((s) => ({ value: s, label: t(`codes.severity.${s}`) })),
    priority_code: DEFECT_PRIORITIES.map((p) => ({
      value: p,
      label: t(`codes.defectPriority.${p}`),
    })),
    module_id: [
      { value: 'none', label: t('pages.bugForm.noModule') },
      ...(modules.data ?? []).map((m) => ({ value: m.id, label: `${m.module_code} - ${m.name}` })),
    ],
    cycle_id: [
      { value: 'none', label: t('pages.bugForm.noCycle') },
      ...(cycles.data ?? []).map((cy) => ({
        value: cy.id,
        label: `${cy.cycle_code} - ${cy.title}`,
      })),
    ],
    assigned_to: [
      { value: 'none', label: t('pages.bugs.unassigned') },
      ...(members.data ?? [])
        .filter((m) => m.role_code !== 'VIEWER')
        .map((m) => ({ value: m.user.id, label: m.user.display_name })),
    ],
  }
  const fields: BulkField[] = isLead
    ? ['status', 'severity_code', 'priority_code', 'module_id', 'cycle_id', 'assigned_to']
    : ['status']
  const needsReason = field === 'status' && DEFECT_REASON_REQUIRED.includes(value as DefectStatus)

  const apply = useMutation({
    mutationFn: () => {
      const input: DefectBulkInput =
        field === 'status'
          ? {
              action: 'status',
              defect_ids: ids,
              status_code: value as DefectStatus,
              comment: comment || undefined,
            }
          : {
              action: 'update',
              defect_ids: ids,
              changes: { [field]: value === 'none' ? null : value },
            }
      return ds.bulkDefects(code, input)
    },
    onSuccess: async (result) => {
      await invalidateDefectData(queryClient, code)
      setComment('')
      onDone(result)
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })

  return (
    <>
      <select
        aria-label={t('bulk.property')}
        className={BULK_SELECT}
        value={field}
        onChange={(e) => {
          setField(e.target.value as BulkField)
          setValue('')
        }}
      >
        {fields.map((f) => (
          <option key={f} value={f}>
            {t(`bulk.bugFields.${f}`)}
          </option>
        ))}
      </select>
      <select
        aria-label={t('bulk.newValue')}
        className={BULK_SELECT}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      >
        <option value="">{t('bulk.chooseValue')}</option>
        {options[field].map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {needsReason && (
        <input
          aria-label={t('bulk.reason')}
          placeholder={t('bulk.reason')}
          className={`${BULK_SELECT} min-w-48`}
          value={comment}
          maxLength={1000}
          onChange={(e) => setComment(e.target.value)}
        />
      )}
      <Button
        icon={Check}
        disabled={!value || (needsReason && !comment.trim())}
        loading={apply.isPending}
        onClick={() => apply.mutate()}
      >
        {t('bulk.apply', { count: ids.length })}
      </Button>
    </>
  )
}
