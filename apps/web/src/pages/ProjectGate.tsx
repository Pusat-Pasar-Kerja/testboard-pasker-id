import { Archive } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Outlet } from 'react-router'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useProject } from '../hooks/queries'
import { useProjectCode } from '../hooks/route-state'
import { ApiClientError } from '../services/api-client'
import { NotFoundPage } from './NotFoundPage'

/**
 * Resolves the project in the URL before rendering any project page. A project the user
 * is not a member of looks exactly like a missing one (no data leak about other projects).
 * NOTE: this is UX only - authorization is enforced by the API (Milestone 2).
 */
export function ProjectGate() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const project = useProject(code)

  if (project.isPending) return <LoadingState rows={4} />
  if (project.isError) {
    const notFound =
      project.error instanceof ApiClientError &&
      (project.error.status === 404 || project.error.status === 403)
    return notFound ? (
      <NotFoundPage reason="project" />
    ) : (
      <ErrorState error={project.error} onRetry={() => void project.refetch()} />
    )
  }
  return (
    <>
      {project.data.is_archived && (
        <p
          role="status"
          className="mb-4 flex items-start gap-2 rounded-xl border border-line bg-neutral-soft p-3 text-sm text-ink-muted"
        >
          <Archive aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {t('shell.projectArchived')}
        </p>
      )}
      <Outlet />
    </>
  )
}
