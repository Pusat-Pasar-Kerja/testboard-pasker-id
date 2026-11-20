import { roleCan, type DefectActor, type Permission, type UserRef } from '@testboard/shared'
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

/**
 * The signed-in user as seen by the bug workflow (ADR 0007): role in this project
 * (Super Admin counts as ADMIN) and whether they reported / are assigned the bug.
 * null while the project or user is still loading.
 */
export function useDefectActor(
  projectCode: string,
  defect?: { reported_by: UserRef | null; assigned_to: UserRef | null },
): DefectActor | null {
  const project = useProject(projectCode)
  const me = useCurrentUser()
  if (!project.data || !me.data) return null
  return {
    role: me.data.is_super_admin ? 'ADMIN' : project.data.role_code,
    isAssignee: Boolean(defect?.assigned_to && defect.assigned_to.id === me.data.id),
    isReporter: Boolean(defect?.reported_by && defect.reported_by.id === me.data.id),
  }
}
