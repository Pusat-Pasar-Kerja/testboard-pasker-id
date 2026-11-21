import type { QueryClient } from '@tanstack/react-query'

/** Full address of the reset page; the token sits after `#`, so it never reaches server logs. */
export function resetLinkUrl(token: string): string {
  return `${window.location.origin}${import.meta.env.BASE_URL}reset-password#${token}`
}

export async function invalidateRecovery(queryClient: QueryClient) {
  await Promise.all(
    ['recovery-requests', 'recovery-summary', 'reset-links', 'admin-users'].map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] }),
    ),
  )
}
