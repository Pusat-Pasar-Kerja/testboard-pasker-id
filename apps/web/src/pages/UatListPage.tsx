import { RUN_STATUSES } from '@testboard/shared'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UatCard } from '../components/uat/UatCard'
import { ButtonLink } from '../components/ui/Button'
import { ChipFilter } from '../components/ui/ChipFilter'
import { PageHeader } from '../components/ui/PageHeader'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useCan } from '../hooks/permissions'
import { projectPath, useProjectCode } from '../hooks/route-state'
import { useUats } from '../hooks/structure-queries'

/**
 * The UATs of a project (ADR 0019). An Admin sees every UAT and makes new ones from a Fase;
 * a Pengguna sees "UAT saya": only the UATs they were added to.
 */
export function UatListPage() {
  const { t } = useTranslation()
  const code = useProjectCode()
  const can = useCan(code)
  const manager = can('run.write')
  const uats = useUats(code)
  const [status, setStatus] = useState('')
  const [phase, setPhase] = useState('')
  const all = uats.data ?? []
  const phases = [
    ...new Map(all.filter((u) => u.phase).map((u) => [u.phase!.id, u.phase!])).values(),
  ]
  const shown = all.filter(
    (u) => (!status || u.status_code === status) && (!phase || u.phase?.id === phase),
  )

  return (
    <>
      <PageHeader
        title={manager ? t('uat.title') : t('nav.myUat')}
        subtitle={manager ? t('uat.subtitle') : t('uat.mine.subtitle')}
        crumbs={[
          { label: code, to: projectPath(code) },
          { label: manager ? t('uat.title') : t('nav.myUat') },
        ]}
        actions={
          manager && (
            <ButtonLink to={projectPath(code, 'uat/baru')} icon={Plus}>
              {t('uat.new')}
            </ButtonLink>
          )
        }
      />
      {uats.isPending && <LoadingState rows={4} />}
      {uats.isError && <ErrorState error={uats.error} onRetry={() => void uats.refetch()} />}
      {uats.isSuccess && all.length === 0 && (
        <EmptyState
          title={manager ? t('uat.emptyTitle') : t('uat.mine.emptyTitle')}
          description={manager ? t('uat.empty') : t('uat.mine.empty')}
          action={
            manager ? (
              <ButtonLink to={projectPath(code, 'uat/baru')} icon={Plus}>
                {t('uat.new')}
              </ButtonLink>
            ) : undefined
          }
        />
      )}
      {uats.isSuccess && all.length > 0 && (
        <div className="space-y-4">
          <div className="space-y-3">
            <ChipFilter
              label={t('filters.status')}
              value={status}
              onChange={setStatus}
              options={RUN_STATUSES.filter((s) => all.some((u) => u.status_code === s)).map(
                (s) => ({
                  value: s,
                  label: t(`codes.runStatus.${s}`),
                  count: all.filter((u) => u.status_code === s).length,
                }),
              )}
            />
            {phases.length > 1 && (
              <ChipFilter
                label={t('filters.phase')}
                value={phase}
                onChange={setPhase}
                options={phases.map((p) => ({
                  value: p.id,
                  label: p.title,
                  count: all.filter((u) => u.phase?.id === p.id).length,
                }))}
              />
            )}
          </div>
          {shown.length === 0 ? (
            <EmptyState filtered description={t('uat.emptyFiltered')} />
          ) : (
            <ul
              aria-label={manager ? t('uat.title') : t('nav.myUat')}
              className="grid grid-cols-1 gap-4 lg:grid-cols-2"
            >
              {shown.map((uat) => (
                <UatCard key={uat.id} code={code} uat={uat} />
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}
