import type { MemberRole } from '@testboard/shared'
import type { RequestIdVariables } from 'hono/request-id'

/** The signed-in user for this request, resolved from the session cookie. */
export interface AuthContext {
  userId: string
  email: string
  displayName: string
  preferredLocale: 'id' | 'en'
  isSuperAdmin: boolean
  sessionId: string
  csrfTokenHash: string
}

/** Project resolved for a project-scoped route, with the caller's effective role. */
export interface ProjectAccess {
  id: string
  code: string
  name: string
  /** Effective role; SUPER_ADMIN is treated as ADMIN in every project. */
  role: MemberRole
  viaSuperAdmin: boolean
}

/** Hono environment shared by all routes. */
export interface AppEnv {
  Variables: RequestIdVariables & {
    auth: AuthContext | null
    project: ProjectAccess
  }
}
