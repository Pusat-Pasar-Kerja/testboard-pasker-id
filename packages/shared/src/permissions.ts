import { MEMBER_ROLES, type MemberRole } from './enums.js'

/**
 * Per-project permission matrix (docs/blueprint/docs/09_AUTH_RBAC_SECURITY.md section 3).
 * Enforced by the API on every route; the web uses the same table only to hide controls.
 * The website roles SUPER_ADMIN and ADMIN (ADR 0017) act as ADMIN in every project; a User
 * gets one task per project: TESTER (Penguji), DEVELOPER or VIEWER (Pemantau).
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
  // Field and status rules on top of this live in defect-workflow.ts (ADR 0007).
  'defect.update': ['ADMIN', 'QA_LEAD', 'TESTER', 'DEVELOPER'],
  'defect.comment': ['ADMIN', 'QA_LEAD', 'TESTER', 'DEVELOPER'],
  // Link/unlink a bug and a test attempt (TB-BUG-001).
  'defect.link': ['ADMIN', 'QA_LEAD', 'TESTER'],
  // Upload evidence (doc 09: testers for their tests, developers for their bugs; the
  // attach routes check the entity). VIEWER never uploads.
  'file.upload': ['ADMIN', 'QA_LEAD', 'TESTER', 'DEVELOPER'],
  'report.read': ALL,
  // Pemantau (leaders) may download reports too.
  'report.export': ['ADMIN', 'QA_LEAD', 'VIEWER'],
  'audit.read': LEADS,
} as const satisfies Record<string, readonly MemberRole[]>

export type Permission = keyof typeof PERMISSIONS

export function roleCan(role: MemberRole, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly MemberRole[]).includes(role)
}

/**
 * Website roles (ADR 0017). SUPER_ADMIN: everything, including inviting users and the
 * website settings. ADMIN: creates and manages every project (phases, features, scenarios,
 * tables, public view, bug review). Everyone else is a User with a task per project.
 */
export const SYSTEM_ROLES = ['SUPER_ADMIN', 'ADMIN'] as const
export type SystemRole = (typeof SYSTEM_ROLES)[number]
