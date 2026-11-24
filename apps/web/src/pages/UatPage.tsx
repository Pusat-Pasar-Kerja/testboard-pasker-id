import {
  canTransitionRun,
  uatUpdateSchema,
  type RunStatus,
  type UatDetailDto,
} from '@testboard/shared'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  Bug,
  CircleCheck,
  CircleDashed,
  ClipboardCheck,
  ExternalLink,
  ListChecks,
  MonitorPlay,
  Pencil,
  Play,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { RunStatusBadge } from '../components/status/StatusBadges'
import { ParticipantsTab } from '../components/uat/ParticipantsTab'
import { Badge } from '../components/ui/Badge'
import { Button, ButtonLink } from '../components/ui/Button'
import { ConfirmDialog } from '../components/ui/Dialog'
import { FormAlert, TextField } from '../components/ui/Form'
import { FormDialog } from '../components/ui/FormDialog'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { ErrorState, LoadingState } from '../components/ui/States'
import { Tabs } from '../components/ui/Tabs'
import { useToast } from '../components/ui/toast-context'
import { BoardTab } from '../components/workshop/admin/BoardTab'
import { FeaturesTab } from '../components/workshop/admin/FeaturesTab'
import { InboxTab } from '../components/workshop/admin/InboxTab'
import { PublicTab } from '../components/workshop/admin/PublicTab'
import { TablesTab } from '../components/workshop/admin/TablesTab'
import { ProgressMeter } from '../components/workshop/ProgressMeter'
import { useCan } from '../hooks/permissions'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { invalidateStructure, useUat } from '../hooks/structure-queries'
import { useWorkshopBoard } from '../hooks/workshop-queries'
import { apiErrorText } from '../lib/api-errors'
import { formatDate, toLocale } from '../lib/format'
import { groupLabel } from '../lib/uat'
import { fromLocalInput, toLocalInput } from '../lib/workshop'
import { useDataSource } from '../services/use-data-source'

/** The next step of a UAT in plain words: start, finish, open again, lock the results. */
interface Step {
  to: 'ACTIVE' | 'COMPLETED' | 'LOCKED'
  label: 'PLANNED_ACTIVE' | 'ACTIVE_COMPLETED' | 'COMPLETED_ACTIVE' | 'COMPLETED_LOCKED'
}
const STEPS: Partial<Record<RunStatus, Step[]>> = {
  PLANNED: [{ to: 'ACTIVE', label: 'PLANNED_ACTIVE' }],
  ACTIVE: [{ to: 'COMPLETED', label: 'ACTIVE_COMPLETED' }],
  COMPLETED: [
    { to: 'ACTIVE', label: 'COMPLETED_ACTIVE' },
    { to: 'LOCKED', label: 'COMPLETED_LOCKED' },
  ],
}

function StatusActions({ code, uat }: { code: string; uat: UatDetailDto }) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [pending, setPending] = useState<Step | null>(null)
  const change = useMutation({
    mutationFn: (step: Step) => ds.changeRunStatus(code, uat.id, step.to),
    onSettled: () => setPending(null),
    onSuccess: async (_r, step) => {
      await invalidateStructure(queryClient, code)
      toast.show(t(`uat.status.done.${step.to}`, { name: uat.name }))
    },
    onError: (error) => toast.show(apiErrorText(t, error), 'error'),
  })
  const next = (STEPS[uat.status_code] ?? []).filter((step) =>
    canTransitionRun(uat.status_code, step.to),
  )
  if (next.length === 0) return null
  return (
    <>
      {next.map((step) => (
        <Button
          key={step.label}
          variant={step.label === 'PLANNED_ACTIVE' ? 'primary' : 'secondary'}
          icon={step.to === 'ACTIVE' ? Play : CircleCheck}
          onClick={() => setPending(step)}
        >
          {t(`uat.status.action.${step.label}`)}
        </Button>
      ))}
      <ConfirmDialog
        open={pending !== null}
        title={pending ? t(`uat.status.action.${pending.label}`) : ''}
        body={pending ? t(`uat.status.confirm.${pending.to}`) : undefined}
        confirmLabel={pending ? t(`uat.status.action.${pending.label}`) : ''}
        tone={pending?.to === 'LOCKED' ? 'danger' : 'primary'}
        busy={change.isPending}
        onConfirm={() => pending && change.mutate(pending)}
        onCancel={() => setPending(null)}
      />
    </>
  )
}

