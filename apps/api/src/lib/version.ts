import { readFileSync } from 'node:fs'

/**
 * Version of the API package. Workspace versions are kept in sync with the Git tag
 * (see README "Versioning"). Resolved relative to this file so it works from both
 * src/ (tsx) and dist/ (compiled) layouts.
 */
export function readAppVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
    ) as {
      version?: unknown
    }
    return typeof pkg.version === 'string' ? pkg.version : 'unknown'
  } catch {
    return 'unknown'
  }
}
