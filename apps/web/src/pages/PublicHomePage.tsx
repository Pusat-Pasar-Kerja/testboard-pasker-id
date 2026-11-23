import { emptyCounts, type PublicCycleSummary, type ResultCounts } from '@testboard/shared'
import {
  ArrowRight,
  BookOpen,
  Bug,
  Camera,
  CircleCheckBig,
  ClipboardCheck,
  Layers,
  QrCode,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { StatTile } from '../components/charts/StatTile'
import { CycleStatusBadge } from '../components/status/StatusBadges'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { ProgressMeter } from '../components/workshop/ProgressMeter'
import { usePublicCycles } from '../hooks/workshop-queries'
import { PublicSiteLayout } from '../layout/PublicSiteLayout'
import { formatDate, formatNumber, toLocale } from '../lib/format'
import { triedPercent } from '../lib/workshop'

function Period({ cycle }: { cycle: PublicCycleSummary }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  if (!cycle.period || (!cycle.period.starts_on && !cycle.period.ends_on)) return null
  const from = cycle.period.starts_on ? formatDate(cycle.period.starts_on, locale) : '…'
  const to = cycle.period.ends_on ? formatDate(cycle.period.ends_on, locale) : '…'
  return <p className="text-sm text-ink-muted">{t('public.period', { from, to })}</p>
}

function CycleCard({ cycle }: { cycle: PublicCycleSummary }) {
  const { t } = useTranslation()
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-brand-700">{cycle.project.name}</p>
        <CycleStatusBadge status={cycle.status_code as 'PLANNED' | 'ACTIVE' | 'COMPLETED'} />
      </div>
      <h3 className="mt-1 text-2xl leading-tight font-bold">{cycle.title}</h3>
      <Period cycle={cycle} />
      {cycle.intro && <p className="mt-3 whitespace-pre-line text-ink">{cycle.intro}</p>}
      {cycle.description && (
        <p className="mt-2 text-sm whitespace-pre-line text-ink-muted">{cycle.description}</p>
      )}
      {cycle.progress && (
        <div className="mt-4">
          <ProgressMeter counts={cycle.progress} />
        </div>
      )}
      <div className="mt-auto pt-5">
        <Link
          to={`/publik/${cycle.id}`}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 text-base font-semibold text-white hover:bg-brand-800 sm:w-auto"
        >
          {t('public.openCycle')}
          <ArrowRight aria-hidden="true" className="size-5" />
        </Link>
      </div>
    </li>
  )
}

const add = (a: ResultCounts, b: ResultCounts): ResultCounts => ({
  total: a.total + b.total,
  tried: a.tried + b.tried,
  passed: a.passed + b.passed,
  failed: a.failed + b.failed,
  blocked: a.blocked + b.blocked,
  skipped: a.skipped + b.skipped,
})

/**
 * Totals over every public Fase (audit 2026-11-24: leaders saw no overall numbers). Each
 * figure only counts the Fases that chose to show that part, so nothing hidden leaks out.
 */
function PublicTotals({ cycles }: { cycles: PublicCycleSummary[] }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const n = (value: number) => formatNumber(value, locale)
  const projects = new Set(cycles.map((c) => c.project.code)).size
  const withProgress = cycles.filter((c) => c.progress)
  const progress = withProgress.reduce((sum, c) => add(sum, c.progress!), emptyCounts())
  const withBugs = cycles.filter((c) => c.bug_count !== undefined)
  const bugs = withBugs.reduce((sum, c) => sum + (c.bug_count ?? 0), 0)
  const open = withBugs.reduce((sum, c) => sum + (c.bug_open ?? 0), 0)
  const passedShare =
    progress.tried === 0 ? 0 : Math.round((progress.passed / progress.tried) * 100)
  const partial =
    (withProgress.length > 0 && withProgress.length < cycles.length) ||
    (withBugs.length > 0 && withBugs.length < cycles.length)

  return (
    <section aria-labelledby="ringkasan" className="mt-10">
      <h2 id="ringkasan" className="text-2xl font-bold">
        {t('public.totals.title')}
      </h2>
      <p className="mt-1 text-ink-muted">{t('public.totals.subtitle')}</p>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t('public.totals.cycles')}
          value={n(cycles.length)}
          hint={t('public.totals.projects', { count: projects })}
          icon={Layers}
          tone="sky"
        />
        {withProgress.length > 0 && (
          <>
            <StatTile
              label={t('public.totals.tried')}
              value={`${triedPercent(progress)}%`}
              hint={t('public.totals.triedHint', {
                tried: n(progress.tried),
                total: n(progress.total),
              })}
              icon={ClipboardCheck}
              tone="lavender"
            />
            <StatTile
              label={t('public.totals.passed')}
              value={n(progress.passed)}
              hint={t('public.totals.passedHint', { percent: passedShare })}
              icon={CircleCheckBig}
              tone="mint"
            />
          </>
        )}
        {withBugs.length > 0 && (
          <StatTile
            label={t('public.totals.bugs')}
            value={n(bugs)}
            hint={t('public.totals.bugsHint', { count: open, open: n(open) })}
            icon={Bug}
            tone="peach"
          />
        )}
      </div>
      {withProgress.length > 0 && (
        <div className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-xs">
          <ProgressMeter counts={progress} legend size="lg" />
        </div>
      )}
      {partial && <p className="mt-2 text-sm text-ink-muted">{t('public.totals.partial')}</p>}
    </section>
  )
}

