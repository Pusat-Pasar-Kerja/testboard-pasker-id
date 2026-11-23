import { Bug, FolderKanban, FolderPlus, ListChecks, PlayCircle } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ProjectFormDialog } from '../components/admin/ProjectFormDialog'
import { Badge } from '../components/ui/Badge'
import { PASTEL_CHIP, pastelFor } from '../components/ui/pastel'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useCurrentUser, useProjects } from '../hooks/queries'
import { projectPath } from '../hooks/route-state'

export function ProjectsPage() {
  const { t } = useTranslation()
  const projects = useProjects()
  const me = useCurrentUser()
  // Admin and Super Admin create projects (ADR 0017).
  const canCreate = Boolean(me.data?.system_role)
  const [creating, setCreating] = useState(false)
  const createButton = canCreate ? (
    <Button icon={FolderPlus} onClick={() => setCreating(true)}>
      {t('pages.projects.create')}
    </Button>
  ) : undefined

  return (
    <>
      <PageHeader
        title={t('pages.projects.title')}
        subtitle={t('pages.projects.subtitle')}
        actions={createButton}
      />
      {projects.isPending && <LoadingState rows={3} />}
      {projects.isError && (
        <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
      )}
      {projects.isSuccess &&
        projects.data.length === 0 &&
        (canCreate ? (
          <EmptyState
            title={t('pages.projects.emptyAdminTitle')}
            description={t('pages.projects.emptyAdmin')}
            action={createButton}
          />
        ) : (
          <EmptyState description={t('pages.projects.empty')} />
        ))}
      {projects.isSuccess && projects.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.data.map((project) => (
            <li key={project.project_code}>
              <Link
                to={projectPath(project.project_code)}
                className="flex h-full flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-xs hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-sm"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-flex size-9 shrink-0 items-center justify-center rounded-xl ${PASTEL_CHIP[pastelFor(project.project_code)]}`}
                    >
                      <FolderKanban aria-hidden="true" className="size-5" />
                    </span>
                    <span className="truncate text-xs font-semibold tracking-wide text-brand-700">
                      {project.project_code}
                    </span>
                  </span>
                  {project.is_archived && (
                    <Badge tone="muted" label={t('pages.projects.archived')} />
                  )}
                </span>
                <span className="text-lg leading-snug font-semibold">{project.name}</span>
                {project.description && (
                  <span className="text-sm text-ink-muted">{project.description}</span>
                )}
                <span className="mt-auto flex flex-wrap gap-x-4 gap-y-1 pt-2 text-sm text-ink-muted">
                  <span className="inline-flex items-center gap-1">
                    <ListChecks aria-hidden="true" className="size-4" />
                    {t('pages.projects.cases', { count: project.counts.test_cases })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <PlayCircle aria-hidden="true" className="size-4" />
                    {t('pages.projects.runs', { count: project.counts.runs })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Bug aria-hidden="true" className="size-4" />
                    {t('pages.projects.openBugs', { count: project.counts.open_defects })}
                  </span>
                </span>
                <span className="text-xs text-ink-muted">
                  {t('pages.projects.yourRole', { role: t(`codes.role.${project.role_code}`) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {creating && <ProjectFormDialog onClose={() => setCreating(false)} />}
    </>
  )
}
