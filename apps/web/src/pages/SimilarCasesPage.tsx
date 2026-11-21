import type { SimilarCasePair, SimilarCaseSide } from '@testboard/shared'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight, EyeOff, Merge } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { MergeDialog } from '../components/bulk/MergeDialog'
import { CaseStatusBadge } from '../components/status/StatusBadges'
import { Badge } from '../components/ui/Badge'
import { Button } from '../components/ui/Button'
import { FilterBar, SelectFilter } from '../components/ui/Filters'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useToast } from '../components/ui/toast-context'
import { useCan } from '../hooks/permissions'
import { useModules } from '../hooks/queries'
import { projectPath, useProjectCode, useUrlFilters } from '../hooks/route-state'
import { useDataSource } from '../services/use-data-source'
import { NotFoundPage } from './NotFoundPage'

const FILTER_KEYS = ['module'] as const
const pairKey = (p: SimilarCasePair) => [p.a.id, p.b.id].sort().join(':')

/** "Not a duplicate" choices are remembered in this browser tab only. */
function useDismissed(code: string) {
  const storageKey = `tb-similar-dismissed:${code}`
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(storageKey) ?? '[]') as string[])
    } catch {
      return new Set()
    }
  })
  const dismiss = (key: string) => {
    const next = new Set(dismissed).add(key)
    setDismissed(next)
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...next]))
    } catch {
      // storage unavailable: keep it for this page view only
    }
  }
  return { dismissed, dismiss }
}

function Side({ code, side }: { code: string; side: SimilarCaseSide }) {
  return (
    <div className="min-w-0 space-y-1.5 rounded-lg bg-canvas p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={projectPath(code, `test-cases/${side.id}`)}
          className="font-mono text-xs font-semibold text-brand-700 hover:underline"
        >
          {side.case_code}
        </Link>
        {side.module_code && <span className="text-xs text-ink-muted">{side.module_code}</span>}
        <CaseStatusBadge status={side.case_status} />
      </div>
      <p className="text-sm font-semibold break-words">{side.title}</p>
      {side.expected_result && (
        <p className="line-clamp-3 text-xs break-words text-ink-muted">{side.expected_result}</p>
      )}
    </div>
  )
}

/** Likely duplicates side by side, with a one-click merge (ADR 0013). */
export function SimilarCasesPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const ds = useDataSource()
  const toast = useToast()
  const can = useCan(code)
  const modules = useModules(code)
  const { values, setFilter, reset, active } = useUrlFilters(FILTER_KEYS)
  const { dismissed, dismiss } = useDismissed(code)
  const [merging, setMerging] = useState<{ pair: SimilarCasePair; keep: 'a' | 'b' } | null>(null)
  const pairs = useQuery({
    queryKey: ['similar-cases', code, values.module],
    queryFn: () => ds.listSimilarCases(code, values.module || undefined),
  })

  if (!can('case.write')) return <NotFoundPage reason="item" />
  const visible = (pairs.data ?? []).filter((p) => !dismissed.has(pairKey(p)))

  return (
    <>
      <PageHeader
        title={t('similar.title')}
        subtitle={t('similar.subtitle')}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: t('pages.cases.title'), to: projectPath(code, 'test-cases') },
          { label: t('similar.title') },
        ]}
      />
      <FilterBar onReset={active ? reset : undefined}>
        <SelectFilter
          label={t('filters.module')}
          value={values.module}
          onChange={(value) => setFilter('module', value)}
          options={(modules.data ?? []).map((m) => ({
            value: m.module_code,
            label: `${m.module_code} - ${m.name}`,
          }))}
        />
      </FilterBar>
      <Section>
        {pairs.isPending && <LoadingState rows={4} />}
        {pairs.isError && <ErrorState error={pairs.error} onRetry={() => void pairs.refetch()} />}
        {pairs.isSuccess && visible.length === 0 && <EmptyState description={t('similar.empty')} />}
        {pairs.isSuccess && visible.length > 0 && (
          <ul className="space-y-4">
            {visible.map((pair) => (
              <li key={pairKey(pair)} className="space-y-3 rounded-xl border border-line p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    tone={pair.score >= 0.7 ? 'warning' : 'info'}
                    label={t('similar.score', { percent: Math.round(pair.score * 100) })}
                  />
                  {pair.reasons.map((reason) => (
                    <Badge key={reason} tone="muted" label={t(`similar.reasons.${reason}`)} />
                  ))}
                  {pair.shared_refs.length > 0 && (
                    <span className="text-xs text-ink-muted">
                      {t('similar.sharedRefs', { refs: pair.shared_refs.join(', ') })}
                    </span>
                  )}
                </div>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
                  <Side code={code} side={pair.a} />
                  <ArrowLeftRight
                    aria-hidden="true"
                    className="mx-auto hidden size-4 text-ink-muted md:block"
                  />
                  <Side code={code} side={pair.b} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {can('case.archive') && (
                    <>
                      <Button
                        variant="secondary"
                        icon={Merge}
                        onClick={() => setMerging({ pair, keep: 'a' })}
                      >
                        {t('similar.keep', { code: pair.a.case_code })}
                      </Button>
                      <Button
                        variant="secondary"
                        icon={Merge}
                        onClick={() => setMerging({ pair, keep: 'b' })}
                      >
                        {t('similar.keep', { code: pair.b.case_code })}
                      </Button>
                    </>
                  )}
                  <Button variant="ghost" icon={EyeOff} onClick={() => dismiss(pairKey(pair))}>
                    {t('similar.notDuplicate')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {merging && (
        <MergeDialog
          open
          code={code}
          cases={[merging.pair.a, merging.pair.b]}
          defaultTargetId={merging.keep === 'a' ? merging.pair.a.id : merging.pair.b.id}
          onClose={() => setMerging(null)}
          onMerged={(result) => {
            setMerging(null)
            toast.show(
              t('merge.done', {
                codes: result.merged.map((m) => m.case_code).join(', '),
                code: result.target.case_code,
              }),
            )
          }}
        />
      )}
    </>
  )
}
