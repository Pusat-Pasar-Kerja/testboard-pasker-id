import { useTranslation } from 'react-i18next'
import { AuditEntryList } from '../components/audit/AuditLog'
import {
  AUDIT_ACTIONS,
  SITE_AUDIT_ENTITIES,
  useAuditLabels,
} from '../components/audit/audit-labels'
import { DateFilter, FilterBar, SelectFilter } from '../components/ui/Filters'
import { FormAlert } from '../components/ui/Form'
import { PageHeader } from '../components/ui/PageHeader'
import { Pagination } from '../components/ui/Pagination'
import { Section } from '../components/ui/Section'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { useAdminProjects, useAdminUsers, useCurrentUser, useSiteAuditLogs } from '../hooks/queries'
import { useUrlFilters } from '../hooks/route-state'
import { NotFoundPage } from './NotFoundPage'

/** Website-wide activity log for Super Admins: every project plus website-level changes. */
export function AdminAuditPage() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const isSuperAdmin = Boolean(me.data?.is_super_admin)
  const filters = useUrlFilters(['project', 'entity', 'action', 'actor', 'from', 'to'] as const)
  const { project, entity, action, actor, from, to } = filters.values
  const projects = useAdminProjects(isSuperAdmin)
  const users = useAdminUsers('', isSuperAdmin)
  const { entityLabel, actionLabel } = useAuditLabels()
  const rangeInvalid = Boolean(from && to && from > to)
  const logs = useSiteAuditLogs(
    {
      project: project || undefined,
      entity_type: entity || undefined,
      action: action || undefined,
      actor_id: actor || undefined,
      from: from || undefined,
      to: rangeInvalid ? undefined : to || undefined,
      page: filters.page,
    },
    isSuperAdmin,
  )

  if (!isSuperAdmin) return <NotFoundPage reason="item" />
  return (
    <>
      <PageHeader title={t('pages.adminAudit.title')} subtitle={t('pages.adminAudit.subtitle')} />
      <Section>
        <FilterBar onReset={filters.active ? filters.reset : undefined}>
          <SelectFilter
            label={t('pages.adminAudit.project')}
            value={project}
            allLabel={t('pages.adminAudit.allProjects')}
            onChange={(value) => filters.setFilter('project', value)}
            options={[
              { value: 'site', label: t('pages.adminAudit.siteLevel') },
              ...(projects.data ?? []).map((p) => ({
                value: p.id,
                label: `${p.project_code} - ${p.name}`,
              })),
            ]}
          />
          <SelectFilter
            label={t('pages.reports.activity.entity')}
            value={entity}
            onChange={(value) => filters.setFilter('entity', value)}
            options={SITE_AUDIT_ENTITIES.map((value) => ({ value, label: entityLabel(value) }))}
          />
          <SelectFilter
            label={t('pages.reports.activity.action')}
            value={action}
            onChange={(value) => filters.setFilter('action', value)}
            options={AUDIT_ACTIONS.map((value) => ({ value, label: actionLabel(value) }))}
          />
          <SelectFilter
            label={t('pages.reports.activity.actor')}
            value={actor}
            onChange={(value) => filters.setFilter('actor', value)}
            options={(users.data ?? []).map((u) => ({ value: u.id, label: u.display_name }))}
          />
          <DateFilter
            label={t('pages.reports.filters.from')}
            value={from}
            max={to}
            onChange={(value) => filters.setFilter('from', value)}
          />
          <DateFilter
            label={t('pages.reports.filters.to')}
            value={to}
            min={from}
            onChange={(value) => filters.setFilter('to', value)}
          />
        </FilterBar>
        {rangeInvalid && <FormAlert message={t('pages.reports.filters.rangeInvalid')} />}
        {logs.isPending && <LoadingState rows={5} />}
        {logs.isError && <ErrorState error={logs.error} onRetry={() => void logs.refetch()} />}
        {logs.isSuccess && logs.data.total === 0 && (
          <EmptyState description={t('pages.adminAudit.empty')} />
        )}
        {logs.isSuccess && logs.data.total > 0 && (
          <>
            <AuditEntryList entries={logs.data.data} busy={logs.isFetching} showProject />
            <Pagination
              page={logs.data.page}
              pageSize={logs.data.page_size}
              total={logs.data.total}
              onPageChange={filters.setPage}
            />
          </>
        )}
      </Section>
    </>
  )
}
