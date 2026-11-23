import {
  WORKSHOP_FEATURE_STATES,
  type WorkshopBoardDto,
  type WorkshopFeatureState,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { apiErrorText } from '../../../lib/api-errors'
import { useDataSource } from '../../../services/use-data-source'
import { ConfirmDialog } from '../../ui/Dialog'
import { EmptyState } from '../../ui/States'
import { useToast } from '../../ui/toast-context'
import { ProgressMeter } from '../ProgressMeter'

type Pending = { module_id: string; name: string; state_code: WorkshopFeatureState }

/**
 * Which features of the Fase are open for the workshop, finished, or hidden from the public.
 * Every change is confirmed first (audit 2026-11-24): it changes what the public page shows.
 */
export function FeaturesTab({
  code,
  board,
  canManage,
}: {
  code: string
  board: WorkshopBoardDto
  canManage: boolean
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Pending | null>(null)
  const change = useMutation({
    mutationFn: (input: Pending) =>
      ds.updateWorkshopFeature(code, board.cycle.id, {
        module_id: input.module_id,
        state_code: input.state_code,
      }),
    onSuccess: async (_, input) => {
      setPending(null)
      toast.show(
        t('workshop.features.changed', {
          name: input.name,
          state: t(`workshop.features.state.${input.state_code}`),
        }),
      )
      await queryClient.invalidateQueries({ queryKey: ['workshop-board', code, board.cycle.id] })
      await queryClient.invalidateQueries({ queryKey: ['public'] })
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })
  if (board.features.length === 0)
    return <EmptyState description={t('workshop.board.noFeatures')} />
  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm text-ink-muted">{t('workshop.features.intro')}</p>
      <ul className="space-y-3">
        {board.features.map((feature) => (
          <li
            key={feature.module.id}
            className="grid gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
          >
            <p className="font-semibold">
              <span className="font-mono text-sm text-brand-700">{feature.module.module_code}</span>{' '}
              {feature.module.name}
            </p>
            <ProgressMeter counts={feature.progress} size="sm" />
            <div
              role="radiogroup"
              aria-label={t('workshop.features.stateFor', { name: feature.module.name })}
              className="flex gap-1"
            >
              {WORKSHOP_FEATURE_STATES.map((state) => (
                <button
                  key={state}
                  type="button"
                  role="radio"
                  aria-checked={feature.state === state}
                  disabled={!canManage || change.isPending}
                  onClick={() => {
                    if (feature.state === state) return
                    setPending({
                      module_id: feature.module.id,
                      name: feature.module.name,
                      state_code: state,
                    })
                  }}
                  className={`min-h-10 rounded-lg px-3 text-sm font-semibold ${
                    feature.state === state
                      ? 'bg-brand-700 text-white'
                      : 'border border-line-strong bg-surface hover:bg-neutral-soft disabled:opacity-60'
                  }`}
                >
                  {t(`workshop.features.state.${state}`)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={pending !== null}
        title={
          pending
            ? t('workshop.features.confirmTitle', {
                name: pending.name,
                state: t(`workshop.features.state.${pending.state_code}`),
              })
            : ''
        }
        body={pending ? t(`workshop.features.confirmBody.${pending.state_code}`) : undefined}
        confirmLabel={t('workshop.features.confirm')}
        tone="primary"
        busy={change.isPending}
        onConfirm={() => pending && change.mutate(pending)}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}
