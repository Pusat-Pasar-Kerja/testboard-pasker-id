import { FolderKanban } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { useProjects } from '../hooks/queries'
import { projectPath } from '../hooks/route-state'

/** Switches project while staying in the same section (detail pages fall back to the list). */
export function ProjectSwitcher({ projectCode }: { projectCode: string }) {
  const { t } = useTranslation()
  const id = useId()
  const navigate = useNavigate()
  const location = useLocation()
  const projects = useProjects()

  function onChange(code: string) {
    const section = location.pathname.split('/')[3] ?? 'dashboard'
    navigate(projectPath(code, section))
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <FolderKanban aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
      <label htmlFor={id} className="sr-only">
        {t('shell.project')}
      </label>
      <select
        id={id}
        value={projectCode}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-11 w-full min-w-0 rounded-lg border border-line-strong bg-surface px-3 text-sm font-semibold md:w-64"
      >
        {(projects.data ?? []).map((project) => (
          <option key={project.project_code} value={project.project_code}>
            {project.project_code} - {project.name}
          </option>
        ))}
        {!projects.data && <option value={projectCode}>{projectCode}</option>}
      </select>
    </div>
  )
}
