import { roleCan, type Permission } from '@testboard/shared'
import { useCurrentUser, useProject } from './queries'

/**
 * UI-only permission check (hides controls). The API enforces the same matrix on every
 * request, so a hidden button is never the security boundary (doc 09).
 */
export function useCan(projectCode: string) {
  const project = useProject(projectCode)
  const me = useCurrentUser()
  return (permission: Permission): boolean => {
    if (me.data?.is_super_admin) return true
    return project.data ? roleCan(project.data.role_code, permission) : false
  }
}
