import type { RequestIdVariables } from 'hono/request-id'

/** Hono environment shared by all routes. */
export interface AppEnv {
  Variables: RequestIdVariables
}
