import {
  EXECUTION_STATUSES,
  RUN_TRANSITIONS,
  executedOf,
  passRate,
  type MemberDto,
  type RunCaseRow,
  type RunStatus,
  type TestRunDetail,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  CheckCheck,
  CircleCheck,
  CircleX,
  ClipboardList,
  Info,
  Lock,
  Pencil,
  Percent,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  UserCheck,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router'
import { StatTile } from '../components/charts/StatTile'
import { StatusBar } from '../components/charts/StatusBar'
import { ExecutionStatusBadge, RunStatusBadge } from '../components/status/StatusBadges'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FilterBar, SearchField, SelectFilter } from '../components/ui/Filters'
import { FormAlert } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { ResponsiveTable } from '../components/ui/ResponsiveTable'
import { DescriptionList, Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import {
  invalidateRunData,
  useCurrentUser,
  useMembers,
  useRun,
  useTestCases,
} from '../hooks/queries'
import { projectPath, useProjectCode, useUrlFilters } from '../hooks/route-state'
import { useUat } from '../hooks/structure-queries'
import { apiErrorText } from '../lib/api-errors'
import {
  formatDateTime,
  formatNumber,
  formatPercent,
  formatShortDateTime,
  toLocale,
} from '../lib/format'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

/** REOPEN is COMPLETED -> ACTIVE: same target status, different wording. */
type Transition = 'ACTIVE' | 'COMPLETED' | 'REOPEN' | 'LOCKED'

const TRANSITION_UI: Record<
  Transition,
  {
    label: 'start' | 'complete' | 'reopen' | 'lock'
    icon: LucideIcon
    variant: 'primary' | 'secondary'
    target: RunStatus
  }
> = {
  ACTIVE: { label: 'start', icon: Play, variant: 'primary', target: 'ACTIVE' },
  COMPLETED: { label: 'complete', icon: CheckCheck, variant: 'primary', target: 'COMPLETED' },
  REOPEN: { label: 'reopen', icon: RotateCcw, variant: 'secondary', target: 'ACTIVE' },
  LOCKED: { label: 'lock', icon: Lock, variant: 'secondary', target: 'LOCKED' },
}

function transitionsOf(status: RunStatus): Transition[] {
  return RUN_TRANSITIONS[status].map((to) =>
    status === 'COMPLETED' && to === 'ACTIVE' ? 'REOPEN' : to === 'PLANNED' ? 'ACTIVE' : to,
  )
}

/** Members who can be given test work (doc 09: execution is ADMIN/QA_LEAD/TESTER). */
function assignable(members: MemberDto[] | undefined): MemberDto[] {
  return (members ?? []).filter(
    (m) => m.user.is_active && ['ADMIN', 'QA_LEAD', 'TESTER'].includes(m.role_code),
  )
}

const INLINE_SELECT =
  'min-h-11 rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink focus:border-brand-600'

function RunStatusActions({ code, run }: { code: string; run: TestRunDetail }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Transition | null>(null)
  const change = useMutation({
    mutationFn: (status: RunStatus) => ds.changeRunStatus(code, run.id, status),
    onSuccess: async (updated) => {
      setPending(null)
      await invalidateRunData(queryClient, code, run.id)
      toast.show(
        t('pages.runDetail.statusChanged', {
          status: t(`codes.runStatus.${updated.status_code}`),
        }),
      )
    },
    onError: (error) => {
      setPending(null)
      toast.show(apiErrorText(t, error), 'error')
    },
  })

  return (
    <>
      {transitionsOf(run.status_code).map((transition) => {
        const ui = TRANSITION_UI[transition]
        return (
          <Button
            key={transition}
            variant={ui.variant}
            icon={ui.icon}
            onClick={() => setPending(transition)}
          >
            {t(`pages.runDetail.${ui.label}`)}
          </Button>
        )
      })}
      <ConfirmDialog
        open={pending !== null}
        title={pending ? t(`pages.runDetail.confirm.${pending}`, { code: run.run_code }) : ''}
        body={pending ? t(`pages.runDetail.confirmBody.${pending}`) : undefined}
        confirmLabel={pending ? t(`pages.runDetail.${TRANSITION_UI[pending].label}`) : ''}
        tone={pending === 'LOCKED' ? 'danger' : 'primary'}
        busy={change.isPending}
        onConfirm={() => pending && change.mutate(TRANSITION_UI[pending].target)}
        onCancel={() => setPending(null)}
      />
    </>
  )
}

function AddCasesPanel({
  code,
  run,
  members,
  onClose,
}: {
  code: string
  run: TestRunDetail
  members: MemberDto[]
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [q, setQ] = useState('')
  const [assignee, setAssignee] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const cases = useTestCases(code, { status: 'READY', q: q || undefined, page_size: 100 })
  const inRun = new Set(run.run_cases.map((row) => row.test_case_id))
  const candidates = (cases.data?.data ?? []).filter((c) => !inRun.has(c.id))
  const allChosen = candidates.length > 0 && candidates.every((c) => selected.has(c.id))

  const add = useMutation({
    mutationFn: () =>
      ds.addRunCases(code, run.id, {
        test_case_ids: [...selected],
        assigned_to: assignee || null,
      }),
    onSuccess: async (result) => {
      await invalidateRunData(queryClient, code, run.id)
      toast.show(
        result.skipped.length > 0
          ? t('pages.runDetail.addedSkipped', {
              added: result.added,
              skipped: result.skipped.length,
            })
          : t('pages.runDetail.added', { added: result.added }),
      )
      onClose()
    },
    onError: (err) => setError(apiErrorText(t, err)),
  })

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  return (
    <Section
      title={t('pages.runDetail.addHeading')}
      description={t('pages.runDetail.addHint')}
      action={
        <Button variant="ghost" icon={X} onClick={onClose}>
          {t('actions.close')}
        </Button>
      }
      className="animate-fade-in"
    >
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <SearchField
          label={t('actions.search')}
          placeholder={t('pages.runDetail.addSearch')}
          value={q}
          onSearch={setQ}
        />
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-muted">
            {t('pages.runDetail.addAssignee')}
          </span>
          <select
            className={INLINE_SELECT}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">{t('pages.runDetail.unassigned')}</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {cases.isPending && <LoadingState rows={3} />}
      {cases.isError && <ErrorState error={cases.error} onRetry={() => void cases.refetch()} />}
      {cases.isSuccess && cases.data.data.length === 0 && (
        <EmptyState filtered={Boolean(q)} description={t('pages.runDetail.addEmpty')} />
      )}
      {cases.isSuccess && cases.data.data.length > 0 && (
        <>
          <label className="mb-2 flex min-h-11 items-center gap-3 px-3 text-sm font-medium">
            <input
              type="checkbox"
              className="size-4.5 accent-brand-700"
              checked={allChosen}
              disabled={candidates.length === 0}
              onChange={() =>
                setSelected(allChosen ? new Set() : new Set(candidates.map((c) => c.id)))
              }
            />
            {t('pages.runDetail.selectAll')}
          </label>
          <ul className="max-h-96 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {cases.data.data.map((c) => {
              const already = inRun.has(c.id)
              return (
                <li key={c.id}>
                  <label
                    className={`flex min-h-11 items-start gap-3 px-3 py-2.5 text-sm ${
                      already ? 'text-ink-muted' : 'cursor-pointer hover:bg-brand-50/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4.5 shrink-0 accent-brand-700"
                      checked={already || selected.has(c.id)}
                      disabled={already}
                      onChange={() => toggle(c.id)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-semibold text-brand-700">
                        {c.case_code}
                        {c.module && (
                          <span className="font-normal text-ink-muted">
                            {' '}
                            · {c.module.module_code}
                          </span>
                        )}
                      </span>
                      <span className="block break-words">{c.title}</span>
                    </span>
                    {already && <Badge tone="muted" label={t('pages.runDetail.inRun')} />}
                  </label>
                </li>
              )
            })}
          </ul>
        </>
      )}
      <div className="mt-4 space-y-3">
        <FormAlert message={error} />
        <div className="flex justify-end">
          <Button
            icon={Plus}
            disabled={selected.size === 0}
            loading={add.isPending}
            onClick={() => {
              setError(null)
              add.mutate()
            }}
          >
            {t('pages.runDetail.addSubmit', { count: selected.size })}
          </Button>
        </div>
      </div>
    </Section>
  )
}

function BulkBar({
  code,
  run,
  rows,
  members,
  canAssign,
  canRemove,
  defaultAssignee,
  onDone,
}: {
  code: string
  run: TestRunDetail
  rows: RunCaseRow[]
  members: MemberDto[]
  canAssign: boolean
  canRemove: boolean
  defaultAssignee: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [assignee, setAssignee] = useState(defaultAssignee)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const ids = rows.map((row) => row.run_case_id)

  const assign = useMutation({
    mutationFn: () =>
      ds.assignRunCases(code, run.id, { run_case_ids: ids, assigned_to: assignee || null }),
    onSuccess: async (result) => {
      await invalidateRunData(queryClient, code, run.id)
      const name = members.find((m) => m.user.id === assignee)?.user.display_name
      toast.show(
        name
          ? t('pages.runDetail.assigned', { count: result.updated, name })
          : t('pages.runDetail.unassignedDone', { count: result.updated }),
      )
      onDone()
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })

  const remove = useMutation({
    mutationFn: async () => {
      for (const id of ids) await ds.removeRunCase(code, run.id, id)
    },
    onSuccess: async () => {
      setConfirmRemove(false)
      await invalidateRunData(queryClient, code, run.id)
      toast.show(t('pages.runDetail.removed', { count: ids.length }))
      onDone()
    },
    onError: async (error) => {
      setConfirmRemove(false)
      await invalidateRunData(queryClient, code, run.id)
      toast.show(apiErrorText(t, error), 'error')
    },
  })

  return (
    <div
      role="region"
      aria-label={t('pages.runDetail.selected', { count: rows.length })}
      className="mb-4 flex animate-fade-in flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3"
    >
      <span className="mr-auto text-sm font-semibold text-brand-800">
        {t('pages.runDetail.selected', { count: rows.length })}
      </span>
      {canAssign && (
        <>
          <select
            aria-label={t('pages.runDetail.addAssignee')}
            className={INLINE_SELECT}
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">{t('pages.runDetail.unassigned')}</option>
            {members.map((m) => (
              <option key={m.user.id} value={m.user.id}>
                {m.user.display_name}
              </option>
            ))}
          </select>
          <Button icon={UserCheck} loading={assign.isPending} onClick={() => assign.mutate()}>
            {t('pages.runDetail.assignApply')}
          </Button>
        </>
      )}
      {canRemove && (
        <Button
          variant="secondary"
          icon={Trash2}
          onClick={() =>
            rows.some((row) => row.attempts > 0)
              ? toast.show(t('pages.runDetail.removeBlocked'))
              : setConfirmRemove(true)
          }
        >
          {t('pages.runDetail.removeSelected')}
        </Button>
      )}
      <Button variant="ghost" icon={X} onClick={onDone}>
        {t('actions.cancel')}
      </Button>
      <ConfirmDialog
        open={confirmRemove}
        title={t('pages.runDetail.removeTitle', { count: rows.length })}
        body={t('pages.runDetail.removeBody')}
        confirmLabel={t('pages.runDetail.removeSelected')}
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  )
}

export function RunDetailPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const { runId = '' } = useParams()
  const run = useRun(code, runId)
  const me = useCurrentUser()
  const members = useMembers(code)
  const can = useCan(code)
  const filters = useUrlFilters(['status', 'assignee'] as const)
  // A Pengguna's own group decides which scenarios are theirs (ADR 0019).
  const uat = useUat(code, runId, !can('run.write') && Boolean(runId))
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const none = t('fields.none')

  if (run.isPending) return <LoadingState rows={6} />
  if (run.isError) {
    return run.error instanceof ApiClientError && run.error.status === 404 ? (
      <NotFoundPage reason="item" />
    ) : (
      <ErrorState error={run.error} onRetry={() => void run.refetch()} />
    )
  }
  const r = run.data
  const myId = me.data?.id ?? ''
  const people = assignable(members.data)
  const open = r.status_code === 'PLANNED' || r.status_code === 'ACTIVE'
  const canWrite = can('run.write')
  const canAssign = can('run.assign') && r.status_code !== 'LOCKED'
  const canRemove = canWrite && open
  const canSelect = canAssign || canRemove
  const isLead = canWrite

  const assigneeOf = (row: RunCaseRow) => row.assigned_to?.id ?? ''
  // A Pengguna sees the scenarios of the features they are listed for (through their group
  // or by name, ADR 0020) and those given to them.
  const groupCodes =
    !isLead && uat.data?.my_features
      ? new Set(uat.data.my_features.map((m) => m.module_code))
      : null
  const mine = (row: RunCaseRow) =>
    !groupCodes ||
    assigneeOf(row) === myId ||
    (row.module_code !== null && groupCodes.has(row.module_code))
  const rows = r.run_cases.filter(
    (row) =>
      mine(row) &&
      (!filters.values.status || row.latest_status === filters.values.status) &&
      (!filters.values.assignee ||
        (filters.values.assignee === 'me'
          ? assigneeOf(row) === myId
          : filters.values.assignee === 'none'
            ? !row.assigned_to
            : assigneeOf(row) === filters.values.assignee)),
  )
  const chosen = r.run_cases.filter((row) => selected.has(row.run_case_id))
  const rate = passRate(r.counts)
  const workspace = (row: RunCaseRow) => projectPath(code, `runs/${r.id}/cases/${row.run_case_id}`)
  const untried = r.run_cases.filter((row) => row.latest_status === 'NOT_RUN')
  const nextTask =
    r.status_code === 'ACTIVE' && can('execution.run')
      ? isLead
        ? untried[0]
        : (untried.find((row) => assigneeOf(row) === myId) ?? untried.find(mine))
      : undefined
  const visibleIds = rows.map((row) => row.run_case_id)
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))

  return (
    <>
      <PageHeader
        title={r.name}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('nav.uat'), to: projectPath(code, 'uat') },
          { label: r.name, to: projectPath(code, `uat/${r.id}`) },
          { label: t('uat.scenarios') },
        ]}
        badges={
          <>
            <span className="text-sm font-semibold text-brand-700">{r.run_code}</span>
            <RunStatusBadge status={r.status_code} />
          </>
        }
        actions={
          <>
            {nextTask && (
              <ButtonLink to={workspace(nextTask)} icon={Play}>
                {t('pages.runDetail.continueTesting')}
              </ButtonLink>
            )}
            {canWrite && open && !adding && (
              <Button variant="secondary" icon={Plus} onClick={() => setAdding(true)}>
                {t('pages.runDetail.addCases')}
              </Button>
            )}
            {canWrite && <RunStatusActions code={code} run={r} />}
            {canWrite && r.status_code !== 'LOCKED' && (
              <ButtonLink to={projectPath(code, `runs/${r.id}/edit`)} variant="ghost" icon={Pencil}>
                {t('actions.edit')}
              </ButtonLink>
            )}
          </>
        }
      />

      <div className="space-y-6">
        {r.status_code !== 'ACTIVE' && (
          <p className="flex items-start gap-2 rounded-xl border border-info/20 bg-info-soft p-3 text-sm text-info">
            <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {t(`pages.runDetail.notice.${r.status_code}`)}
          </p>
        )}

        {adding && (
          <AddCasesPanel code={code} run={r} members={people} onClose={() => setAdding(false)} />
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile
            icon={ClipboardList}
            tone="lavender"
            label={t('pages.dashboard.kpiPlanned')}
            value={formatNumber(r.total_cases, locale)}
          />
          <StatTile
            icon={CircleCheck}
            tone="mint"
            label={t('pages.dashboard.kpiExecuted')}
            value={formatNumber(executedOf(r.counts), locale)}
          />
          <StatTile
            icon={Percent}
            tone="sky"
            label={t('pages.dashboard.kpiPassRate')}
            value={rate === null ? none : formatPercent(rate, locale)}
          />
          <StatTile
            icon={CircleX}
            tone="peach"
            label={t('codes.execution.FAILED')}
            value={formatNumber(r.counts.FAILED, locale)}
          />
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Section
            title={t('pages.dashboard.statusHeading')}
            description={t('pages.dashboard.statusNote')}
          >
            <StatusBar counts={r.counts} />
          </Section>
          <Section headingLevel={2}>
            <DescriptionList
              items={[
                { label: t('fields.cycle'), value: r.cycle?.title ?? none },
                { label: t('fields.environment'), value: r.environment_name ?? none },
                { label: t('fields.build'), value: r.build_version ?? none },
                {
                  label: t('fields.environmentUrl'),
                  value: r.environment_url ? (
                    <a
                      href={r.environment_url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="break-all text-brand-700 hover:underline"
                    >
                      {r.environment_url}
                    </a>
                  ) : (
                    none
                  ),
                },
                {
                  label: t('fields.period'),
                  value: r.starts_at
                    ? `${formatDateTime(r.starts_at, locale)}${r.ends_at ? ` - ${formatDateTime(r.ends_at, locale)}` : ''}`
                    : none,
                  wide: true,
                },
              ]}
            />
          </Section>
        </div>

        <Section
          title={t('pages.runDetail.casesHeading')}
          description={t('pages.runDetail.snapshotNote')}
        >
          {r.run_cases.length === 0 ? (
            <EmptyState description={t('pages.runDetail.empty')} />
          ) : (
            <>
              <FilterBar onReset={filters.active ? filters.reset : undefined}>
                <SelectFilter
                  label={t('filters.status')}
                  value={filters.values.status}
                  onChange={(value) => filters.setFilter('status', value)}
                  options={EXECUTION_STATUSES.map((s) => ({
                    value: s,
                    label: `${t(`codes.execution.${s}`)} (${r.counts[s]})`,
                  }))}
                />
                <SelectFilter
                  label={t('pages.runDetail.assigneeFilter')}
                  value={filters.values.assignee}
                  onChange={(value) => filters.setFilter('assignee', value)}
                  options={[
                    ...(myId ? [{ value: 'me', label: t('pages.runDetail.myTasks') }] : []),
                    { value: 'none', label: t('pages.runDetail.unassigned') },
                    ...people.map((m) => ({ value: m.user.id, label: m.user.display_name })),
                  ]}
                />
              </FilterBar>

              {canSelect && chosen.length > 0 && (
                <BulkBar
                  code={code}
                  run={r}
                  rows={chosen}
                  members={people}
                  canAssign={canAssign}
                  canRemove={canRemove}
                  defaultAssignee={people.find((m) => m.role_code === 'TESTER')?.user.id ?? ''}
                  onDone={() => setSelected(new Set())}
                />
              )}

              {rows.length === 0 ? (
                <EmptyState filtered description={t('pages.runDetail.emptyFiltered')} />
              ) : (
                <ResponsiveTable<RunCaseRow>
                  caption={t('pages.runDetail.casesHeading')}
                  rows={rows}
                  rowKey={(row) => row.run_case_id}
                  rowLink={workspace}
                  selection={
                    canSelect
                      ? {
                          isSelected: (row) => selected.has(row.run_case_id),
                          onToggle: (row) =>
                            setSelected((prev) => {
                              const next = new Set(prev)
                              if (next.has(row.run_case_id)) next.delete(row.run_case_id)
                              else next.add(row.run_case_id)
                              return next
                            }),
                          onToggleAll: () =>
                            setSelected((prev) => {
                              const next = new Set(prev)
                              for (const id of visibleIds) {
                                if (allVisibleSelected) next.delete(id)
                                else next.add(id)
                              }
                              return next
                            }),
                          allSelected: allVisibleSelected,
                          someSelected: visibleIds.some((id) => selected.has(id)),
                          rowLabel: (row) =>
                            t('pages.runDetail.selectRow', { code: row.case_code }),
                          allLabel: t('pages.runDetail.selectAll'),
                        }
                      : undefined
                  }
                  primary={(row) => ({ code: row.case_code, title: row.title })}
                  cardFields={(row) => (
                    <>
                      <ExecutionStatusBadge status={row.latest_status} />
                      <span className="text-xs text-ink-muted">
                        {row.assigned_to?.display_name ?? t('pages.runDetail.unassigned')} ·{' '}
                        {t('fields.attempts')} {row.attempts}
                      </span>
                    </>
                  )}
                  columns={[
                    {
                      key: 'code',
                      header: t('fields.caseCode'),
                      render: (row) => row.case_code,
                      className: 'whitespace-nowrap',
                    },
                    {
                      key: 'title',
                      header: t('fields.title'),
                      className: 'min-w-48',
                      render: (row) => (
                        <>
                          {row.title}
                          <span className="block text-xs text-ink-muted">
                            {t('fields.version')} {row.case_version}
                          </span>
                        </>
                      ),
                    },
                    {
                      key: 'assignee',
                      header: t('fields.assignee'),
                      render: (row) =>
                        row.assigned_to ? (
                          <span
                            className={
                              row.assigned_to.id === myId ? 'font-semibold text-brand-800' : ''
                            }
                          >
                            {row.assigned_to.display_name}
                          </span>
                        ) : (
                          <span className="text-ink-muted">{t('pages.runDetail.unassigned')}</span>
                        ),
                      hideBelow: 'lg',
                    },
                    {
                      key: 'status',
                      header: t('fields.status'),
                      render: (row) => <ExecutionStatusBadge status={row.latest_status} />,
                    },
                    {
                      key: 'attempts',
                      header: t('fields.attempts'),
                      render: (row) => <span className="tabular-nums">{row.attempts}</span>,
                    },
                    {
                      key: 'tested',
                      header: t('fields.lastTested'),
                      render: (row) =>
                        row.last_tested_at ? (
                          <span className="text-ink-muted tabular-nums">
                            {formatShortDateTime(row.last_tested_at, locale)}
                          </span>
                        ) : (
                          none
                        ),
                      className: 'whitespace-nowrap',
                      hideBelow: 'xl',
                    },
                    {
                      key: 'bugs',
                      header: t('fields.linkedBugs'),
                      render: (row) =>
                        row.defect_codes.length === 0 ? (
                          none
                        ) : (
                          <span className="flex flex-col gap-0.5">
                            {row.defect_codes.map((bug) => (
                              <Link
                                key={bug}
                                to={`${projectPath(code, 'bugs')}?q=${encodeURIComponent(bug)}`}
                                className="text-xs font-semibold text-brand-700 hover:underline"
                              >
                                {bug}
                              </Link>
                            ))}
                          </span>
                        ),
                      hideBelow: 'xl',
                    },
                  ]}
                />
              )}
            </>
          )}
        </Section>
      </div>
    </>
  )
}
