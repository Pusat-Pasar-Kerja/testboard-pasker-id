import type { MemberRole } from '@testboard/shared'
import type { RequestIdVariables } from 'hono/request-id'

/** The signed-in user for this request, resolved from the session cookie. */
export interface AuthContext {
  userId: string
  email: string
  displayName: string
  preferredLocale: 'id' | 'en'
  /** Website role SUPER_ADMIN: user accounts, website settings, recovery (ADR 0017). */
  isSuperAdmin: boolean
  /** Website role ADMIN or SUPER_ADMIN: creates and manages every project (ADR 0017). */
  isAdmin: boolean
  sessionId: string
  csrfTokenHash: string
  /** PERSON = normal account; TABLE = a workshop table card (Mode Mudah only, ADR 0016). */
  accountKind: 'PERSON' | 'TABLE'
}

/** Project resolved for a project-scoped route, with the caller's effective role. */
export interface ProjectAccess {
  id: string
  code: string
  name: string
  /** Effective role; the website roles Admin and Super Admin act as ADMIN in every project. */
  role: MemberRole
  /** Access comes from the website role, not from a membership row. */
  viaSiteRole: boolean
}

/** Hono environment shared by all routes. */
export interface AppEnv {
  Variables: RequestIdVariables & {
    auth: AuthContext | null
    project: ProjectAccess
  }
}
