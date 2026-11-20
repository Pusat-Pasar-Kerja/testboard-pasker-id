import { useCallback } from 'react'
import { useParams, useSearchParams } from 'react-router'

/** Current project code from the `/projects/:projectCode/...` route. */
export function useProjectCode(): string {
  const { projectCode } = useParams()
  if (!projectCode) throw new Error('useProjectCode must be used under /projects/:projectCode')
  return projectCode
}

export function projectPath(projectCode: string, sub = 'dashboard'): string {
  return `/projects/${encodeURIComponent(projectCode)}/${sub}`
}

/**
 * Filter state encoded in the URL query string (doc 04: refresh keeps the deep link).
 * Changing any filter resets `page` so results never start on an out-of-range page.
 */
export function useUrlFilters<K extends string>(keys: readonly K[]) {
  const [params, setParams] = useSearchParams()

  const values = Object.fromEntries(keys.map((key) => [key, params.get(key) ?? ''])) as Record<
    K,
    string
  >
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1)

  const setFilter = useCallback(
    (key: K, value: string) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value) next.set(key, value)
        else next.delete(key)
        next.delete('page')
        return next
      })
    },
    [setParams],
  )

  const setPage = useCallback(
    (value: number) => {
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        if (value > 1) next.set('page', String(value))
        else next.delete('page')
        return next
      })
    },
    [setParams],
  )

  const reset = useCallback(() => setParams(new URLSearchParams()), [setParams])
  const active = keys.some((key) => values[key] !== '')

  return { values, page, setFilter, setPage, reset, active }
}

/** Narrow a URL string to an allowed code, or undefined. */
export function oneOf<T extends string>(allowed: readonly T[], value: string): T | undefined {
  return (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}
