import { MessageSquarePlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useParams, useSearchParams } from 'react-router'
import { PublicBugList } from '../components/public/PublicBugList'
import { PublicReportForm } from '../components/public/PublicReportForm'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { usePublicBugReporting } from '../hooks/workshop-queries'
import { PublicSiteLayout } from '../layout/PublicSiteLayout'
import { formatNumber, toLocale } from '../lib/format'
import { ApiClientError } from '../services/api-client'
import { BackToPublic, PreviewNotice } from './PublicUatPage'

/**
 * A project's public Bug Reporting (ADR 0019): the problems found during UAT and after
 * go-live (only the fields an Admin switched on), and, when open, the report form.
 */
export function PublicBugsPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { projectCode = '' } = useParams()
  const [params] = useSearchParams()
  const preview = params.get('pratinjau') === '1'
  const page = usePublicBugReporting(projectCode, preview)

  if (page.isPending) {
    return (
      <PublicSiteLayout>
        <LoadingState rows={6} />
      </PublicSiteLayout>
    )
  }
  if (page.isError) {
    const missing = page.error instanceof ApiClientError && page.error.status === 404
    return (
      <PublicSiteLayout>
        {missing ? (
          <EmptyState description={t('public.bugsNotPublic')} />
        ) : (
          <ErrorState error={page.error} onRetry={() => void page.refetch()} />
        )}
        <div className="mt-6">
          <BackToPublic />
        </div>
      </PublicSiteLayout>
    )
  }
  const data = page.data
  const listed = data.fields.includes('bugs.list')
  return (
    <PublicSiteLayout>
      {preview && <PreviewNotice />}
      <BackToPublic />
      <header className="mt-3 rounded-3xl border border-line bg-surface p-6 shadow-xs sm:p-8">
        <p className="font-semibold text-brand-700">{t('public.bugReporting')}</p>
        <h1 className="mt-1 text-3xl leading-tight font-bold sm:text-4xl">{data.project.name}</h1>
        {data.intro && <p className="mt-3 max-w-3xl text-lg whitespace-pre-line">{data.intro}</p>}
        {listed && (
          <p className="mt-3 text-ink-muted">
            {t('public.bugCounts', {
              count: data.bug_count,
              total: formatNumber(data.bug_count, locale),
              open: formatNumber(data.bug_open, locale),
            })}
          </p>
        )}
        {data.accept_reports && (
          <a
            href="#lapor"
            className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800"
          >
            <MessageSquarePlus aria-hidden="true" className="size-5" />
            {t('public.report.open')}
          </a>
        )}
      </header>
      {listed && (
        <section aria-labelledby="daftar" className="mt-8">
          <h2 id="daftar" className="text-2xl font-bold">
            {t('public.bugsTab')}
          </h2>
          <div className="mt-4">
            <PublicBugList
              projectCode={data.project.code}
              features={data.features ?? []}
              preview={preview}
            />
          </div>
        </section>
      )}
      {data.accept_reports && (
        <section
          id="lapor"
          aria-labelledby="lapor-judul"
          className="mt-10 scroll-mt-24 rounded-3xl border border-line bg-surface p-6 shadow-xs sm:p-8"
        >
          <h2 id="lapor-judul" className="text-2xl font-bold">
            {t('public.report.title2')}
          </h2>
          <p className="mt-1 mb-5 max-w-3xl text-ink-muted">{t('public.report.intro')}</p>
          <PublicReportForm projectCode={data.project.code} />
        </section>
      )}
      {!listed && !data.accept_reports && (
        <div className="mt-8">
          <EmptyState description={t('public.nothingShared')} />
        </div>
      )}
    </PublicSiteLayout>
  )
}
