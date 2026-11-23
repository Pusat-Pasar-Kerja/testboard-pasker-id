import type {
  DefectPriority,
  ExecutionStatus,
  PublicBugDto,
  PublicFeatureDto,
} from '@testboard/shared'
import { ArrowLeft, ChevronDown, Eye, QrCode, Search, ThumbsUp, UsersRound } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams, useSearchParams } from 'react-router'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import {
  CycleStatusBadge,
  DefectPriorityBadge,
  DefectStatusBadge,
  SeverityBadge,
} from '../components/status/StatusBadges'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { Tabs } from '../components/ui/Tabs'
import { ProgressMeter } from '../components/workshop/ProgressMeter'
import { usePublicBugs, usePublicCycle } from '../hooks/workshop-queries'
import type { PublicPreview } from '../services/data-source'
import { PublicSiteLayout } from '../layout/PublicSiteLayout'
import { formatDate, toLocale } from '../lib/format'
import { ApiClientError } from '../services/api-client'
import { useDataSource } from '../services/use-data-source'

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

function BugCard({
  bug,
  cycleId,
  preview,
}: {
  bug: PublicBugDto
  cycleId: string
  preview?: PublicPreview
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  return (
    <li className="rounded-2xl border border-line bg-surface p-5 shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        {bug.bug_code && <span className="font-mono text-sm text-brand-700">{bug.bug_code}</span>}
        <DefectStatusBadge status={bug.status_code} />
        {bug.severity_code && <SeverityBadge severity={bug.severity_code} />}
        {bug.priority_code && (
          <DefectPriorityBadge priority={bug.priority_code as DefectPriority} />
        )}
      </div>
      <h3 className="mt-2 text-lg leading-snug font-semibold break-words">{bug.title}</h3>
      {bug.description && (
        <p className="mt-1 whitespace-pre-line break-words text-ink">{bug.description}</p>
      )}
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
        {bug.feature && (
          <div>
            <dt className="sr-only">{t('public.bugFeature')}</dt>
            <dd>{bug.feature}</dd>
          </div>
        )}
        {bug.reporter && (
          <div>
            <dt className="inline">{t('public.bugReporter')} </dt>
            <dd className="inline">{bug.reporter}</dd>
          </div>
        )}
        {bug.reported_at && (
          <div>
            <dt className="sr-only">{t('public.bugDate')}</dt>
            <dd>{formatDate(bug.reported_at, locale)}</dd>
          </div>
        )}
        {bug.confirmations !== undefined && bug.confirmations > 0 && (
          <div className="inline-flex items-center gap-1 font-semibold text-pastel-peach-ink">
            <ThumbsUp aria-hidden="true" className="size-4" />
            <dd>{t('public.bugConfirmations', { count: bug.confirmations })}</dd>
          </div>
        )}
      </dl>
      {bug.files && bug.files.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {bug.files.map((file) => (
            <li key={file.id}>
              <a
                href={ds.publicFileUrl(cycleId, file.id, 'preview', preview)}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border border-line"
              >
                <img
                  src={ds.publicFileUrl(cycleId, file.id, 'thumbnail', preview)}
                  alt={t('public.photoOf', { name: file.name })}
                  className="size-24 object-cover"
                  loading="lazy"
                />
              </a>
            </li>
          ))}
        </ul>
      )}
    </li>
  )
}

