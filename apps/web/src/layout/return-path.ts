/**
 * Where "Buka TestBoard" / "Kembali ke meja" leads from the guide and the public pages
 * (owner, 2026-11-24: users first): back to the very page this tab was working on, not to
 * the start page. Kept per tab in session storage; without it the start page is used.
 */
const KEYS = { app: 'testboard:last-app-page', table: 'testboard:last-table-page' } as const

export type ReturnTo = keyof typeof KEYS

export function rememberPage(kind: ReturnTo, path: string): void {
  try {
    sessionStorage.setItem(KEYS[kind], path)
  } catch {
    // Storage blocked (private window): the start page is used instead, nothing breaks.
  }
}

export function lastPage(kind: ReturnTo, fallback: string): string {
  try {
    const path = sessionStorage.getItem(KEYS[kind])
    // Only a page of this website: a path, never a full address.
    if (path && path.startsWith('/') && !path.startsWith('//')) return path
  } catch {
    // Same as above.
  }
  return fallback
}
