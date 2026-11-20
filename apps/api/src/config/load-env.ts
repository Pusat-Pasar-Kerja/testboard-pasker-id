import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { isInsideApp } from './env.js'

/**
 * Load private settings before the config is parsed.
 *
 * - `TESTBOARD_ENV_FILE=/path/api.env` (the VPS setup, see docs/deploy): explicit file.
 * - otherwise `./.env` in the working directory (local development convenience).
 *
 * In production the file holding database credentials must live OUTSIDE the application
 * folder: on the VPS that folder sits under the Apache web root (ADR 0010).
 */
export function loadEnvironment(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.TESTBOARD_ENV_FILE
  const file = explicit ? resolve(explicit) : existsSync('.env') ? resolve('.env') : null
  if (!file) return null
  if (!existsSync(file)) throw new Error(`Environment file not found: ${file}`)
  process.loadEnvFile(file)
  if (process.env.NODE_ENV === 'production' && isInsideApp(file)) {
    throw new Error(
      'In production the environment file must be outside the application folder ' +
        '(it is under the public web root). Set TESTBOARD_ENV_FILE to its new location.',
    )
  }
  return file
}
