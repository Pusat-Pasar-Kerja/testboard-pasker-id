import { uatCreateSchema, type PhaseDto } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Folder, FolderPlus, TestTubeDiagonal } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { Button, ButtonLink } from '../components/ui/Button'
import { FormAlert, TextField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { invalidateStructure, usePhaseTree, useUats } from '../hooks/structure-queries'
import { apiErrorText } from '../lib/api-errors'
import { fromLocalInput } from '../lib/workshop'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

function Step({
  number,
  title,
  hint,
  children,
}: {
  number: number
  title: string
  hint?: string
  children: ReactNode
}) {
  return (
    <section
      aria-labelledby={`step-${number}`}
      className="rounded-xl border border-line bg-surface p-5 shadow-xs"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">
          {number}
        </span>
        <div>
          <h2 id={`step-${number}`} className="text-lg font-semibold">
            {title}
          </h2>
          {hint && <p className="text-sm text-ink-muted">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

/**
 * A new UAT in three steps (ADR 0019): choose the Fase, choose its features, give it a
 * name. The Ready scenarios of those features come along; people and groups come next.
 */
export function UatCreatePage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const can = useCan(code)
  const manager = can('run.write')
  const ds = useDataSource()
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [params] = useSearchParams()
  const tree = usePhaseTree(code, manager)
  const uats = useUats(code, manager)
  const [phaseId, setPhaseId] = useState(params.get('fase') ?? '')
  const [chosen, setChosen] = useState<string[] | null>(null)
  const [name, setName] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [errors, setErrors] = useState<{ phase?: string; features?: string; name?: string }>({})
  const [formError, setFormError] = useState<string | null>(null)

  const create = useMutation({
    mutationFn: (input: Parameters<typeof ds.createUat>[1]) => ds.createUat(code, input),
    onSuccess: async (uat) => {
      await invalidateStructure(queryClient, code)
      toast.show(t('uat.created', { name: uat.name }))
      navigate(`${projectPath(code, `uat/${uat.id}`)}?tab=peserta`)
    },
    onError: (error) => setFormError(apiErrorText(t, error)),
  })

  if (!manager) return <NotFoundPage />
  if (tree.isPending) return <LoadingState rows={5} />
  if (tree.isError) return <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />
  const phases = tree.data.phases
  const phase: PhaseDto | undefined = phases.find((p) => p.id === phaseId)
  const features = phase?.features ?? []
  // Until the Admin touches the list, every feature with Ready scenarios is ticked.
  const selected = chosen ?? features.filter((f) => f.ready > 0).map((f) => f.module.id)
  const readyChosen = features
    .filter((f) => selected.includes(f.module.id))
    .reduce((sum, f) => sum + f.ready, 0)
  const suggested = phase
    ? t('uat.create.defaultName', {
        n: (uats.data ?? []).filter((u) => u.phase?.id === phase.id).length + 1,
        phase: phase.title,
      })
    : ''

  const submit = () => {
    setFormError(null)
    const input = {
      cycle_id: phaseId,
      name: (name || suggested).trim(),
      module_ids: selected,
      starts_at: fromLocalInput(startsAt),
      ends_at: fromLocalInput(endsAt),
    }
    const next: typeof errors = {}
    if (!phase) next.phase = t('uat.create.choosePhase')
    if (selected.length === 0) next.features = t('uat.create.chooseFeatures')
    if (!input.name) next.name = t('form.required')
    setErrors(next)
    if (Object.keys(next).length > 0) {
      setFormError(t('form.invalid'))
      return
    }
    const parsed = uatCreateSchema.safeParse(input)
    if (!parsed.success) {
      setFormError(t('uat.create.dateOrder'))
      return
    }
    create.mutate(input)
  }

  return (
    <>
      <PageHeader
        title={t('uat.new')}
        subtitle={t('uat.create.subtitle')}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('uat.title'), to: projectPath(code, 'uat') },
          { label: t('uat.new') },
        ]}
      />
      {phases.length === 0 ? (
        <EmptyState
          title={t('uat.create.noPhasesTitle')}
          description={t('uat.create.noPhases')}
          action={
            <ButtonLink to={`${projectPath(code, 'fase')}?baru=1`} icon={FolderPlus}>
              {t('phases.new')}
            </ButtonLink>
          }
        />
      ) : (
        <div className="max-w-4xl space-y-5">
          <Step number={1} title={t('uat.create.step1')} hint={t('uat.create.step1Hint')}>
            <fieldset>
              <legend className="sr-only">{t('uat.create.step1')}</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {phases.map((p) => (
                  <label
                    key={p.id}
                    className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                      p.id === phaseId
                        ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-200'
                        : 'border-line hover:bg-neutral-soft'
                    }`}
                  >
                    <input
                      type="radio"
                      name="phase"
                      className="size-5 accent-brand-700"
                      checked={p.id === phaseId}
                      onChange={() => {
                        setPhaseId(p.id ?? '')
                        setChosen(null)
                        setErrors({})
                      }}
                    />
                    <Folder aria-hidden="true" className="size-5 shrink-0 text-brand-600" />
                    <span className="min-w-0">
                      <span className="block font-semibold break-words">{p.title}</span>
                      <span className="block text-xs text-ink-muted">
                        {t('phases.featureCount', { count: p.features.length })} ·{' '}
                        {t('phases.scenarioCount', { count: p.scenarios })}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
              {errors.phase && (
                <p className="mt-2 text-sm font-medium text-danger">{errors.phase}</p>
              )}
            </fieldset>
          </Step>

          <Step number={2} title={t('uat.create.step2')} hint={t('uat.create.step2Hint')}>
            {!phase ? (
              <p className="text-sm text-ink-muted">{t('uat.create.pickPhaseFirst')}</p>
            ) : features.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('uat.create.noFeatures')}</p>
            ) : (
              <fieldset>
                <legend className="sr-only">{t('uat.create.step2')}</legend>
                <div className="mb-2 flex flex-wrap gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setChosen(features.map((f) => f.module.id))}
                  >
                    {t('uat.create.all')}
                  </Button>
                  <Button variant="ghost" onClick={() => setChosen([])}>
                    {t('uat.create.none')}
                  </Button>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {features.map((f) => (
                    <label
                      key={f.module.id}
                      className="flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border border-line p-3 hover:bg-neutral-soft"
                    >
                      <input
                        type="checkbox"
                        className="size-5 accent-brand-700"
                        checked={selected.includes(f.module.id)}
                        onChange={() =>
                          setChosen(
                            selected.includes(f.module.id)
                              ? selected.filter((id) => id !== f.module.id)
                              : [...selected, f.module.id],
                          )
                        }
                      />
                      <span className="min-w-0">
                        <span className="block font-semibold break-words">{f.module.name}</span>
                        <span
                          className={`block text-xs ${f.ready === 0 ? 'text-warning' : 'text-ink-muted'}`}
                        >
                          {f.ready === 0
                            ? t('uat.create.noReady')
                            : t('uat.create.readyOf', { ready: f.ready, count: f.scenarios })}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {errors.features && (
                  <p className="mt-2 text-sm font-medium text-danger">{errors.features}</p>
                )}
                <p className="mt-3 text-sm text-ink-muted">
                  {t('uat.create.willTake', { count: readyChosen })}
                </p>
              </fieldset>
            )}
          </Step>

          <Step number={3} title={t('uat.create.step3')} hint={t('uat.create.step3Hint')}>
            <div className="space-y-4">
              <TextField
                label={t('uat.name')}
                required
                value={name}
                placeholder={suggested}
                maxLength={255}
                hint={suggested ? t('uat.create.nameHint', { name: suggested }) : undefined}
                onChange={(e) => setName(e.target.value)}
                error={errors.name}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextField
                  type="datetime-local"
                  label={t('uat.startsAt')}
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                />
                <TextField
                  type="datetime-local"
                  label={t('uat.endsAt')}
                  value={endsAt}
                  onChange={(e) => setEndsAt(e.target.value)}
                />
              </div>
            </div>
          </Step>

          <FormAlert message={formError} />
          <div className="flex flex-wrap justify-end gap-2">
            <ButtonLink to={projectPath(code, 'uat')} variant="secondary">
              {t('actions.cancel')}
            </ButtonLink>
            <Button icon={TestTubeDiagonal} loading={create.isPending} onClick={submit}>
              {t('uat.create.submit')}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}
