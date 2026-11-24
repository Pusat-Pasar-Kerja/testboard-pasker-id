import type { WorkshopBoardDto } from '@testboard/shared'
import {
  CircleCheckBig,
  CircleSlash,
  CircleX,
  ListChecks,
  MessageSquareWarning,
  ThumbsUp,
  UsersRound,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatTile } from '../../charts/StatTile'
import { Section } from '../../ui/Section'
import { EmptyState } from '../../ui/States'
import { formatNumber, formatShortDateTime, toLocale } from '../../../lib/format'
import { groupLabel } from '../../../lib/uat'
import { ProgressMeter } from '../ProgressMeter'

/** Live overview of a workshop: totals, every table, every feature, latest activity. */
export function BoardTab({
  board,
  onOpenInbox,
}: {
  board: WorkshopBoardDto
  onOpenInbox: () => void
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const n = (value: number) => formatNumber(value, locale)
  const totals = board.totals

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile
          icon={ListChecks}
          tone="lavender"
          label={t('workshop.board.tried')}
          value={`${n(totals.tried)} / ${n(totals.total)}`}
        />
        <StatTile
          icon={CircleCheckBig}
          tone="mint"
          label={t('progress.passed')}
          value={n(totals.passed)}
        />
        <StatTile
          icon={CircleX}
          tone="peach"
          label={t('progress.failed')}
          value={n(totals.failed)}
        />
        <StatTile
          icon={CircleSlash}
          tone="butter"
          label={t('progress.blocked')}
          value={n(totals.blocked)}
        />
        <StatTile
          icon={MessageSquareWarning}
          tone="sky"
          label={t('workshop.board.toReview')}
          value={n(board.bugs.to_review)}
          hint={t('workshop.board.bugsTotal', { count: board.bugs.total })}
        />
        <StatTile
          icon={ThumbsUp}
          tone="peach"
          label={t('workshop.board.confirmations')}
          value={n(board.bugs.confirmations)}
        />
      </div>
      {board.bugs.to_review > 0 && (
        <button
          type="button"
          onClick={onOpenInbox}
          className="flex w-full items-center justify-between gap-3 rounded-xl bg-warning-soft p-4 text-left font-semibold text-warning"
        >
          {t('workshop.board.inboxCta', { count: board.bugs.to_review })}
          <span aria-hidden="true">→</span>
        </button>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section title={t('workshop.board.tables')}>
          {board.tables.length === 0 ? (
            <EmptyState description={t('workshop.board.noTables')} />
          ) : (
            <ul className="space-y-4">
              {board.tables.map((table) => (
                <li key={table.id} className="rounded-xl border border-line p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="flex items-center gap-2 text-lg font-semibold">
                      <UsersRound aria-hidden="true" className="size-5 text-brand-700" />
                      {groupLabel(t, table)}
                    </p>
                    <p className="text-sm text-ink-muted">
                      {table.last_activity_at
                        ? t('workshop.board.lastActivity', {
                            date: formatShortDateTime(table.last_activity_at, locale),
                          })
                        : t('workshop.board.noActivity')}
                    </p>
                  </div>
                  <p className="text-sm text-ink-muted">
                    {table.modules.map((m) => m.name).join(', ') || t('workshop.tables.noFeatures')}
                    {table.member_names.length > 0 && ` · ${table.member_names.join(', ')}`}
                  </p>
                  <div className="mt-2">
                    <ProgressMeter counts={table.progress} />
                  </div>
                  {table.bugs > 0 && (
                    <p className="mt-1 text-sm text-ink-muted">
                      {t('workshop.board.tableBugs', { count: table.bugs })}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
        <div className="space-y-6">
          <Section title={t('workshop.board.recent')}>
            {board.recent.length === 0 ? (
              <EmptyState description={t('workshop.board.noRecent')} />
            ) : (
              <ol className="space-y-3">
                {board.recent.map((item, index) => (
                  <li key={`${item.at}-${index}`} className="text-sm">
                    <p className="font-semibold">
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
                    <p className="text-xs text-ink-muted">{formatShortDateTime(item.at, locale)}</p>
                  </li>
                ))}
              </ol>
            )}
          </Section>
          <Section title={t('workshop.board.features')}>
            {board.features.length === 0 ? (
              <EmptyState description={t('workshop.board.noFeatures')} />
            ) : (
              <ul className="space-y-3">
                {board.features.map((feature) => (
                  <li key={feature.module.id}>
                    <p className="text-sm font-semibold">
                      {feature.module.name}
                      {feature.state !== 'OPEN' && (
                        <span className="ml-2 text-xs font-normal text-ink-muted">
                          {t(`workshop.features.state.${feature.state}`)}
                        </span>
                      )}
                    </p>
                    <ProgressMeter counts={feature.progress} size="sm" />
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
