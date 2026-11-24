import type { PhaseDto } from '@testboard/shared'
import { FileUp, Folder, FolderInput, ListChecks, Plus, TestTubeDiagonal } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useSearchParams } from 'react-router'
import { PhaseFormDialog } from '../components/phase/PhaseFormDialog'
import { CycleStatusBadge } from '../components/status/StatusBadges'
import { Button, ButtonLink } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useCan } from '../hooks/permissions'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { usePhaseTree } from '../hooks/structure-queries'
import { formatDate, toLocale } from '../lib/format'
import { UNASSIGNED_PHASE } from '../lib/uat'
import { NotFoundPage } from './NotFoundPage'

/** One Fase as a folder card: name, status, period and what is inside. */
function PhaseFolderCard({ code, phase }: { code: string; phase: PhaseDto }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const unassigned = phase.id === null
  const period =
    phase.starts_on || phase.ends_on
      ? `${phase.starts_on ? formatDate(phase.starts_on, locale) : '…'} – ${
          phase.ends_on ? formatDate(phase.ends_on, locale) : '…'
        }`
      : null
  const ready = phase.features.reduce((sum, f) => sum + f.ready, 0)
  return (
    <li
      className={`relative flex flex-col gap-3 rounded-xl border p-5 shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-brand-500 hover:shadow-md ${
        unassigned ? 'border-dashed border-line-strong bg-canvas' : 'border-line bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${
              unassigned ? 'bg-neutral-soft text-ink-muted' : 'bg-brand-50 text-brand-700'
            }`}
          >
            {unassigned ? <FolderInput className="size-6" /> : <Folder className="size-6" />}
          </span>
          <div className="min-w-0">
            {!unassigned && (
              <p className="text-xs font-semibold text-brand-700">{phase.cycle_code}</p>
            )}
            <h2 className="text-lg leading-snug font-semibold break-words">
              <Link
                to={projectPath(code, `fase/${phase.id ?? UNASSIGNED_PHASE}`)}
                className="after:absolute after:inset-0 after:rounded-xl focus:outline-none"
              >
                {unassigned ? t('phases.unassigned') : phase.title}
              </Link>
            </h2>
            {period && <p className="text-xs text-ink-muted tabular-nums">{period}</p>}
            {unassigned && <p className="text-sm text-ink-muted">{t('phases.unassignedHint')}</p>}
          </div>
        </div>
        {phase.status_code && <CycleStatusBadge status={phase.status_code} />}
      </div>
      <ul className="mt-auto flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
        <li className="inline-flex items-center gap-1.5">
          <Folder aria-hidden="true" className="size-4" />
          {t('phases.featureCount', { count: phase.features.length })}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <ListChecks aria-hidden="true" className="size-4" />
          {t('phases.scenarioCount', { count: phase.scenarios })}
          {phase.scenarios > 0 && (
            <span className="text-xs">({t('phases.readyCount', { count: ready })})</span>
          )}
        </li>
        {!unassigned && (
          <li className="inline-flex items-center gap-1.5">
            <TestTubeDiagonal aria-hidden="true" className="size-4" />
            {t('uat.count', { count: phase.uats })}
          </li>
        )}
      </ul>
    </li>
  )
}

/**
 * The top of the project, like "My Drive" (ADR 0019): every Fase is a folder; inside are
 * feature folders, inside those the scenarios. Scenarios not in a Fase yet have their own
 * folder, so nothing gets lost.
 */
export function PhasesPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const can = useCan(code)
  const manager = can('run.write')
  const tree = usePhaseTree(code, manager)
  const [params, setParams] = useSearchParams()
  const creating = params.get('baru') === '1'
  const setCreating = (open: boolean) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (open) next.set('baru', '1')
        else next.delete('baru')
        return next
      },
      { replace: true },
    )

  if (!manager) return <NotFoundPage />
  const phases = tree.data?.phases ?? []
  const unassigned = tree.data?.unassigned

  return (
    <>
      <PageHeader
        title={t('phases.title')}
        subtitle={t('phases.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('phases.title') }]}
        actions={
          <>
            <ButtonLink to={projectPath(code, 'test-cases')} icon={ListChecks} variant="secondary">
              {t('phases.allScenarios')}
            </ButtonLink>
            <ButtonLink to={projectPath(code, 'imports')} icon={FileUp} variant="secondary">
              {t('phases.import')}
            </ButtonLink>
            <Button icon={Plus} onClick={() => setCreating(true)}>
              {t('phases.new')}
            </Button>
          </>
        }
      />
      {tree.isPending && <LoadingState rows={4} />}
      {tree.isError && <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />}
      {tree.isSuccess && phases.length === 0 && !unassigned?.scenarios && (
        <EmptyState
          title={t('phases.emptyTitle')}
          description={t('phases.empty')}
          action={
            <Button icon={Plus} onClick={() => setCreating(true)}>
              {t('phases.new')}
            </Button>
          }
        />
      )}
      {tree.isSuccess && (phases.length > 0 || Boolean(unassigned?.scenarios)) && (
        <ul
          aria-label={t('phases.title')}
          className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3"
        >
          {phases.map((phase) => (
            <PhaseFolderCard key={phase.id} code={code} phase={phase} />
          ))}
          {unassigned && unassigned.scenarios > 0 && (
            <PhaseFolderCard code={code} phase={unassigned} />
          )}
        </ul>
      )}
      {creating && <PhaseFormDialog code={code} onClose={() => setCreating(false)} />}
    </>
  )
}
