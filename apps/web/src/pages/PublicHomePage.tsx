import {
  emptyCounts,
  type PublicBugReportingDto,
  type PublicUatSummary,
  type ResultCounts,
} from '@testboard/shared'
import {
  ArrowRight,
  BookOpen,
  Bug,
  Camera,
  CircleCheckBig,
  ClipboardCheck,
  Layers,
  MessageSquarePlus,
  QrCode,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { StatTile } from '../components/charts/StatTile'
import { RunStatusBadge } from '../components/status/StatusBadges'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { ProgressMeter } from '../components/workshop/ProgressMeter'
import { usePublicBugReportingList, usePublicUats } from '../hooks/workshop-queries'
import { PublicSiteLayout } from '../layout/PublicSiteLayout'
import { formatDate, formatNumber, toLocale } from '../lib/format'
import { triedPercent } from '../lib/workshop'

export function Period({ uat }: { uat: PublicUatSummary }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  if (!uat.period || (!uat.period.starts_on && !uat.period.ends_on)) return null
  const from = uat.period.starts_on ? formatDate(uat.period.starts_on, locale) : '…'
  const to = uat.period.ends_on ? formatDate(uat.period.ends_on, locale) : '…'
  return <p className="text-sm text-ink-muted">{t('public.period', { from, to })}</p>
}

function UatCard({ uat }: { uat: PublicUatSummary }) {
  const { t } = useTranslation()
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-xs transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-semibold text-brand-700">
          {[uat.project.name, uat.phase?.title].filter(Boolean).join(' · ')}
        </p>
        <RunStatusBadge status={uat.status_code} />
      </div>
      <h3 className="mt-1 text-2xl leading-tight font-bold">{uat.name}</h3>
      <Period uat={uat} />
      {uat.intro && <p className="mt-3 whitespace-pre-line text-ink">{uat.intro}</p>}
      {uat.description && (
        <p className="mt-2 text-sm whitespace-pre-line text-ink-muted">{uat.description}</p>
      )}
      {uat.progress && (
        <div className="mt-4">
          <ProgressMeter counts={uat.progress} />
        </div>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        <Link
          to={`/publik/uat/${uat.id}`}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 text-base font-semibold text-white hover:bg-brand-800 sm:w-auto"
        >
          {t('public.openUat')}
          <ArrowRight aria-hidden="true" className="size-5" />
        </Link>
        {uat.bug_reporting_public && (
          <Link
            to={`/publik/masalah/${encodeURIComponent(uat.project.code)}`}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line-strong px-5 text-base font-semibold text-ink hover:bg-neutral-soft sm:w-auto"
          >
            <Bug aria-hidden="true" className="size-5" />
            {t('public.openBugs')}
          </Link>
        )}
      </div>
    </li>
  )
}

/** A project's public Bug Reporting: its problem list and, when open, the report form. */
function BugReportingCard({ item }: { item: PublicBugReportingDto }) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const path = `/publik/masalah/${encodeURIComponent(item.project.code)}`
  return (
    <li className="flex flex-col rounded-2xl border border-line bg-surface p-6 shadow-xs">
      <p className="text-sm font-semibold text-brand-700">{t('public.bugReporting')}</p>
      <h3 className="mt-1 text-2xl leading-tight font-bold">{item.project.name}</h3>
      {item.intro && <p className="mt-3 whitespace-pre-line text-ink">{item.intro}</p>}
      {item.fields.includes('bugs.list') && (
        <p className="mt-3 text-ink-muted">
          {t('public.bugCounts', {
            count: item.bug_count,
            total: formatNumber(item.bug_count, locale),
            open: formatNumber(item.bug_open, locale),
          })}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-5">
        {item.fields.includes('bugs.list') && (
          <Link
            to={path}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line-strong px-5 text-base font-semibold text-ink hover:bg-neutral-soft sm:w-auto"
          >
            <Bug aria-hidden="true" className="size-5" />
            {t('public.openBugs')}
          </Link>
        )}
        {item.accept_reports && (
          <Link
            to={`${path}#lapor`}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-brand-700 px-5 text-base font-semibold text-white hover:bg-brand-800 sm:w-auto"
          >
            <MessageSquarePlus aria-hidden="true" className="size-5" />
            {t('public.report.open')}
          </Link>
        )}
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
 * Totals over every public UAT and Bug Reporting (audit 2026-11-24: leaders saw no overall
 * numbers). Each figure only counts what chose to show that part, so nothing hidden leaks.
 */
function PublicTotals({
  uats,
  reporting,
}: {
  uats: PublicUatSummary[]
  reporting: PublicBugReportingDto[]
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const n = (value: number) => formatNumber(value, locale)
  const projects = new Set(uats.map((c) => c.project.code)).size
  const withProgress = uats.filter((c) => c.progress)
  const progress = withProgress.reduce((sum, c) => add(sum, c.progress!), emptyCounts())
  const withBugs = reporting.filter((r) => r.fields.includes('bugs.list'))
  const bugs = withBugs.reduce((sum, r) => sum + r.bug_count, 0)
  const open = withBugs.reduce((sum, r) => sum + r.bug_open, 0)
  const passedShare =
    progress.tried === 0 ? 0 : Math.round((progress.passed / progress.tried) * 100)
  const partial = withProgress.length > 0 && withProgress.length < uats.length

  return (
    <section aria-labelledby="ringkasan" className="mt-10">
      <h2 id="ringkasan" className="text-2xl font-bold">
        {t('public.totals.title')}
      </h2>
      <p className="mt-1 text-ink-muted">{t('public.totals.subtitle')}</p>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label={t('public.totals.uats')}
          value={n(uats.length)}
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

/**
 * Front page for everyone: the UATs open to the public, the projects whose Bug Reporting is
 * public (with the report form when open), and how to join a group.
 */
export function PublicHomePage() {
  const { t } = useTranslation()
  const uats = usePublicUats()
  const reporting = usePublicBugReportingList()

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

      {uats.isSuccess && (uats.data.length > 0 || (reporting.data?.length ?? 0) > 0) && (
        <PublicTotals uats={uats.data} reporting={reporting.data ?? []} />
      )}

      <section aria-labelledby="uat" className="mt-10">
        <h2 id="uat" className="text-2xl font-bold">
          {t('public.uatsTitle')}
        </h2>
        <p className="mt-1 text-ink-muted">{t('public.uatsSubtitle')}</p>
        <div className="mt-5">
          {uats.isPending && <LoadingState rows={3} />}
          {uats.isError && <ErrorState error={uats.error} onRetry={() => void uats.refetch()} />}
          {uats.isSuccess && uats.data.length === 0 && (
            <EmptyState description={t('public.noUats')} />
          )}
          {uats.isSuccess && uats.data.length > 0 && (
            <ul className="grid grid-cols-1 gap-5 md:grid-cols-2">
              {uats.data.map((uat) => (
                <UatCard key={uat.id} uat={uat} />
              ))}
            </ul>
          )}
        </div>
      </section>

      {reporting.isSuccess && reporting.data.length > 0 && (
        <section aria-labelledby="masalah" className="mt-10">
          <h2 id="masalah" className="text-2xl font-bold">
            {t('public.bugReportingTitle')}
          </h2>
          <p className="mt-1 text-ink-muted">{t('public.bugReportingSubtitle')}</p>
          <ul className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2">
            {reporting.data.map((item) => (
              <BugReportingCard key={item.project.code} item={item} />
            ))}
          </ul>
        </section>
      )}

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
