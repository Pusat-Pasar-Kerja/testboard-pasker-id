import type { AdminProjectDto } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Archive,
  ArchiveRestore,
  Bug,
  FolderPlus,
  ListChecks,
  Pencil,
  PlayCircle,
  Users,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { ProjectFormDialog } from '../components/admin/ProjectFormDialog'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useAdminProjects, useCurrentUser } from '../hooks/queries'
import { projectPath } from '../hooks/route-state'
import { apiErrorText } from '../lib/api-errors'
import { formatDate, toLocale } from '../lib/format'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

function ProjectCard({
  project,
  onEdit,
}: {
  project: AdminProjectDto
  onEdit: (project: AdminProjectDto) => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [confirm, setConfirm] = useState(false)
  const toggle = useMutation({
    mutationFn: () => ds.updateAdminProject(project.id, { is_archived: !project.is_archived }),
    onSuccess: async (saved) => {
      setConfirm(false)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['projects'] }),
        queryClient.invalidateQueries({ queryKey: ['project', project.project_code] }),
      ])
      toast.show(
        t(
          saved.is_archived
            ? 'pages.adminProjects.archivedToast'
            : 'pages.adminProjects.restoredToast',
          { code: saved.project_code },
        ),
      )
    },
    onError: (error) => {
      setConfirm(false)
      toast.show(apiErrorText(t, error), 'error')
    },
  })

  return (
    <li className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-brand-700">
            {project.project_code}
          </p>
          <p className="text-lg leading-snug font-semibold break-words">{project.name}</p>
        </div>
        <Badge
          tone={project.is_archived ? 'muted' : 'success'}
          label={
            project.is_archived ? t('pages.projects.archived') : t('pages.adminProjects.active')
          }
        />
      </div>
      {project.description && (
        <p className="text-sm break-words text-ink-muted">{project.description}</p>
      )}
      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
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
        <span className="inline-flex items-center gap-1">
          <Users aria-hidden="true" className="size-4" />
          {t('pages.adminProjects.members', { count: project.member_count })}
        </span>
      </p>
      <p className="text-xs text-ink-muted">
        {project.created_by
          ? t('pages.adminProjects.createdBy', {
              date: formatDate(project.created_at, locale),
              name: project.created_by.display_name,
            })
          : t('pages.adminProjects.createdAt', { date: formatDate(project.created_at, locale) })}
      </p>
      <div className="mt-auto flex flex-wrap gap-2 pt-1">
        <Link
          to={projectPath(project.project_code)}
          className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
        >
          {t('pages.adminProjects.open')}
        </Link>
        <Button variant="secondary" icon={Pencil} onClick={() => onEdit(project)}>
          {t('pages.adminProjects.edit')}
        </Button>
        {project.is_archived ? (
          <Button
            variant="ghost"
            icon={ArchiveRestore}
            loading={toggle.isPending}
            onClick={() => toggle.mutate()}
          >
            {t('pages.adminProjects.unarchive')}
          </Button>
        ) : (
          <Button variant="ghost" icon={Archive} onClick={() => setConfirm(true)}>
            {t('pages.adminProjects.archive')}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirm}
        title={t('pages.adminProjects.archiveTitle', { code: project.project_code })}
        body={t('pages.adminProjects.archiveBody')}
        confirmLabel={t('pages.adminProjects.archive')}
        busy={toggle.isPending}
        onConfirm={() => toggle.mutate()}
        onCancel={() => setConfirm(false)}
      />
    </li>
  )
}

export function AdminProjectsPage() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const isSuperAdmin = Boolean(me.data?.is_super_admin)
  const projects = useAdminProjects(isSuperAdmin)
  const [dialog, setDialog] = useState<{ project?: AdminProjectDto } | null>(null)

  if (!isSuperAdmin) return <NotFoundPage reason="item" />
  const createButton = (
    <Button icon={FolderPlus} onClick={() => setDialog({})}>
      {t('pages.adminProjects.create')}
    </Button>
  )
  return (
    <>
      <PageHeader
        title={t('pages.adminProjects.title')}
        subtitle={t('pages.adminProjects.subtitle')}
        actions={createButton}
      />
      {projects.isPending && <LoadingState rows={3} />}
      {projects.isError && (
        <ErrorState error={projects.error} onRetry={() => void projects.refetch()} />
      )}
      {projects.isSuccess && projects.data.length === 0 && (
        <EmptyState description={t('pages.adminProjects.empty')} action={createButton} />
      )}
      {projects.isSuccess && projects.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.data.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onEdit={(selected) => setDialog({ project: selected })}
            />
          ))}
        </ul>
      )}
      {dialog && <ProjectFormDialog project={dialog.project} onClose={() => setDialog(null)} />}
    </>
  )
}
