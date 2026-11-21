import type { TFunction } from 'i18next'
import { ApiClientError } from '../services/api-client'

/**
 * User-facing text for a failed request. Conflicts and validation errors carry a specific
 * server message (e.g. "run is locked"); everything else maps to the translated error code.
 */
export function apiErrorText(t: TFunction, error: unknown): string {
  if (error instanceof ApiClientError) {
    const reason = error.details[0]?.message
    if (reason === 'PROJECT_ARCHIVED') return t('errors.projectArchived')
    if (reason === 'PERMANENT_SUPER_ADMIN') return t('errors.permanentSuperAdmin')
    if (error.status === 409 || error.status === 422) {
      return error.details[0]?.message ?? error.message
    }
    return t(`errors.${error.code}`)
  }
  return t('errors.INTERNAL_ERROR')
}

/** Field -> message map for a 422/409 response, for inline form errors. */
export function apiFieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiClientError ? error.fieldErrors() : {}
}
