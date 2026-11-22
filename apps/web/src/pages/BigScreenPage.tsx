import type { ResultCounts } from '@testboard/shared'
import { Maximize, MessageSquareWarning, ThumbsUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router'
import { TestBoardMark } from '../components/brand/TestBoardMark'
import { ErrorState, LoadingState } from '../components/ui/States'
import { useWorkshopBoard } from '../hooks/workshop-queries'
import { formatNumber, toLocale } from '../lib/format'
import { triedPercent } from '../lib/workshop'

function Ring({ counts }: { counts: ResultCounts }) {
  const percent = triedPercent(counts)
  const r = 54
  const c = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 128 128" className="size-56" role="img" aria-label={`${percent}%`}>
      <circle cx="64" cy="64" r={r} fill="none" stroke="#24305e" strokeWidth="14" />
      <circle
        cx="64"
        cy="64"
        r={r}
        fill="none"
        stroke="#7c8cf8"
        strokeWidth="14"
        strokeLinecap="round"
        strokeDasharray={`${(percent / 100) * c} ${c}`}
        transform="rotate(-90 64 64)"
        style={{ transition: 'stroke-dasharray 800ms ease' }}
      />
      <text x="64" y="70" textAnchor="middle" fill="#ffffff" fontSize="26" fontWeight="700">
        {percent}%
      </text>
    </svg>
  )
}

function Bar({ counts }: { counts: ResultCounts }) {
  const share = (v: number) => (counts.total === 0 ? 0 : (v / counts.total) * 100)
  return (
    <div className="flex h-5 w-full gap-0.5 overflow-hidden rounded-full bg-[#24305e]">
      <span className="h-full bg-[#4ade80]" style={{ width: `${share(counts.passed)}%` }} />
      <span className="h-full bg-[#fbbf24]" style={{ width: `${share(counts.blocked)}%` }} />
      <span className="h-full bg-[#f87171]" style={{ width: `${share(counts.failed)}%` }} />
    </div>
  )
}

/**
 * "Layar besar" for the projector: every table's progress, refreshed every 10 seconds,
 * high contrast so it stays readable on a washed-out screen.
 */
export function BigScreenPage() {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const { projectCode = '', cycleId = '' } = useParams()
  const board = useWorkshopBoard(projectCode, cycleId, 10_000)
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  if (board.isPending)
    return (
      <div className="p-8">
        <LoadingState rows={6} />
      </div>
    )
  if (board.isError)
    return (
      <div className="p-8">
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      </div>
    )
  const data = board.data
  const n = (value: number) => formatNumber(value, locale)
  const tables = [...data.tables].sort(
    (a, b) => triedPercent(b.progress) - triedPercent(a.progress),
  )

  return (
    <div className="min-h-dvh bg-[#0f1630] p-6 text-white lg:p-10">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <TestBoardMark className="size-14 text-[#a5b4fc]" />
          <div>
            <p className="text-lg text-[#c7d2fe]">{t('workshop.screen.eyebrow')}</p>
            <h1 className="text-4xl font-bold">{data.cycle.title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-4xl font-semibold tabular-nums">
            {now.toLocaleTimeString(locale === 'id' ? 'id-ID' : 'en-GB', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </p>
          <button
            type="button"
            onClick={() => void document.documentElement.requestFullscreen?.()}
            className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white/10 px-4 font-semibold hover:bg-white/20"
          >
            <Maximize aria-hidden="true" className="size-5" />
            {t('workshop.screen.fullscreen')}
          </button>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-8 xl:grid-cols-[22rem_minmax(0,1fr)_24rem]">
        <section className="flex flex-col items-center gap-4 rounded-3xl bg-white/5 p-6">
          <Ring counts={data.totals} />
          <p className="text-center text-2xl">
            <strong className="tabular-nums">{n(data.totals.tried)}</strong> /{' '}
            {n(data.totals.total)}
            <span className="block text-lg text-[#c7d2fe]">{t('workshop.screen.tried')}</span>
          </p>
          <dl className="grid w-full grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[#4ade80]/15 p-3">
              <dt className="text-sm text-[#bbf7d0]">{t('progress.passed')}</dt>
              <dd className="text-3xl font-bold">{n(data.totals.passed)}</dd>
            </div>
            <div className="rounded-xl bg-[#f87171]/15 p-3">
              <dt className="text-sm text-[#fecaca]">{t('progress.failed')}</dt>
              <dd className="text-3xl font-bold">{n(data.totals.failed)}</dd>
            </div>
            <div className="rounded-xl bg-[#fbbf24]/15 p-3">
              <dt className="text-sm text-[#fde68a]">{t('progress.blocked')}</dt>
              <dd className="text-3xl font-bold">{n(data.totals.blocked)}</dd>
            </div>
          </dl>
          <p className="flex items-center gap-2 text-xl">
            <MessageSquareWarning aria-hidden="true" className="size-6 text-[#fca5a5]" />
            {t('workshop.screen.bugs', { count: data.bugs.total })}
          </p>
          <p className="flex items-center gap-2 text-xl">
            <ThumbsUp aria-hidden="true" className="size-6 text-[#fdba74]" />
            {t('workshop.screen.confirmations', { count: data.bugs.confirmations })}
          </p>
        </section>

        <section aria-label={t('workshop.board.tables')} className="space-y-4">
          {tables.map((table) => (
            <div key={table.id} className="rounded-2xl bg-white/5 p-5">
              <div className="flex items-baseline justify-between gap-4">
                <p className="text-2xl font-semibold">{table.name}</p>
                <p className="text-3xl font-bold tabular-nums">{triedPercent(table.progress)}%</p>
              </div>
              <p className="mb-3 text-[#c7d2fe]">
                {table.modules.map((m) => m.name).join(', ')}
                {' · '}
                {t('workshop.screen.tableTried', {
                  tried: n(table.progress.tried),
                  total: n(table.progress.total),
                })}
              </p>
              <Bar counts={table.progress} />
            </div>
          ))}
        </section>

        <section className="rounded-3xl bg-white/5 p-6">
          <h2 className="text-2xl font-semibold">{t('workshop.board.recent')}</h2>
          <ol className="mt-4 space-y-4">
            {data.recent.slice(0, 8).map((item, index) => (
              <li key={`${item.at}-${index}`} className="text-lg leading-snug">
                <p className="font-semibold text-[#a5b4fc]">
                  {[item.table_name, item.tester_name].filter(Boolean).join(' · ')}
                </p>
                <p>
                  {item.kind === 'RESULT'
                    ? t('workshop.board.recentResult', {
                        result: t(`progress.status.${item.status ?? 'NOT_RUN'}`),
                        title: item.title,
                      })
                    : item.kind === 'BUG'
                      ? t('workshop.board.recentBug', { title: item.title })
                      : t('workshop.board.recentConfirm', { title: item.title })}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="mt-8 text-center text-[#c7d2fe]">{t('workshop.screen.refresh')}</p>
    </div>
  )
}
