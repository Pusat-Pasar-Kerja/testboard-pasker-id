import type { CurrentUser } from '@testboard/shared'

/**
 * The page each person starts on (owner, 2026-11-24: users first). A table card goes to
 * Mode Mudah; Admins and Super Admins to their projects; a Pengguna (UAT user) straight to
 * "Tugas saya", the scenarios waiting for them, instead of a list of projects to pick from.
 */
export function homeOf(
  user: Pick<CurrentUser, 'account_kind' | 'system_role'> | null | undefined,
): string {
  if (!user) return '/'
  if (user.account_kind === 'TABLE') return '/meja/kerja'
  return user.system_role ? '/projects' : '/tugas'
}
