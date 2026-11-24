import type { MyTableTask } from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Bug, ClipboardList, QrCode, Users } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Badge } from '../components/ui/Badge'
import { ConfirmDialog } from '../components/ui/Dialog'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useMyTasks } from '../hooks/queries'
import { projectPath } from '../hooks/route-state'
import { apiErrorText } from '../lib/api-errors'
import { formatShortDateTime, toLocale } from '../lib/format'
import { groupLabel } from '../lib/uat'
import { storeTesterName } from '../lib/workshop'
import { useDataSource } from '../services/use-data-source'

const cardClass = 'flex flex-col gap-3 rounded-2xl card-pasker p-5 sm:flex-row sm:items-center'

/** One table the person is listed at: open its Mode Mudah with their own name chosen. */
function TableCard({ task }: { task: MyTableTask }) {
  const { t, i18n } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState(false)
  const locale = toLocale(i18n.language)
  const open = useMutation({
    mutationFn: () => ds.joinWorkshopAsMember(task.table.id),
    onSuccess: async ({ session, member_name }) => {
      storeTesterName(session.table.id, member_name)
      queryClient.clear()
      queryClient.setQueryData(['workshop', 'session'], session)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      navigate('/meja/kerja', { replace: true })
    },
    onError: (error) => {
      setConfirm(false)
      toast.show(apiErrorText(t, error), 'error')
    },
  })
  const active = task.state === 'ACTIVE'
  return (
    <li className={cardClass}>
      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl chip-gradient">
        <QrCode aria-hidden="true" className="size-6" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">
          {groupLabel(t, task.table)}
          <Badge
            tone={active ? 'success' : 'muted'}
            label={t(`workshop.tables.state.${task.state}`)}
          />
        </p>
        <p className="text-sm text-ink-muted">
          {t('tasks.tableLine', {
            name: task.member.name,
            cycle: task.uat?.name ?? task.cycle.title,
            project: task.project.name,
          })}
        </p>
        <p className="text-xs text-ink-muted">
          {t('tasks.validUntil', { date: formatShortDateTime(task.valid_until, locale) })}
        </p>
      </div>
      {active && (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800"
        >
          {t('tasks.openTable')}
          <ArrowRight aria-hidden="true" className="size-5" />
        </button>
      )}
      <ConfirmDialog
        open={confirm}
        title={t('tasks.openTitle', { table: task.table.name })}
        body={t('tasks.openBody', { name: task.member.name })}
        confirmLabel={t('tasks.openTable')}
        tone="primary"
        busy={open.isPending}
        onConfirm={() => open.mutate()}
        onCancel={() => setConfirm(false)}
      />
    </li>
  )
}

/**
 * "Tugas saya" (owner, 2026-11-24): everything assigned to the signed-in person - the
 * tables they sit at, the scenarios given to them, and the problems they reported.
 */
export function MyTasksPage() {
  const { t } = useTranslation()
  const tasks = useMyTasks()
  const data = tasks.data
  const empty = data && !data.tables.length && !data.runs.length && !data.bugs.length

  return (
    <>
      <PageHeader title={t('tasks.title')} subtitle={t('tasks.subtitle')} />
      {tasks.isPending && <LoadingState rows={4} />}
      {tasks.isError && <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />}
      {empty && (
        <EmptyState
          title={t('tasks.emptyTitle')}
          description={t('tasks.empty')}
          action={
            <Link
              to="/projects"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 font-semibold text-white"
            >
              {t('tasks.toProjects')}
            </Link>
          }
        />
      )}
      {data && !empty && (
        <div className="space-y-6">
          {data.tables.length > 0 && (
            <Section title={t('tasks.tablesTitle')} description={t('tasks.tablesHint')}>
              <ul className="space-y-3">
                {data.tables.map((task) => (
                  <TableCard key={task.table.id} task={task} />
                ))}
              </ul>
            </Section>
          )}
          {data.runs.length > 0 && (
            <Section title={t('tasks.runsTitle')} description={t('tasks.runsHint')}>
              <ul className="space-y-3">
                {data.runs.map((task) => {
                  const percent = task.assigned ? Math.round((task.done / task.assigned) * 100) : 0
                  const target = task.next_run_case_id
                    ? projectPath(
                        task.project.code,
                        `runs/${task.run.id}/cases/${task.next_run_case_id}`,
                      )
                    : projectPath(task.project.code, `runs/${task.run.id}`)
                  return (
                    <li key={task.run.id} className={cardClass}>
                      <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl chip-gradient">
                        <ClipboardList aria-hidden="true" className="size-6" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-lg font-semibold">{task.run.name}</p>
                        <p className="text-sm text-ink-muted">
                          {t('tasks.runLine', {
                            project: task.project.name,
                            done: task.done,
                            total: task.assigned,
                          })}
                        </p>
                        <div
                          className="mt-2 h-2 overflow-hidden rounded-full bg-chart-track"
                          role="progressbar"
                          aria-valuenow={percent}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={t('tasks.progress')}
                        >
                          <div
                            className="h-full bg-chart-passed"
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                      <Link
                        to={target}
                        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800"
                      >
                        {task.next_run_case_id ? t('tasks.continue') : t('tasks.view')}
                        <ArrowRight aria-hidden="true" className="size-5" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </Section>
          )}
          {data.bugs.length > 0 && (
            <Section title={t('tasks.bugsTitle')}>
              <ul className="grid gap-3 md:grid-cols-2">
                {data.bugs.map((row) => (
                  <li key={row.project.code} className={cardClass}>
                    <span className="inline-flex size-12 shrink-0 items-center justify-center rounded-xl bg-pastel-peach text-pastel-peach-ink">
                      <Bug aria-hidden="true" className="size-6" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{row.project.name}</p>
                      <p className="text-sm text-ink-muted">
                        {t('tasks.bugLine', { open: row.open, total: row.total })}
                      </p>
                    </div>
                    <Link
                      to={projectPath(row.project.code, 'bugs')}
                      className="inline-flex min-h-11 items-center gap-1 font-semibold text-brand-700 hover:underline"
                    >
                      {t('tasks.view')}
                      <ArrowRight aria-hidden="true" className="size-4" />
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
          <p className="flex items-center gap-2 text-sm text-ink-muted">
            <Users aria-hidden="true" className="size-4" />
            {t('tasks.footer')}
          </p>
        </div>
      )}
    </>
  )
}
