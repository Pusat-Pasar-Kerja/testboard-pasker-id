import { FolderKanban } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { useLocation, useNavigate } from 'react-router'
import { useProjects } from '../hooks/queries'
import { projectPath } from '../hooks/route-state'
import { HEADER_FIELD } from './header-styles'

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
    <div className="relative w-52 lg:w-56 xl:w-64">
      <FolderKanban
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-muted"
      />
      <label htmlFor={id} className="sr-only">
        {t('shell.project')}
      </label>
      <select
        id={id}
        value={projectCode}
        onChange={(event) => onChange(event.target.value)}
        className={`${HEADER_FIELD} truncate font-semibold`}
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
