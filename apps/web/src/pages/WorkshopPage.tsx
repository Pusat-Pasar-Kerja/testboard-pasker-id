import type { CycleDto, TestRunSummary, WorkshopBoardDto } from '@testboard/shared'
import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  ExternalLink,
  MonitorPlay,
  Presentation,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { Badge } from '../components/ui/Badge'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { Tabs } from '../components/ui/Tabs'
import { BoardTab } from '../components/workshop/admin/BoardTab'
import { FeaturesTab } from '../components/workshop/admin/FeaturesTab'
import { InboxTab } from '../components/workshop/admin/InboxTab'
import { PublicTab } from '../components/workshop/admin/PublicTab'
import { TablesTab } from '../components/workshop/admin/TablesTab'
import { useCan } from '../hooks/permissions'
import { useCycles, useRuns } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { useWorkshopBoard } from '../hooks/workshop-queries'

/** What still has to be done before the workshop can start, in plain steps. */
function SetupChecklist({
  code,
  cycle,
  runs,
  board,
}: {
  code: string
  cycle: CycleDto
  runs: TestRunSummary[]
  board: WorkshopBoardDto
}) {
  const { t } = useTranslation()
  const cycleRuns = runs.filter((r) => r.cycle?.id === cycle.id)
  const steps = [
    {
      key: 'cases',
      done: board.totals.total > 0 || cycleRuns.some((r) => r.total_cases > 0),
      to: projectPath(code, 'test-cases'),
    },
    { key: 'run', done: cycleRuns.length > 0, to: projectPath(code, 'runs/new') },
    {
      key: 'active',
      done: cycleRuns.some((r) => r.status_code === 'ACTIVE'),
      to: projectPath(code, 'runs'),
    },
    {
      key: 'tables',
      done: board.tables.length > 0 && board.tables.every((tb) => tb.modules.length > 0),
      to: '?tab=meja',
    },
    { key: 'public', done: board.cycle.is_public, to: '?tab=publik' },
  ] as const
  if (steps.every((s) => s.done)) return null
  return (
    <Section title={t('workshop.setup.title')}>
      <p className="mb-3 text-sm text-ink-muted">{t('workshop.setup.intro')}</p>
      <ol className="space-y-2">
        {steps.map((step, index) => (
          <li key={step.key} className="flex flex-wrap items-center gap-3">
            {step.done ? (
              <CircleCheck aria-hidden="true" className="size-5 text-success" />
            ) : (
              <CircleDashed aria-hidden="true" className="size-5 text-ink-muted" />
            )}
            <span className={step.done ? 'text-ink-muted line-through' : 'font-medium'}>
              {index + 1}. {t(`workshop.setup.${step.key}`)}
            </span>
            {!step.done && (
              <Link
                to={step.to}
                className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
              >
                {t('workshop.setup.go')}
                <ArrowRight aria-hidden="true" className="size-4" />
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Section>
  )
}

/** Mode Workshop for facilitators: board, tables, problems to review, public page, features. */
export function WorkshopPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const { cycleId = '' } = useParams()
  const can = useCan(code)
  const canManage = can('run.write')
  const [params, setParams] = useSearchParams()
  const cycles = useCycles(code)
  const runs = useRuns(code)
  const board = useWorkshopBoard(code, cycleId)
  const cycle = cycles.data?.find((c) => c.id === cycleId)

  if (board.isPending || cycles.isPending) return <LoadingState rows={6} />
  if (board.isError) return <ErrorState error={board.error} onRetry={() => void board.refetch()} />
  if (!cycle) return <EmptyState description={t('workshop.notFound')} />
  const data = board.data

  const tabs = [
    {
      id: 'papan',
      label: t('workshop.tabs.board'),
      content: <BoardTab board={data} onOpenInbox={() => setParams({ tab: 'masuk' })} />,
    },
    ...(canManage
      ? [
          {
            id: 'meja',
            label: t('workshop.tabs.tables'),
            count: data.tables.length,
            content: <TablesTab code={code} cycle={cycle} />,
          },
        ]
      : []),
    {
      id: 'masuk',
      label: t('workshop.tabs.inbox'),
      count: data.bugs.to_review,
      content: <InboxTab code={code} cycleId={cycleId} canReview={canManage} />,
    },
    {
      id: 'publik',
      label: t('workshop.tabs.public'),
      content: (
        <PublicTab
          key={`${data.cycle.is_public}-${data.cycle.public_fields.join()}`}
          code={code}
          board={data}
          canManage={canManage}
        />
      ),
    },
    {
      id: 'fitur',
      label: t('workshop.tabs.features'),
      count: data.features.length,
      content: <FeaturesTab code={code} board={data} canManage={canManage} />,
    },
  ]
  const active = params.get('tab') ?? 'papan'

  return (
    <>
      <PageHeader
        title={t('workshop.title', { cycle: cycle.title })}
        subtitle={t('workshop.subtitle')}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('nav.workshop'), to: projectPath(code, 'workshop') },
          { label: cycle.cycle_code },
        ]}
        badges={
          data.cycle.is_public ? (
            <Badge tone="success" label={t('workshop.publicOn')} />
          ) : (
            <Badge tone="muted" label={t('workshop.publicOff')} />
          )
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              to={`/layar/${encodeURIComponent(code)}/${cycleId}`}
              target="_blank"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              <MonitorPlay aria-hidden="true" className="size-4" />
              {t('workshop.bigScreen')}
            </Link>
            {data.cycle.is_public && (
              <Link
                to={`/publik/${cycleId}`}
                target="_blank"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-4 text-sm font-semibold hover:bg-neutral-soft"
              >
                <ExternalLink aria-hidden="true" className="size-4" />
                {t('workshop.publicPage')}
              </Link>
            )}
          </div>
        }
      />
      <div className="space-y-6">
        {canManage && runs.data && (
          <SetupChecklist code={code} cycle={cycle} runs={runs.data} board={data} />
        )}
        <Tabs
          label={t('workshop.tabsLabel')}
          tabs={tabs}
          active={tabs.some((tab) => tab.id === active) ? active : 'papan'}
          onChange={(id) => setParams({ tab: id }, { replace: true })}
        />
      </div>
    </>
  )
}

/** Choose the Fase to run a workshop for. */
export function WorkshopIndexPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const cycles = useCycles(code)
  return (
    <>
      <PageHeader
        title={t('nav.workshop')}
        subtitle={t('workshop.indexSubtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('nav.workshop') }]}
      />
      {cycles.isPending && <LoadingState rows={3} />}
      {cycles.isError && <ErrorState error={cycles.error} onRetry={() => void cycles.refetch()} />}
      {cycles.isSuccess && cycles.data.length === 0 && (
        <EmptyState
          description={t('workshop.noCycles')}
          action={
            <Link
              to={projectPath(code, 'cycles')}
              className="font-semibold text-brand-700 hover:underline"
            >
              {t('workshop.makeCycle')}
            </Link>
          }
        />
      )}
      {cycles.isSuccess && cycles.data.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cycles.data.map((cycle) => (
            <li
              key={cycle.id}
              className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-xs"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold text-brand-700">{cycle.cycle_code}</p>
                  <p className="text-lg font-semibold">{cycle.title}</p>
                </div>
                <Badge
                  tone={cycle.is_public ? 'success' : 'muted'}
                  label={cycle.is_public ? t('workshop.publicOn') : t('workshop.publicOff')}
                />
              </div>
              <Link
                to={projectPath(code, `workshop/${cycle.id}`)}
                className="mt-auto inline-flex min-h-11 items-center gap-2 self-start rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
              >
                <Presentation aria-hidden="true" className="size-4" />
                {t('workshop.open')}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