function BugsTab({
  cycleId,
  features,
  preview,
}: {
  cycleId: string
  features: { code: string; name: string }[]
  preview?: PublicPreview
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | 'OPEN' | 'DONE'>('')
  const [feature, setFeature] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const bugs = usePublicBugs(
    cycleId,
    { q, status, feature, page: 1, page_size: pageSize },
    true,
    preview,
  )
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block min-w-60 flex-1">
          <span className="mb-1 block text-sm font-medium">{t('public.searchBugs')}</span>
          <span className="relative block">
            <Search
              aria-hidden="true"
              className="absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-muted"
            />
            <input
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="min-h-12 w-full rounded-xl border border-line-strong bg-surface pr-3 pl-10 text-base"
            />
          </span>
        </label>
        <div role="group" aria-label={t('public.statusFilter')} className="flex gap-1">
          {(['', 'OPEN', 'DONE'] as const).map((value) => (
            <button
              key={value || 'all'}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
              className={`min-h-12 rounded-xl px-4 text-sm font-semibold ${
                status === value
                  ? 'bg-brand-700 text-white'
                  : 'border border-line-strong bg-surface hover:bg-neutral-soft'
              }`}
            >
              {t(`public.status.${value || 'ALL'}`)}
            </button>
          ))}
        </div>
        {features.length > 0 && (
          <label className="block">
            <span className="mb-1 block text-sm font-medium">{t('public.bugFeature')}</span>
            <select
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
              className="min-h-12 rounded-xl border border-line-strong bg-surface px-3 text-base"
            >
              <option value="">{t('public.allFeatures')}</option>
              {features.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {bugs.isPending && <LoadingState rows={3} />}
      {bugs.isError && <ErrorState error={bugs.error} onRetry={() => void bugs.refetch()} />}
      {bugs.isSuccess && (
        <>
          <p className="text-sm text-ink-muted" aria-live="polite">
            {t('public.bugCount', { count: bugs.data.total })}
          </p>
          {bugs.data.data.length === 0 ? (
            <EmptyState description={t('public.noBugs')} />
          ) : (
            <ul className="space-y-3">
              {bugs.data.data.map((bug) => (
                <BugCard key={bug.id} bug={bug} cycleId={cycleId} preview={preview} />
              ))}
            </ul>
          )}
          {bugs.data.total > bugs.data.data.length && (
            <div className="flex justify-center">
              <Button variant="secondary" onClick={() => setPageSize((n) => Math.min(100, n + 20))}>
                {t('public.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

/** One public Fase: the features being tested and the problems found (allowed fields only). */
export function PublicCyclePage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { cycleId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  // "?pratinjau=1&data=a,b": a lead looks at the page before (or without) publishing it.
  const preview = useMemo<PublicPreview | undefined>(() => {
    if (params.get('pratinjau') !== '1') return undefined
    const data = params.get('data')
    return data === null
      ? {}
      : { fields: data.split(',').filter(Boolean) as PublicPreview['fields'] }
  }, [params])
  const cycle = usePublicCycle(cycleId, preview)

  if (cycle.isPending) {
    return (
      <PublicSiteLayout>
        <LoadingState rows={6} />
      </PublicSiteLayout>
    )
  }
  if (cycle.isError) {
    const missing = cycle.error instanceof ApiClientError && cycle.error.status === 404
    return (
      <PublicSiteLayout>
        {missing ? (
          <EmptyState description={t('public.notPublic')} />
        ) : (
          <ErrorState error={cycle.error} onRetry={() => void cycle.refetch()} />
        )}
        <Link
          to="/publik"
          className="mt-6 inline-flex min-h-11 items-center gap-2 font-semibold text-brand-700"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t('public.back')}
        </Link>
      </PublicSiteLayout>
    )
  }
  const data = cycle.data
  const hasFeatures = data.features !== undefined
  const hasBugs = data.bug_count !== undefined
  const tabs = [
    ...(hasFeatures
      ? [
          {
            id: 'fitur',
            label: t('public.featuresTab'),
            count: data.features?.length,
            content:
              data.features && data.features.length > 0 ? (
                <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {data.features.map((feature) => (
                    <FeatureCard key={feature.module_code} feature={feature} />
                  ))}
                </ul>
              ) : (
                <EmptyState description={t('public.noFeatures')} />
              ),
          },
        ]
      : []),
    ...(hasBugs
      ? [
          {
            id: 'masalah',
            label: t('public.bugsTab'),
            count: data.bug_count,
            content: (
              <BugsTab
                cycleId={data.id}
                preview={preview}
                features={
                  data.fields.includes('bugs.feature')
                    ? (data.features ?? []).map((f) => ({ code: f.module_code, name: f.name }))
                    : []
                }
              />
            ),
          },
        ]
      : []),
  ]
  const active = params.get('tab') ?? tabs[0]?.id ?? ''

  return (
    <PublicSiteLayout>
      {preview && (
        <p
          role="status"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-warning/40 bg-warning-soft p-4 text-warning"
        >
          <Eye aria-hidden="true" className="size-5 shrink-0" />
          <span className="font-semibold">{t('public.previewTitle')}</span>
          <span>{t('public.previewBody')}</span>
        </p>
      )}
      <Link
        to="/publik"
        className="inline-flex min-h-11 items-center gap-2 font-semibold text-brand-700"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {t('public.back')}
      </Link>
      <header className="mt-3 rounded-3xl border border-line bg-surface p-6 shadow-xs sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-brand-700">{data.project.name}</p>
          <CycleStatusBadge status={data.status_code as 'PLANNED' | 'ACTIVE' | 'COMPLETED'} />
        </div>
        <h1 className="mt-1 text-3xl leading-tight font-bold sm:text-4xl">{data.title}</h1>
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
        <Link
          to="/meja"
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800"
        >
          <QrCode aria-hidden="true" className="size-5" />
          {t('public.joinAsTable')}
        </Link>
      </header>
      <div className="mt-8">
        {tabs.length === 0 ? (
          <EmptyState description={t('public.nothingShared')} />
        ) : (
          <Tabs
            label={t('public.tabsLabel')}
            tabs={tabs}
            active={active}
            onChange={(id) => {
              const next = new URLSearchParams(params)
              next.set('tab', id)
              setParams(next, { replace: true })
            }}
          />
        )}
      </div>
    </PublicSiteLayout>
  )
}
