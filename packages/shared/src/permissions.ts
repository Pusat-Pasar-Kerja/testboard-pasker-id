import { MEMBER_ROLES, type MemberRole } from './enums.js'

/**
 * Per-project permission matrix (docs/blueprint/docs/09_AUTH_RBAC_SECURITY.md section 3).
 * Enforced by the API on every route; the web uses the same table only to hide controls.
 * SUPER_ADMIN (system role, ADR 0004) is allowed everything and is checked separately.
 */
const ALL: readonly MemberRole[] = MEMBER_ROLES
const LEADS: readonly MemberRole[] = ['ADMIN', 'QA_LEAD']

export const PERMISSIONS = {
  'project.read': ALL,
  'project.update': ['ADMIN'],
  'member.read': ALL,
  'member.manage': ['ADMIN'],
  'settings.manage': ['ADMIN'],
  'module.manage': LEADS,
  'suite.write': LEADS,
  'case.read': ALL,
  // DEVELOPER/TESTER/VIEWER can never change a case definition (TB-RBAC-003).
  'case.write': LEADS,
  'case.archive': LEADS,
  'import.manage': LEADS,
  'run.write': LEADS,
  'run.assign': LEADS,
  // TESTER additionally limited to run cases assigned to them (checked in the route).
  'execution.run': ['ADMIN', 'QA_LEAD', 'TESTER'],
  'defect.create': ['ADMIN', 'QA_LEAD', 'TESTER'],
  'defect.update': ['ADMIN', 'QA_LEAD', 'TESTER', 'DEVELOPER'],
  'report.read': ALL,
  'report.export': LEADS,
  'audit.read': LEADS,
} as const satisfies Record<string, readonly MemberRole[]>

export type Permission = keyof typeof PERMISSIONS

export function roleCan(role: MemberRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly MemberRole[]).includes(role)
}

export const SYSTEM_ROLES = ['SUPER_ADMIN'] as const
export type SystemRole = (typeof SYSTEM_ROLES)[number]
