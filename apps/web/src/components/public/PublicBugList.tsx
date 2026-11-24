import type { DefectPriority, PublicBugDto } from '@testboard/shared'
import { Search, ThumbsUp } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { usePublicBugs } from '../../hooks/workshop-queries'
import { formatDate, toLocale } from '../../lib/format'
import { useDataSource } from '../../services/use-data-source'
import { DefectPriorityBadge, DefectStatusBadge, SeverityBadge } from '../status/StatusBadges'
import { Button } from '../ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../ui/States'

function BugCard({
  bug,
  projectCode,
  preview,
}: {
  bug: PublicBugDto
  projectCode: string
  preview: boolean
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
                href={ds.publicFileUrl(projectCode, file.id, 'preview', preview)}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border border-line"
              >
                <img
                  src={ds.publicFileUrl(projectCode, file.id, 'thumbnail', preview)}
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

/**
 * The public problem list of a project (ADR 0019): search, "belum selesai / sudah selesai",
 * and only the fields an Admin switched on.
 */
export function PublicBugList({
  projectCode,
  features,
  preview = false,
}: {
  projectCode: string
  features: string[]
  preview?: boolean
}) {
  const { t } = useTranslation()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<'' | 'OPEN' | 'DONE'>('')
  const [feature, setFeature] = useState('')
  const [pageSize, setPageSize] = useState(20)
  const bugs = usePublicBugs(
    projectCode,
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
                <option key={f} value={f}>
                  {f}
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
                <BugCard key={bug.id} bug={bug} projectCode={projectCode} preview={preview} />
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
