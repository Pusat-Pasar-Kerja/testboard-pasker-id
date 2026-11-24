import { ArrowRight, Bug, ClipboardList, FileCheck2, Search } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { Button } from '../components/ui/Button'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import {
  CaseStatusBadge,
  DefectStatusBadge,
  RunStatusBadge,
} from '../components/status/StatusBadges'
import { useDefects, useRuns, useTestCases } from '../hooks/queries'
import { projectPath, useProjectCode } from '../hooks/route-state'

const SHOWN = 8
/** Shorter words find too much to be useful. */
const MIN_LENGTH = 2

function ResultGroup({
  title,
  icon: Icon,
  total,
  allLink,
  allLabel,
  pending,
  error,
  onRetry,
  children,
}: {
  title: string
  icon: typeof Bug
  total: number
  allLink: string | null
  allLabel: string
  pending: boolean
  error: unknown
  onRetry: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          <Icon aria-hidden="true" className="size-5 text-brand-700" />
          {title}
          {!pending && !error && (
            <span className="rounded-full bg-brand-50 px-2 text-sm font-semibold text-brand-800">
              {total}
            </span>
          )}
        </span>
      }
      action={
        allLink && total > SHOWN ? (
          <Link
            to={allLink}
            className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-brand-700 hover:underline"
          >
            {allLabel}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        ) : undefined
      }
    >
      {pending ? (
        <LoadingState rows={2} />
      ) : error ? (
        <ErrorState error={error} onRetry={onRetry} />
      ) : total === 0 ? (
        <p className="text-sm text-ink-muted">{t('search.none')}</p>
      ) : (
        <ul className="divide-y divide-line">{children}</ul>
      )}
    </Section>
  )
}

function ResultRow({
  to,
  code,
  title,
  badge,
}: {
  to: string
  code: string
  title: string
  badge: ReactNode
}) {
  return (
    <li>
      {/* Stacked on a phone (code, title, status); one line from sm up. */}
      <Link
        to={to}
        className="block min-h-12 rounded-lg px-2 py-2 hover:bg-brand-50/60 sm:flex sm:items-center sm:gap-3"
      >
        <span className="font-mono text-xs font-semibold text-brand-700 sm:w-36 sm:shrink-0">
          {code}
        </span>
        <span className="block font-medium break-words text-ink sm:min-w-0 sm:flex-1">{title}</span>
        <span className="mt-1 inline-flex sm:mt-0">{badge}</span>
      </Link>
    </li>
  )
}

/**
 * One search for the whole project (audit 2026-11-24: the top search only looked at
 * scenarios): scenarios, problems and test sheets side by side, each with a link to the
 * full filtered list.
 */
function SearchForm({ code, initial }: { code: string; initial: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [draft, setDraft] = useState(initial)
  return (
    <form
      role="search"
      className="mb-6 flex max-w-2xl flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        const next = draft.trim()
        navigate(`${projectPath(code, 'search')}${next ? `?q=${encodeURIComponent(next)}` : ''}`)
      }}
    >
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{t('search.label')}</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-ink-muted"
        />
        <input
          type="search"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t('search.placeholder')}
          className="min-h-12 w-full rounded-lg border border-line-strong bg-surface pr-3 pl-10 text-base"
        />
      </label>
      <Button type="submit" icon={Search}>
        {t('search.submit')}
      </Button>
    </form>
  )
}

export function SearchPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const [params] = useSearchParams()
  const q = (params.get('q') ?? '').trim()
  const ready = q.length >= MIN_LENGTH
  const cases = useTestCases(code, { q, page_size: SHOWN }, ready)
  const bugs = useDefects(code, { q, page_size: SHOWN }, ready)
  const runs = useRuns(code)
  const needle = q.toLocaleLowerCase('id')
  const runHits = (runs.data ?? []).filter(
    (run) =>
      run.run_code.toLocaleLowerCase('id').includes(needle) ||
      run.name.toLocaleLowerCase('id').includes(needle),
  )
  const encoded = encodeURIComponent(q)
  const nothing =
    ready &&
    cases.isSuccess &&
    bugs.isSuccess &&
    runs.isSuccess &&
    cases.data.total + bugs.data.total + runHits.length === 0

  return (
    <>
      <PageHeader
        title={t('search.title')}
        subtitle={t('search.subtitle')}
        crumbs={[{ label: code, to: projectPath(code) }, { label: t('search.title') }]}
      />
      {/* Keyed by the query so a new search from the top bar refills the box. */}
      <SearchForm key={q} code={code} initial={q} />

      {!ready && (
        <EmptyState
          title={t('search.hintTitle')}
          description={q ? t('search.tooShort', { count: MIN_LENGTH }) : t('search.hint')}
        />
      )}
      {nothing && <EmptyState filtered description={t('search.nothing', { q })} />}
      {ready && !nothing && (
        <div className="grid gap-4">
          <ResultGroup
            title={t('search.groups.cases')}
            icon={ClipboardList}
            total={cases.data?.total ?? 0}
            allLink={`${projectPath(code, 'test-cases')}?q=${encoded}`}
            allLabel={t('search.allCases', { count: cases.data?.total ?? 0 })}
            pending={cases.isPending}
            error={cases.error}
            onRetry={() => void cases.refetch()}
          >
            {cases.data?.data.map((item) => (
              <ResultRow
                key={item.id}
                to={projectPath(code, `test-cases/${item.id}`)}
                code={item.case_code}
                title={item.title}
                badge={<CaseStatusBadge status={item.case_status} />}
              />
            ))}
          </ResultGroup>
          <ResultGroup
            title={t('search.groups.bugs')}
            icon={Bug}
            total={bugs.data?.total ?? 0}
            allLink={`${projectPath(code, 'bugs')}?q=${encoded}`}
            allLabel={t('search.allBugs', { count: bugs.data?.total ?? 0 })}
            pending={bugs.isPending}
            error={bugs.error}
            onRetry={() => void bugs.refetch()}
          >
            {bugs.data?.data.map((item) => (
              <ResultRow
                key={item.id}
                to={projectPath(code, `bugs/${item.id}`)}
                code={item.bug_code}
                title={item.title}
                badge={<DefectStatusBadge status={item.status_code} />}
              />
            ))}
          </ResultGroup>
          <ResultGroup
            title={t('search.groups.runs')}
            icon={FileCheck2}
            total={runHits.length}
            allLink={projectPath(code, 'uat')}
            allLabel={t('search.allRuns')}
            pending={runs.isPending}
            error={runs.error}
            onRetry={() => void runs.refetch()}
          >
            {runHits.slice(0, SHOWN).map((run) => (
              <ResultRow
                key={run.id}
                to={projectPath(code, `runs/${run.id}`)}
                code={run.run_code}
                title={run.name}
                badge={<RunStatusBadge status={run.status_code} />}
              />
            ))}
          </ResultGroup>
        </div>
      )}
    </>
  )
}
