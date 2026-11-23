import { useTranslation } from 'react-i18next'

/** Data types that appear in a project's activity log. */
export const PROJECT_AUDIT_ENTITIES = [
  'test_case',
  'test_run',
  'test_execution',
  'test_cycle',
  'test_suite',
  'module',
  'defect',
  'defect_comment',
  'file',
  'import_job',
  'report',
  'project',
  'project_member',
  'workshop_table',
] as const

/** The website-wide log adds accounts and website settings. */
export const SITE_AUDIT_ENTITIES = [
  ...PROJECT_AUDIT_ENTITIES,
  'user',
  'system_setting',
  'recovery_request',
  'reset_link',
] as const

export const AUDIT_ACTIONS = [
  'CREATE',
  'UPDATE',
  'STATUS_CHANGE',
  'ARCHIVE',
  'DELETE',
  'IMPORT',
  'EXPORT',
  'DOWNLOAD',
  'LOGIN',
  'LOGOUT',
  'PASSWORD_CHANGE',
  'PASSWORD_RESET',
  'REVOKE',
  'CONFIRM',
  'REVIEW',
  'ACTIVATE',
] as const

type AuditEntity = (typeof SITE_AUDIT_ENTITIES)[number]
type AuditAction = (typeof AUDIT_ACTIONS)[number]
const isAuditEntity = (value: string): value is AuditEntity =>
  (SITE_AUDIT_ENTITIES as readonly string[]).includes(value)
const isAuditAction = (value: string): value is AuditAction =>
  (AUDIT_ACTIONS as readonly string[]).includes(value)

/** Translated labels; unknown codes are shown as they are (never hidden). */
export function useAuditLabels() {
  const { t } = useTranslation()
  return {
    entityLabel: (value: string): string =>
      isAuditEntity(value) ? t(`codes.auditEntity.${value}`) : value,
    actionLabel: (value: string): string =>
      isAuditAction(value) ? t(`codes.auditAction.${value}`) : value,
  }
}
