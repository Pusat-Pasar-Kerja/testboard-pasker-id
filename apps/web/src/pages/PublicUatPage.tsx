import type { ExecutionStatus, PublicFeatureDto } from '@testboard/shared'
import { ArrowLeft, Bug, ChevronDown, Eye, QrCode, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Navigate, useParams, useSearchParams } from 'react-router'
import { RunStatusBadge } from '../components/status/StatusBadges'
import { Badge } from '../components/ui/Badge'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { ProgressMeter } from '../components/workshop/ProgressMeter'
import { usePublicUat } from '../hooks/workshop-queries'
import { PublicSiteLayout } from '../layout/PublicSiteLayout'
import { formatDate, toLocale } from '../lib/format'
import { ApiClientError } from '../services/api-client'
import type { PublicPreview } from '../services/data-source'
import { useDataSource } from '../services/use-data-source'
import { useQuery } from '@tanstack/react-query'

const STATUS_ICON: Record<ExecutionStatus, string> = {
  PASSED: 'bg-chart-passed',
  FAILED: 'bg-chart-failed',
  BLOCKED: 'bg-chart-blocked',
  SKIPPED: 'bg-chart-skipped',
  IN_PROGRESS: 'bg-chart-progress',
  NOT_RUN: 'bg-chart-track',
}