function EditUatDialog({
  code,
  uat,
  onClose,
}: {
  code: string
  uat: UatDetailDto
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ds = useDataSource()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [name, setName] = useState(uat.name)
  const [startsAt, setStartsAt] = useState(uat.starts_at ? toLocalInput(uat.starts_at) : '')
  const [endsAt, setEndsAt] = useState(uat.ends_at ? toLocalInput(uat.ends_at) : '')
  const [error, setError] = useState<string | null>(null)
  const save = useMutation({
    mutationFn: () =>
      ds.updateUat(code, uat.id, {
        name: name.trim(),
        starts_at: fromLocalInput(startsAt),
        ends_at: fromLocalInput(endsAt),
      }),
    onSuccess: async () => {
      await invalidateStructure(queryClient, code)
      toast.show(t('uat.saved'))
      onClose()
    },
    onError: (e) => setError(apiErrorText(t, e)),
  })
  const submit = () => {
    const input = {
      name: name.trim(),
      starts_at: fromLocalInput(startsAt),
      ends_at: fromLocalInput(endsAt),
    }
    const parsed = uatUpdateSchema.safeParse(input)
    if (!input.name) {
      setError(t('form.required'))
      return
    }
    if (!parsed.success) {
      setError(t('uat.create.dateOrder'))
      return
    }
    save.mutate()
  }
  return (
    <FormDialog
      open
      title={t('uat.editTitle', { name: uat.name })}
      submitLabel={t('actions.save')}
      busy={save.isPending}
      onSubmit={submit}
      onCancel={onClose}
    >
      <TextField
        label={t('uat.name')}
        required
        value={name}
        maxLength={255}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          type="datetime-local"
          label={t('uat.startsAt')}
          value={startsAt}
          onChange={(e) => setStartsAt(e.target.value)}
        />
        <TextField
          type="datetime-local"
          label={t('uat.endsAt')}
          value={endsAt}
          onChange={(e) => setEndsAt(e.target.value)}
        />
      </div>
      <FormAlert message={error} />
    </FormDialog>
  )
}

/** What still has to be done before the UAT can start, in plain steps. */
function SetupChecklist({ uat, onTab }: { uat: UatDetailDto; onTab: (tab: string) => void }) {
  const { t } = useTranslation()
  const steps = [
    { key: 'features', done: uat.features > 0 && uat.progress.total > 0, tab: 'fitur' },
    { key: 'people', done: uat.participants > 0 || uat.groups > 0, tab: 'peserta' },
    { key: 'groups', done: uat.groups > 0, tab: 'kelompok' },
    { key: 'start', done: uat.status_code !== 'PLANNED', tab: null },
    { key: 'public', done: uat.is_public, tab: 'publik' },
  ] as const
  if (steps.every((s) => s.done)) return null
  return (
    <Section title={t('uat.setup.title')}>
      <p className="mb-3 text-sm text-ink-muted">{t('uat.setup.intro')}</p>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.key} className="flex flex-wrap items-center gap-3">
            {step.done ? (
              <CircleCheck aria-hidden="true" className="size-5 text-success" />
            ) : (
              <CircleDashed aria-hidden="true" className="size-5 text-ink-muted" />
            )}
            <span className={step.done ? 'text-ink-muted line-through' : 'font-medium'}>
              {index + 1}. {t(`uat.setup.${step.key}`)}
            </span>
            {!step.done && step.tab && (
              <button
                type="button"
                onClick={() => onTab(step.tab)}
                className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
              >
                {t('workshop.setup.go')}
                <ArrowRight aria-hidden="true" className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ol>
    </Section>
  )
}

/** A Pengguna's view of their UAT: their group, the features, and where to start. */
function MyUatView({ code, uat }: { code: string; uat: UatDetailDto }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-6">
      <Section title={t('uat.mine.title')}>
        <p className="text-base">
          {uat.my_group
            ? t('uat.yourGroup', { group: groupLabel(t, uat.my_group) })
            : t('uat.noGroupYet')}
        </p>
        <ProgressMeter counts={uat.progress} legend />
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink to={projectPath(code, `runs/${uat.id}`)} icon={ListChecks}>
            {t('uat.mine.start')}
          </ButtonLink>
          {uat.my_group && (
            <ButtonLink to="/tugas" icon={ClipboardCheck} variant="secondary">
              {t('uat.mine.easyMode')}
            </ButtonLink>
          )}
          <ButtonLink
            to={`${projectPath(code, 'bugs/new')}?uat=${uat.id}`}
            icon={Bug}
            variant="secondary"
          >
            {t('uat.mine.report')}
          </ButtonLink>
        </div>
      </Section>
      <Section title={t('uat.mine.features')}>
        <ul className="space-y-3">
          {uat.feature_list
            .filter((f) => f.state !== 'HIDDEN')
            .map((feature) => (
              <li
                key={feature.module.id}
                className="grid gap-2 rounded-xl border border-line p-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:items-center"
              >
                <p className="font-semibold">{feature.module.name}</p>
                <ProgressMeter counts={feature.progress} size="sm" />
              </li>
            ))}
        </ul>
      </Section>
    </div>
  )
}

/**
 * One UAT (ADR 0019): a Fase with chosen features, its people and groups with table
 * numbers, the live board, problems to review and its own public page. A Pengguna sees
 * their own group and where to start.
 */
export function UatPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const code = useProjectCode()
  const { uatId = '' } = useParams()
  const can = useCan(code)
  const manager = can('run.write')
  const [params, setParams] = useSearchParams()
  const uat = useUat(code, uatId)
  const board = useWorkshopBoard(code, uatId, 15_000, manager)
  const [editing, setEditing] = useState(false)

  if (uat.isPending || (manager && board.isPending)) return <LoadingState rows={6} />
  if (uat.isError) return <ErrorState error={uat.error} onRetry={() => void uat.refetch()} />
  if (manager && board.isError) {
    return <ErrorState error={board.error} onRetry={() => void board.refetch()} />
  }
  const data = uat.data
  const setTab = (id: string) => setParams({ tab: id }, { replace: true })
  const period =
    data.starts_at || data.ends_at
      ? `${data.starts_at ? formatDate(data.starts_at, locale) : '…'} – ${
          data.ends_at ? formatDate(data.ends_at, locale) : '…'
        }`
      : null

  const header = (
    <PageHeader
      title={data.name}
      subtitle={[data.phase?.title, period].filter(Boolean).join(' · ')}
      crumbs={[
        { label: code, to: projectPath(code) },
        { label: manager ? t('nav.uat') : t('nav.myUat'), to: projectPath(code, 'uat') },
        { label: data.name },
      ]}
      badges={
        <>
          <RunStatusBadge status={data.status_code} />
          {data.is_public ? (
            <Badge tone="success" label={t('uat.publicOn')} />
          ) : (
            manager && <Badge tone="muted" label={t('uat.publicOff')} />
          )}
        </>
      }
      actions={
        manager ? (
          <div className="flex flex-wrap gap-2">
            <StatusActions code={code} uat={data} />
            <ButtonLink
              to={projectPath(code, `runs/${data.id}`)}
              icon={ListChecks}
              variant="secondary"
            >
              {t('uat.scenarios')}
            </ButtonLink>
            <Button variant="secondary" icon={Pencil} onClick={() => setEditing(true)}>
              {t('uat.edit')}
            </Button>
            <Link
              to={`/layar/${encodeURIComponent(code)}/${data.id}`}
              target="_blank"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-neutral-soft"
            >
              <MonitorPlay aria-hidden="true" className="size-4" />
              {t('workshop.bigScreen')}
            </Link>
            {data.is_public && (
              <Link
                to={`/publik/uat/${data.id}`}
                target="_blank"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-neutral-soft"
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                {t('workshop.publicPage')}
              </Link>
            )}
          </div>
        ) : undefined
      }
    />
  )

  if (!manager || !board.data) {
    return (
      <>
        {header}
        <MyUatView code={code} uat={data} />
      </>
    )
  }

  const boardData = board.data
  const tabs = [
    {
      id: 'papan',
      label: t('uat.tabs.board'),
      content: <BoardTab board={boardData} onOpenInbox={() => setTab('masuk')} />,
    },
    {
      id: 'peserta',
      label: t('uat.tabs.people'),
      count: data.participants,
      content: <ParticipantsTab code={code} uat={data} />,
    },
    {
      id: 'kelompok',
      label: t('uat.tabs.groups'),
      count: boardData.tables.length,
      content: <TablesTab code={code} uat={data} />,
    },
    {
      id: 'fitur',
      label: t('uat.tabs.features'),
      count: boardData.features.length,
      content: <FeaturesTab code={code} board={boardData} canManage={manager} />,
    },
    {
      id: 'masuk',
      label: t('uat.tabs.inbox'),
      count: boardData.bugs.to_review,
      content: <InboxTab code={code} uatId={data.id} canReview={manager} />,
    },
    {
      id: 'publik',
      label: t('uat.tabs.public'),
      content: (
        <PublicTab
          key={`${boardData.uat.is_public}-${boardData.uat.public_fields.join()}`}
          code={code}
          board={boardData}
          canManage={manager}
        />
      ),
    },
  ]
  const active = params.get('tab') ?? 'papan'

  return (
    <>
      {header}
      <div className="space-y-6">
        <SetupChecklist uat={data} onTab={setTab} />
        <Tabs
          label={t('uat.tabsLabel')}
          tabs={tabs}
          active={tabs.some((tab) => tab.id === active) ? active : 'papan'}
          onChange={setTab}
        />
      </div>
      {editing && <EditUatDialog code={code} uat={data} onClose={() => setEditing(false)} />}
    </>
  )
}
