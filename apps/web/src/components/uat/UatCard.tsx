import type { UatSummaryDto } from '@testboard/shared'
import { Globe, Layers, TestTubeDiagonal, Users, UsersRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { projectPath } from '../../hooks/route-state'
import { formatDate, toLocale } from '../../lib/format'
import { groupLabel } from '../../lib/uat'
import { RunStatusBadge } from '../status/StatusBadges'
import { Badge } from '../ui/Badge'
import { ProgressMeter } from '../workshop/ProgressMeter'

/**
 * One UAT as a card (UAT list, Fase page): name, Fase, status, progress, and what is in it.
 * The whole card opens the UAT.
 */
export function UatCard({
  code,
  uat,
  showPhase = true,
}: {
  code: string
  uat: UatSummaryDto
  showPhase?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const period =
    uat.starts_at || uat.ends_at
      ? `${uat.starts_at ? formatDate(uat.starts_at, locale) : '…'} – ${
          uat.ends_at ? formatDate(uat.ends_at, locale) : '…'
        }`
      : null
  return (
    <li className="relative flex flex-col gap-3 rounded-xl border border-line bg-surface p-5 shadow-xs transition-shadow focus-within:ring-2 focus-within:ring-brand-500 hover:shadow-md">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700"
          >
            <TestTubeDiagonal className="size-5" />
          </span>
          <div className="min-w-0">
            {showPhase && uat.phase && (
              <p className="truncate text-xs font-semibold text-teal-700">{uat.phase.title}</p>
            )}
            <h3 className="text-lg leading-snug font-semibold break-words">
              <Link
                to={projectPath(code, `uat/${uat.id}`)}
                className="after:absolute after:inset-0 after:rounded-xl focus:outline-none"
              >
                {uat.name}
              </Link>
            </h3>
            {period && <p className="text-xs text-ink-muted tabular-nums">{period}</p>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {uat.is_public && <Badge tone="success" icon={Globe} label={t('uat.publicOn')} />}
          <RunStatusBadge status={uat.status_code} />
        </div>
      </div>
      <ProgressMeter counts={uat.progress} size="sm" />
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-ink-muted">
        <li className="inline-flex items-center gap-1.5">
          <Layers aria-hidden="true" className="size-4" />
          {t('uat.featureCount', { count: uat.features })}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <Users aria-hidden="true" className="size-4" />
          {t('uat.participantCount', { count: uat.participants })}
        </li>
        <li className="inline-flex items-center gap-1.5">
          <UsersRound aria-hidden="true" className="size-4" />
          {t('uat.groupCount', { count: uat.groups })}
        </li>
      </ul>
      {uat.my_group !== undefined && (
        <p className="rounded-lg bg-teal-50 px-3 py-2 text-sm font-medium text-teal-700">
          {uat.my_group
            ? t('uat.yourGroup', { group: groupLabel(t, uat.my_group) })
            : t('uat.noGroupYet')}
        </p>
      )}
    </li>
  )
}