function FeatureCard({ feature }: { feature: PublicFeatureDto }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-xl font-semibold">{feature.name}</h3>
        <Badge
          tone={feature.state === 'DONE' ? 'success' : 'brand'}
          label={t(`public.featureState.${feature.state === 'DONE' ? 'DONE' : 'OPEN'}`)}
        />
      </div>
      {feature.progress && (
        <div className="mt-3">
          <ProgressMeter counts={feature.progress} legend />
        </div>
      )}
      {feature.tables && feature.tables.length > 0 && (
        <div className="mt-4">
          <p className="text-sm font-semibold text-ink-muted">{t('public.tablesWorking')}</p>
          <ul className="mt-1 flex flex-wrap gap-2">
            {feature.tables.map((table) => (
              <li
                key={table.name}
                className="inline-flex items-center gap-1.5 rounded-full bg-pastel-lavender px-3 py-1 text-sm text-pastel-lavender-ink"
              >
                <UsersRound aria-hidden="true" className="size-4" />
                <span className="font-semibold">{table.name}</span>
                {table.members && table.members.length > 0 && (
                  <span>· {table.members.join(', ')}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {feature.cases && feature.cases.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700"
          >
            <ChevronDown
              aria-hidden="true"
              className={`size-4 transition-transform ${open ? 'rotate-180' : ''}`}
            />
            {t('public.casesToggle', { count: feature.cases.length })}
          </button>
          {open && (
            <ul className="mt-2 divide-y divide-line rounded-xl border border-line">
              {feature.cases.map((c, index) => (
                <li
                  key={`${index}-${c.title}`}
                  className="flex items-start gap-3 px-3 py-2 text-sm"
                >
                  <span
                    aria-hidden="true"
                    className={`mt-1 size-3 shrink-0 rounded-full ${STATUS_ICON[c.status]}`}
                  />
                  <span className="flex-1">{c.title}</span>
                  <span className="shrink-0 text-ink-muted">
                    {t(`progress.status.${c.status}`)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

/** Shown while an Admin looks at a page that is not (yet) public. */
export function PreviewNotice() {
  const { t } = useTranslation()
  return (
    <p
      role="status"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-warning/40 bg-warning-soft p-4 text-warning"
    >
      <Eye aria-hidden="true" className="size-5 shrink-0" />
      <span className="font-semibold">{t('public.previewTitle')}</span>
      <span>{t('public.previewBody')}</span>
    </p>
  )
}

export function BackToPublic() {
  const { t } = useTranslation()
  return (
    <Link
      to="/publik"
      className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-700"
    >
      <ArrowLeft aria-hidden="true" className="size-4" />
      {t('public.back')}
    </Link>
  )
}

/** One public UAT (ADR 0019): its features and progress, only the fields an Admin allowed. */
export function PublicUatPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { uatId = '' } = useParams()
  const [params] = useSearchParams()
  // "?pratinjau=1&data=a,b": an Admin looks at the page before (or without) publishing it.
  const preview = useMemo<PublicPreview | undefined>(() => {
    if (params.get('pratinjau') !== '1') return undefined
    const data = params.get('data')
    return data === null
      ? {}
      : { fields: data.split(',').filter(Boolean) as PublicPreview['fields'] }
  }, [params])
  const uat = usePublicUat(uatId, preview)

  if (uat.isPending) {
    return (
      <PublicSiteLayout>
        <LoadingState rows={6} />
      </PublicSiteLayout>
    )
  }
  if (uat.isError) {
    const missing = uat.error instanceof ApiClientError && uat.error.status === 404
    return (
      <PublicSiteLayout>
        {missing ? (
          <EmptyState description={t('public.notPublic')} />
        ) : (
          <ErrorState error={uat.error} onRetry={() => void uat.refetch()} />
        )}
        <div className="mt-6">
          <BackToPublic />
        </div>
      </PublicSiteLayout>
    )
  }
  const data = uat.data
  return (
    <PublicSiteLayout>
      {preview && <PreviewNotice />}
      <BackToPublic />
      <header className="mt-3 rounded-3xl border border-line bg-surface p-6 shadow-xs sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-brand-700">
            {[data.project.name, data.phase?.title].filter(Boolean).join(' · ')}
          </p>
          <RunStatusBadge status={data.status_code} />
        </div>
        <h1 className="mt-1 text-3xl leading-tight font-bold sm:text-4xl">{data.name}</h1>
        {data.period && (data.period.starts_on || data.period.ends_on) && (
          <p className="mt-1 text-ink-muted">
            {t('public.period', {
              from: data.period.starts_on ? formatDate(data.period.starts_on, locale) : '…',
              to: data.period.ends_on ? formatDate(data.period.ends_on, locale) : '…',
            })}
          </p>
        )}
        {data.intro && <p className="mt-3 max-w-3xl text-lg whitespace-pre-line">{data.intro}</p>}
        {data.description && (
          <p className="mt-2 max-w-3xl whitespace-pre-line text-ink-muted">{data.description}</p>
        )}
        {data.progress && (
          <div className="mt-5 max-w-2xl">
            <ProgressMeter counts={data.progress} size="lg" legend />
          </div>
        )}
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            to="/meja"
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800"
          >
            <QrCode aria-hidden="true" className="size-5" />
            {t('public.joinAsTable')}
          </Link>
          {data.bug_reporting_public && (
            <Link
              to={`/publik/masalah/${encodeURIComponent(data.project.code)}`}
              className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-line-strong bg-surface px-5 font-semibold text-ink hover:bg-neutral-soft"
            >
              <Bug aria-hidden="true" className="size-5" />
              {t('public.openBugs')}
            </Link>
          )}
        </div>
      </header>
      <section aria-labelledby="fitur" className="mt-8">
        <h2 id="fitur" className="text-2xl font-bold">
          {t('public.featuresTab')}
        </h2>
        <div className="mt-4">
          {data.features === undefined ? (
            <EmptyState description={t('public.nothingShared')} />
          ) : data.features.length === 0 ? (
            <EmptyState description={t('public.noFeatures')} />
          ) : (
            <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {data.features.map((feature) => (
                <FeatureCard key={feature.module_code} feature={feature} />
              ))}
            </ul>
          )}
        </div>
      </section>
    </PublicSiteLayout>
  )
}

/**
 * Links printed before UATs existed point at a Fase ("/publik/<fase>"): open its public UAT,
 * or the public front page when there is none.
 */
export function PublicCycleRedirect() {
  const { cycleId = '' } = useParams()
  const ds = useDataSource()
  const found = useQuery({
    queryKey: ['public', 'cycle-uat', cycleId],
    queryFn: () => ds.findPublicUatOfCycle(cycleId),
    retry: false,
  })
  if (found.isPending) {
    return (
      <PublicSiteLayout>
        <LoadingState rows={4} />
      </PublicSiteLayout>
    )
  }
  return <Navigate to={found.isSuccess ? `/publik/uat/${found.data.id}` : '/publik'} replace />
}
