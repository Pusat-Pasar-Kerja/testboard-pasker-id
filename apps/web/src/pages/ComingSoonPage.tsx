import { Construction } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { PageHeader } from '../components/ui/PageHeader'
import { projectPath, useProjectCode } from '../hooks/route-state'

type Feature = 'cycles' | 'evidence' | 'imports' | 'reports' | 'team'

/** Milestone that delivers each feature (docs/blueprint/docs/14_ROADMAP_BACKLOG.md). */
const MILESTONE: Record<Feature, number> = {
  cycles: 3,
  evidence: 5,
  imports: 6,
  reports: 7,
  team: 2,
}

export function ComingSoonPage({ feature }: { feature: Feature }) {
  const { t } = useTranslation()
  const code = useProjectCode()
  const name = t(`nav.${feature}`)
  return (
    <>
      <PageHeader title={name} crumbs={[{ label: code, to: projectPath(code) }, { label: name }]} />
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line-strong bg-surface px-4 py-14 text-center">
        <Construction aria-hidden="true" className="size-10 text-ink-muted" />
        <p className="font-semibold">{t('pages.comingSoon.title')}</p>
        <p className="max-w-md text-sm text-ink-muted">
          {t('pages.comingSoon.body', { feature: name, milestone: MILESTONE[feature] })}
        </p>
        <Link
          to={projectPath(code)}
          className="inline-flex min-h-11 items-center rounded-lg px-4 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          {t('pages.comingSoon.back')}
        </Link>
      </div>
    </>
  )
}
