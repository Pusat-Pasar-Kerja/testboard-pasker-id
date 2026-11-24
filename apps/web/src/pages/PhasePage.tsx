import { CYCLE_STATUSES, type CycleStatus, type PhaseDto } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Folder, FolderPlus, ListChecks, Pencil, Plus, TestTubeDiagonal } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { FeatureFolderDialog } from '../components/phase/FeatureFolderDialog'
import { PhaseFormDialog } from '../components/phase/PhaseFormDialog'
import { CycleStatusBadge } from '../components/status/StatusBadges'
import { UatCard } from '../components/uat/UatCard'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { SelectField } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { useCycles } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { invalidateStructure, usePhaseTree, useUats } from '../hooks/structure-queries'
import { apiErrorText } from '../lib/api-errors'
import { formatDate, toLocale } from '../lib/format'
import { UNASSIGNED_PHASE } from '../lib/uat'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

/** The feature folders of a Fase, like sub-folders in Google Drive. */
function FeatureFolders({ code, phase }: { code: string; phase: PhaseDto }) {
  const { t } = useTranslation()
  const base = `fase/${phase.id ?? UNASSIGNED_PHASE}`
  if (phase.features.length === 0) {
    return <p className="text-sm text-ink-muted">{t('phases.noFeatures')}</p>
  }
  return (
    <ul
      aria-label={t('phases.featuresHeading')}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
    >
      {phase.features.map((feature) => (
        <li
          key={feature.module.id}
          className="relative flex items-center gap-3 rounded-xl border border-line bg-surface p-4 shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-brand-500 hover:shadow-md"
        >
          <span
            aria-hidden="true"
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700"
          >
            <Folder className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <Link
              to={projectPath(code, `${base}/fitur/${feature.module.id}`)}
              className="block truncate font-semibold after:absolute after:inset-0 after:rounded-xl focus:outline-none"
            >
              {feature.module.name}
            </Link>
            <p className="text-xs text-ink-muted">
              {feature.module.module_code} ·{' '}
              {t('phases.scenarioCount', { count: feature.scenarios })}
              {feature.scenarios > 0 && ` · ${t('phases.readyCount', { count: feature.ready })}`}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Status of a Fase, changed with a confirmation (nothing changes by accident). */
function PhaseStatus({ code, phase }: { code: string; phase: PhaseDto & { id: string } }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<CycleStatus | null>(null)
  const update = useMutation({
    mutationFn: (status_code: CycleStatus) => ds.updateCycle(code, phase.id, { status_code }),
    onSettled: () => setPending(null),
    onSuccess: async (saved) => {
      await invalidateStructure(queryClient, code)
      toast.show(t('phases.updated', { name: saved.title }))
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })
  return (
    <div className="w-52 max-w-full">
      <SelectField
        label={t('phases.status')}
        required
        value={phase.status_code ?? 'PLANNED'}
        disabled={update.isPending}
        onChange={(e) => {
          const next = e.target.value as CycleStatus
          if (next !== phase.status_code) setPending(next)
        }}
        options={CYCLE_STATUSES.map((s) => ({ value: s, label: t(`codes.cycleStatus.${s}`) }))}
      />
      <ConfirmDialog
        open={pending !== null}
        title={t('pages.cycles.statusConfirmTitle', {
          code: phase.title ?? '',
          status: pending ? t(`codes.cycleStatus.${pending}`) : '',
        })}
        body={t('pages.cycles.statusConfirmBody')}
        confirmLabel={t('pages.cycles.statusConfirm')}
        tone="primary"
        busy={update.isPending}
        onConfirm={() => pending && update.mutate(pending)}
        onCancel={() => setPending(null)}
      />
    </div>
  )
}

/**
 * Inside one Fase (ADR 0019): its feature folders and the UATs that test it. "Belum masuk
 * fase" works the same way, for scenarios that have no Fase yet.
 */
export function PhasePage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const { cycleId = '' } = useParams()
  const can = useCan(code)
  const manager = can('run.write')
  const tree = usePhaseTree(code, manager)
  const uats = useUats(code, manager)
  const cycles = useCycles(code)
  const [editing, setEditing] = useState(false)
  const [adding, setAdding] = useState(false)

  if (!manager) return <NotFoundPage />
  if (tree.isPending) return <LoadingState rows={5} />
  if (tree.isError) return <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />
  const unassigned = cycleId === UNASSIGNED_PHASE
  const phase = unassigned ? tree.data.unassigned : tree.data.phases.find((p) => p.id === cycleId)
  if (!phase) return <EmptyState description={t('phases.notFound')} />
  const cycle = cycles.data?.find((c) => c.id === cycleId)
  const phaseUats = (uats.data ?? []).filter((u) => u.phase?.id === cycleId)
  const name = unassigned ? t('phases.unassigned') : (phase.title ?? '')
  const period =
    phase.starts_on || phase.ends_on
      ? `${phase.starts_on ? formatDate(phase.starts_on, locale) : '…'} – ${
          phase.ends_on ? formatDate(phase.ends_on, locale) : '…'
        }`
      : null
  const listPath = `${projectPath(code, 'test-cases')}?cycle=${unassigned ? 'none' : cycleId}`

  return (
    <>
      <PageHeader
        title={name}
        subtitle={
          unassigned
            ? t('phases.unassignedHint')
            : [phase.cycle_code, period].filter(Boolean).join(' · ')
        }
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('phases.title'), to: projectPath(code, 'fase') },
          { label: name },
        ]}
        badges={phase.status_code ? <CycleStatusBadge status={phase.status_code} /> : undefined}
        actions={
          <>
            <ButtonLink to={listPath} icon={ListChecks} variant="secondary">
              {t('phases.listScenarios')}
            </ButtonLink>
            {!unassigned && (
              <>
                <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
                  {t('phases.edit')}
                </Button>
                <ButtonLink to={`${projectPath(code, 'uat/baru')}?fase=${cycleId}`} icon={Plus}>
                  {t('uat.newForPhase')}
                </ButtonLink>
              </>
            )}
          </>
        }
      />
      <div className="space-y-6">
        {!unassigned && cycle?.description && (
          <p className="max-w-3xl text-sm whitespace-pre-line text-ink-muted">
            {cycle.description}
          </p>
        )}
        <Section
          title={t('phases.featuresHeading')}
          description={unassigned ? t('phases.unassignedFeaturesHint') : t('phases.featuresHint')}
          action={
            !unassigned && phase.id ? (
              <Button variant="secondary" icon={FolderPlus} onClick={() => setAdding(true)}>
                {t('phases.addFeature')}
              </Button>
            ) : undefined
          }
        >
          <FeatureFolders code={code} phase={phase} />
          {phase.unsorted > 0 && (
            <p className="mt-4 text-sm text-ink-muted">
              {t('phases.unsorted', { count: phase.unsorted })}{' '}
              <Link to={listPath} className="font-semibold text-brand-700 hover:underline">
                {t('phases.listScenarios')}
              </Link>
            </p>
          )}
        </Section>
        {!unassigned && (
          <Section
            title={t('phases.uatsHeading')}
            description={t('phases.uatsHint')}
            action={
              <ButtonLink
                to={`${projectPath(code, 'uat/baru')}?fase=${cycleId}`}
                icon={TestTubeDiagonal}
                variant="secondary"
              >
                {t('uat.newForPhase')}
              </ButtonLink>
            }
          >
            {phaseUats.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('phases.noUats')}</p>
            ) : (
              <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {phaseUats.map((uat) => (
                  <UatCard key={uat.id} code={code} uat={uat} showPhase={false} />
                ))}
              </ul>
            )}
          </Section>
        )}
        {!unassigned && phase.id && (
          <Section title={t('phases.manageHeading')}>
            <PhaseStatus code={code} phase={{ ...phase, id: phase.id }} />
          </Section>
        )}
      </div>
      {editing && cycle && (
        <PhaseFormDialog code={code} phase={cycle} onClose={() => setEditing(false)} />
      )}
      {adding && phase.id && (
        <FeatureFolderDialog
          code={code}
          phase={{ ...phase, id: phase.id }}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  )
}