const STEPS: { key: 'gather' | 'scan' | 'answer' | 'photo'; icon: LucideIcon; tone: string }[] = [
  { key: 'gather', icon: UsersRound, tone: 'bg-pastel-lavender text-pastel-lavender-ink' },
  { key: 'scan', icon: QrCode, tone: 'bg-pastel-sky text-pastel-sky-ink' },
  { key: 'answer', icon: CircleCheckBig, tone: 'bg-pastel-mint text-pastel-mint-ink' },
  { key: 'photo', icon: Camera, tone: 'bg-pastel-peach text-pastel-peach-ink' },
]

/** Front page for everyone: the Fases open to the public and how to join a table. */
export function PublicHomePage() {
  const { t } = useTranslation()
  const cycles = usePublicCycles()

  return (
    <PublicSiteLayout>
      <section className="relative isolate overflow-hidden rounded-3xl border border-line bg-surface px-6 py-10 shadow-xs sm:px-10 sm:py-14">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-20 -right-16 size-72 rounded-full bg-pastel-lavender" />
          <div className="absolute -bottom-24 left-1/3 size-64 rounded-full bg-pastel-mint/80" />
          <div className="absolute top-10 left-2/3 size-20 rounded-full bg-pastel-butter" />
        </div>
        <p className="text-sm font-semibold tracking-wide text-brand-700 uppercase">
          {t('public.eyebrow')}
        </p>
        <h1 className="mt-2 max-w-3xl text-3xl leading-tight font-bold sm:text-5xl">
          {t('public.title')}
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-ink-muted">{t('public.subtitle')}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/meja"
            className="inline-flex min-h-14 items-center gap-2 rounded-xl bg-brand-700 px-6 text-lg font-semibold text-white shadow-sm hover:bg-brand-800"
          >
            <QrCode aria-hidden="true" className="size-6" />
            {t('public.tableSignIn')}
          </Link>
          <Link
            to="/panduan"
            className="inline-flex min-h-14 items-center gap-2 rounded-xl border border-line-strong bg-surface px-6 text-lg font-semibold text-ink hover:bg-neutral-soft"
          >
            <BookOpen aria-hidden="true" className="size-6" />
            {t('public.howTo')}
          </Link>
        </div>
      </section>

      {cycles.isSuccess && cycles.data.length > 0 && <PublicTotals cycles={cycles.data} />}

      <section aria-labelledby="fase" className="mt-10">
        <h2 id="fase" className="text-2xl font-bold">
          {t('public.cyclesTitle')}
        </h2>
        <p className="mt-1 text-ink-muted">{t('public.cyclesSubtitle')}</p>
        <div className="mt-5">
          {cycles.isPending && <LoadingState rows={3} />}
          {cycles.isError && (
            <ErrorState error={cycles.error} onRetry={() => void cycles.refetch()} />
          )}
          {cycles.isSuccess && cycles.data.length === 0 && (
            <EmptyState description={t('public.noCycles')} />
          )}
          {cycles.isSuccess && cycles.data.length > 0 && (
            <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {cycles.data.map((cycle) => (
                <CycleCard key={cycle.id} cycle={cycle} />
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="cara" className="mt-12">
        <h2 id="cara" className="text-2xl font-bold">
          {t('public.stepsTitle')}
        </h2>
        <ol className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, index) => (
            <li key={step.key} className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
              <span
                className={`inline-flex size-12 items-center justify-center rounded-2xl ${step.tone}`}
              >
                <step.icon aria-hidden="true" className="size-6" />
              </span>
              <p className="mt-3 text-sm font-semibold text-ink-muted">
                {t('public.stepNumber', { n: index + 1 })}
              </p>
              <h3 className="text-lg font-semibold">{t(`public.steps.${step.key}.title`)}</h3>
              <p className="mt-1 text-ink-muted">{t(`public.steps.${step.key}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>
    </PublicSiteLayout>
  )
}
