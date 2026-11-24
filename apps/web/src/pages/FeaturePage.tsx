import { FileUp, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { ScenarioList } from '../components/scenario/ScenarioList'
import { ButtonLink } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useCan } from '../hooks/permissions'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { usePhaseTree } from '../hooks/structure-queries'
import { UNASSIGNED_PHASE } from '../lib/uat'
import { NotFoundPage } from './NotFoundPage'

/**
 * A feature folder inside a Fase (ADR 0019): its scenarios, with their screenshots one
 * click away. Select scenarios to copy them to the next Fase or move them, like in Drive.
 */
export function FeaturePage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const { cycleId = '', moduleId = '' } = useParams()
  const can = useCan(code)
  const manager = can('case.read')
  const tree = usePhaseTree(code, manager)

  if (!manager) return <NotFoundPage />
  if (tree.isPending) return <LoadingState rows={6} />
  if (tree.isError) return <ErrorState error={tree.error} onRetry={() => void tree.refetch()} />
  const unassigned = cycleId === UNASSIGNED_PHASE
  const phase = unassigned ? tree.data.unassigned : tree.data.phases.find((p) => p.id === cycleId)
  const feature = phase?.features.find((f) => f.module.id === moduleId)
  if (!phase || !feature) return <EmptyState description={t('phases.featureNotFound')} />
  const phaseName = unassigned ? t('phases.unassigned') : (phase.title ?? '')
  const newLink = unassigned
    ? `${projectPath(code, 'test-cases/new')}?fitur=${encodeURIComponent(feature.module.module_code)}`
    : `${projectPath(code, 'test-cases/new')}?fase=${cycleId}&fitur=${encodeURIComponent(
        feature.module.module_code,
      )}`

  return (
    <>
      <PageHeader
        title={feature.module.name}
        subtitle={t('phases.featureSubtitle', {
          phase: phaseName,
          count: feature.scenarios,
          ready: feature.ready,
        })}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('phases.title'), to: projectPath(code, 'fase') },
          { label: phaseName, to: projectPath(code, `fase/${cycleId}`) },
          { label: feature.module.name },
        ]}
        actions={
          can('case.write') && (
            <>
              <ButtonLink to={projectPath(code, 'imports')} icon={FileUp} variant="secondary">
                {t('phases.import')}
              </ButtonLink>
              <ButtonLink to={newLink} icon={Plus}>
                {t('pages.cases.create')}
              </ButtonLink>
            </>
          )
        }
      />
      <p className="mb-4 max-w-3xl text-sm text-ink-muted">{t('phases.featureHint')}</p>
      <ScenarioList
        code={code}
        cycle={unassigned ? 'none' : cycleId}
        module={feature.module.module_code}
        emptyText={t('phases.featureEmpty')}
        emptyAction={
          can('case.write') ? (
            <ButtonLink to={newLink} icon={Plus}>
              {t('pages.cases.create')}
            </ButtonLink>
          ) : undefined
        }
      />
    </>
  )
}
