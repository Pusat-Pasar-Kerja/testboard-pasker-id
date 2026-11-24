import { CopyCheck, FolderKanban, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ScenarioList } from '../components/scenario/ScenarioList'
import { ButtonLink } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { useCan } from '../hooks/permissions'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { NotFoundPage } from './NotFoundPage'

/**
 * "Semua skenario": every scenario of the project in one list, filtered by Fase, feature,
 * priority, type and status. The usual way in is through the Fase folders (ADR 0019).
 */
export function TestCasesPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const can = useCan(code)
  if (!can('case.read')) return <NotFoundPage />
  return (
    <>
      <PageHeader
        title={t('pages.cases.title')}
        subtitle={t('pages.cases.subtitle')}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('phases.title'), to: projectPath(code, 'fase') },
          { label: t('pages.cases.title') },
        ]}
        actions={
          <>
            <ButtonLink to={projectPath(code, 'fase')} icon={FolderKanban} variant="secondary">
              {t('phases.openFolders')}
            </ButtonLink>
            {can('case.write') && (
              <>
                <ButtonLink
                  to={projectPath(code, 'test-cases/similar')}
                  icon={CopyCheck}
                  variant="secondary"
                >
                  {t('similar.open')}
                </ButtonLink>
                <ButtonLink to={projectPath(code, 'test-cases/new')} icon={Plus}>
                  {t('pages.cases.create')}
                </ButtonLink>
              </>
            )}
          </>
        }
      />
      <ScenarioList code={code} />
    </>
  )
}
