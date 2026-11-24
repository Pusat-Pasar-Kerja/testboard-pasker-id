import {
  WORKSHOP_FEATURE_STATES,
  type WorkshopBoardDto,
  type WorkshopFeatureState,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pencil, Save } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { invalidateStructure, usePhaseTree } from '../../../hooks/structure-queries'
import { apiErrorText } from '../../../lib/api-errors'
import { useDataSource } from '../../../services/use-data-source'
import { Button } from '../../ui/Button'
import { ConfirmDialog } from '../../ui/Dialog'
import { FormAlert } from '../../ui/Form'
import { EmptyState } from '../../ui/States'
import { useToast } from '../../ui/toast-context'
import { ProgressMeter } from '../ProgressMeter'

type Pending = { module_id: string; name: string; state_code: WorkshopFeatureState }

/**
 * Which features of the Fase this UAT tests (ADR 0019). Their Ready scenarios come along by
 * themselves; a feature taken out takes its untried scenarios with it (results always stay).
 */
function UatFeaturesEditor({ code, board }: { code: string; board: WorkshopBoardDto }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const tree = usePhaseTree(code)
  const phase = tree.data?.phases.find((p) => p.id === board.uat.phase?.id)
  const current = board.features.map((f) => f.module.id)
  const [editing, setEditing] = useState(false)
  const [chosen, setChosen] = useState<string[]>(current)
  const save = useMutation({
    mutationFn: () => ds.updateUat(code, board.uat.id, { module_ids: chosen }),
    onSuccess: async () => {
      await invalidateStructure(queryClient, code)
      await queryClient.invalidateQueries({ queryKey: ['public'] })
      toast.show(t('uat.features.saved'))
      setEditing(false)
    },
  })
  if (!editing) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-surface p-4">
        <p className="text-sm text-ink-muted">
          {t('uat.features.summary', {
            count: current.length,
            phase: board.uat.phase?.title ?? '',
          })}
        </p>
        <Button
          variant="secondary"
          icon={Pencil}
          onClick={() => {
            setChosen(current)
            setEditing(true)
          }}
        >
          {t('uat.features.edit')}
        </Button>
      </div>
    )
  }
  const options = phase?.features ?? []
  return (
    <fieldset className="space-y-3 rounded-xl border-2 border-brand-200 bg-brand-50/40 p-4">
      <legend className="px-1 font-semibold">{t('uat.features.editTitle')}</legend>
      <p className="text-sm text-ink-muted">{t('uat.features.editHint')}</p>
      {options.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('uat.create.noFeatures')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {options.map((f) => (
            <label
              key={f.module.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-surface px-3 hover:bg-neutral-soft"
            >
              <input
                type="checkbox"
                className="size-5 accent-brand-700"
                checked={chosen.includes(f.module.id)}
                onChange={() =>
                  setChosen((list) =>
                    list.includes(f.module.id)
                      ? list.filter((id) => id !== f.module.id)
                      : [...list, f.module.id],
                  )
                }
              />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-medium">{f.module.name}</span>
                <span className="block text-xs text-ink-muted">
                  {t('uat.create.readyOf', { ready: f.ready, count: f.scenarios })}
                </span>
              </span>
            </label>
          ))}
        </div>
      )}
      <FormAlert message={save.isError ? apiErrorText(t, save.error) : null} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={() => setEditing(false)}>
          {t('actions.cancel')}
        </Button>
        <Button
          icon={Save}
          loading={save.isPending}
          disabled={chosen.length === 0}
          onClick={() => save.mutate()}
        >
          {t('actions.save')}
        </Button>
      </div>
    </fieldset>
  )
}

/**
 * The features of a UAT: which ones it tests, and which are open, finished, or hidden from
 * the public. Every state change is confirmed first (audit 2026-11-24).
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
      ds.updateWorkshopFeature(code, board.uat.id, {
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
      await invalidateStructure(queryClient, code)
      await queryClient.invalidateQueries({ queryKey: ['public'] })
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })
  return (
    <div className="space-y-4">
      {canManage && <UatFeaturesEditor key={board.features.length} code={code} board={board} />}
      {board.features.length === 0 && <EmptyState description={t('workshop.board.noFeatures')} />}
      <p className="max-w-3xl text-sm text-ink-muted">{t('workshop.features.intro')}</p>
      <ul className="space-y-3">
        {board.features.map((feature) => (
          <li
            key={feature.module.id}
            className="grid gap-3 rounded-xl border border-line bg-surface p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-center"
          >
            <p className="font-semibold">{feature.module.name}</p>
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
