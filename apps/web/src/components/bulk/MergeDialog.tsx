import type { TestCaseMergeResult } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiErrorText } from '../../lib/api-errors'
import { useDataSource } from '../../services/use-data-source'
import { FormAlert } from '../ui/Form'
import { FormDialog } from '../ui/FormDialog'

export interface MergeCandidate {
  id: string
  case_code: string
  title: string
}

/**
 * Merge duplicates (ADR 0013): choose the test case to keep; every other one is archived
 * and points to it. Old run results stay as they were.
 */
export function MergeDialog({
  open,
  code,
  cases,
  defaultTargetId,
  onClose,
  onMerged,
}: {
  open: boolean
  code: string
  cases: MergeCandidate[]
  defaultTargetId?: string
  onClose: () => void
  onMerged: (result: TestCaseMergeResult) => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const [targetId, setTargetId] = useState(defaultTargetId ?? cases[0]?.id ?? '')
  const target = cases.find((c) => c.id === targetId) ?? cases[0]
  const sources = cases.filter((c) => c.id !== target?.id)

  const merge = useMutation({
    mutationFn: () =>
      ds.mergeTestCases(code, {
        target_id: target?.id ?? '',
        source_ids: sources.map((c) => c.id),
      }),
    onSuccess: async (result) => {
      await Promise.all(
        [
          ['test-cases', code],
          ['test-case', code],
          ['similar-cases', code],
        ].map((queryKey) => queryClient.invalidateQueries({ queryKey })),
      )
      onMerged(result)
    },
  })

  return (
    <FormDialog
      open={open}
      title={t('merge.title', { count: cases.length })}
      description={t('merge.description')}
      submitLabel={t('merge.submit', { count: sources.length, code: target?.case_code ?? '' })}
      busy={merge.isPending}
      onSubmit={() => merge.mutate()}
      onCancel={() => {
        merge.reset()
        onClose()
      }}
    >
      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold">{t('merge.keepWhich')}</legend>
        {cases.map((c) => (
          <label
            key={c.id}
            className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm ${
              c.id === target?.id ? 'border-brand-300 bg-brand-50' : 'border-line'
            }`}
          >
            <input
              type="radio"
              name="merge-target"
              className="mt-0.5 size-4 accent-brand-700"
              checked={c.id === target?.id}
              onChange={() => setTargetId(c.id)}
            />
            <span className="min-w-0">
              <span className="block font-mono text-xs text-brand-700">{c.case_code}</span>
              <span className="block break-words">{c.title}</span>
              <span className="block text-xs text-ink-muted">
                {c.id === target?.id ? t('merge.kept') : t('merge.archived')}
              </span>
            </span>
          </label>
        ))}
      </fieldset>
      <FormAlert message={merge.isError ? apiErrorText(t, merge.error) : null} />
    </FormDialog>
  )
}
