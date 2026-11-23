import {
  ArrowRight,
  BookOpen,
  Bug,
  ClipboardCheck,
  FolderKanban,
  FolderPlus,
  ListChecks,
  PlayCircle,
} from 'lucide-react'
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
      {me.data && (
        <section className="mb-6 flex flex-col gap-4 rounded-3xl bg-gradient-to-br from-brand-50 via-white to-teal-50 p-5 ring-1 ring-brand-100 sm:flex-row sm:items-center sm:p-6">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold tracking-wide text-teal-700 uppercase">
              {me.data.system_role
                ? t('pages.projects.signedInAs', {
                    role: t(`codes.systemRole.${me.data.system_role}`),
                  })
                : t('pages.projects.signedInAs', { role: t('codes.systemRole.NONE') })}
            </p>
            <h2 className="mt-1 text-2xl font-bold text-brand-800">
              {t('pages.projects.welcome', { name: me.data.display_name })}
            </h2>
            <p className="mt-1 text-ink-muted">
              {me.data.system_role
                ? t('pages.projects.welcomeAdmin')
                : t('pages.projects.welcomeUser')}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/tugas"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
            >
              <ClipboardCheck aria-hidden="true" className="size-5" />
              {t('nav.myTasks')}
            </Link>
            <Link
              to="/panduan"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-line-strong bg-surface px-4 font-semibold hover:bg-brand-50"
            >
              <BookOpen aria-hidden="true" className="size-5" />
              {t('nav.guide')}
            </Link>
          </div>
        </section>
      )}
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
                className="group flex h-full flex-col gap-3 rounded-2xl card-pasker p-5 transition-transform hover:-translate-y-0.5 hover:shadow-lg"
              >
                <span className="flex items-start justify-between gap-2">
                  <span
                    className={`inline-flex size-11 shrink-0 items-center justify-center rounded-xl ${PASTEL_CHIP[pastelFor(project.project_code)]}`}
                  >
                    <FolderKanban aria-hidden="true" className="size-6" />
                  </span>
                  <span className="flex flex-wrap justify-end gap-1">
                    {project.is_archived && (
                      <Badge tone="muted" label={t('pages.projects.archived')} />
                    )}
                    <span className="rounded-full bg-neutral-soft px-2 py-0.5 font-mono text-[11px] text-ink-muted">
                      {project.project_code}
                    </span>
                  </span>
                </span>
                <span className="text-lg leading-snug font-bold text-brand-800">
                  {project.name}
                </span>
                {project.description && (
                  <span className="line-clamp-2 text-sm text-ink-muted">{project.description}</span>
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
                <span className="flex items-center justify-between gap-2 border-t border-line pt-3 text-sm">
                  <span className="text-ink-muted">
                    {project.role_code === 'ADMIN' || project.role_code === 'QA_LEAD'
                      ? t('pages.projects.youManage')
                      : t('pages.projects.yourRole', {
                          role: t(`codes.role.${project.role_code}`),
                        })}
                  </span>
                  <span className="inline-flex items-center gap-1 font-semibold text-brand-700 group-hover:underline">
                    {t('pages.projects.open')}
                    <ArrowRight aria-hidden="true" className="size-4" />
                  </span>
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
