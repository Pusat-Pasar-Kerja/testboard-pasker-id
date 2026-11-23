/** The short guided tour of the app (owner, 2026-11-24: "tur interaktif"). */
const DONE_KEY = 'tb-tour-done-v1'
const EVENT = 'tb:tour'

export function tourDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1'
  } catch {
    return true
  }
}

export function markTourDone(): void {
  try {
    localStorage.setItem(DONE_KEY, '1')
  } catch {
    // private mode: the tour may show again next visit
  }
}

/** Start the tour from anywhere (the help panel's "Ulangi tur"). */
export function startTour(): void {
  window.dispatchEvent(new Event(EVENT))
}

export function onTourStart(listener: () => void): () => void {
  window.addEventListener(EVENT, listener)
  return () => window.removeEventListener(EVENT, listener)
}

/** Which page of the app this is, for the help panel and the guide link. */
export type HelpKey =
  | 'projects'
  | 'tasks'
  | 'profile'
  | 'dashboard'
  | 'cycles'
  | 'testCases'
  | 'imports'
  | 'workshop'
  | 'runs'
  | 'execution'
  | 'bugs'
  | 'evidence'
  | 'reports'
  | 'members'
  | 'settings'
  | 'adminUsers'
  | 'adminProjects'
  | 'adminRecovery'
  | 'adminSettings'
  | 'adminAudit'
  | 'guide'
  | 'search'

export function helpKeyOf(pathname: string): HelpKey {
  if (pathname.startsWith('/tugas')) return 'tasks'
  if (pathname.startsWith('/profile')) return 'profile'
  if (pathname.startsWith('/panduan')) return 'guide'
  if (pathname.startsWith('/admin/users')) return 'adminUsers'
  if (pathname.startsWith('/admin/recovery')) return 'adminRecovery'
  if (pathname.startsWith('/admin/settings')) return 'adminSettings'
  if (pathname.startsWith('/admin/audit')) return 'adminAudit'
  if (pathname.startsWith('/admin')) return 'adminProjects'
  const part = pathname.match(/^\/projects\/[^/]+\/([^/]+)(\/.*)?$/)
  if (!part) return 'projects'
  const [, section, rest = ''] = part
  if (section === 'runs' && /\/cases\//.test(rest)) return 'execution'
  const map: Record<string, HelpKey> = {
    dashboard: 'dashboard',
    cycles: 'cycles',
    'test-cases': 'testCases',
    imports: 'imports',
    workshop: 'workshop',
    runs: 'runs',
    bugs: 'bugs',
    evidence: 'evidence',
    reports: 'reports',
    members: 'members',
    settings: 'settings',
    search: 'search',
  }
  return map[section ?? ''] ?? 'dashboard'
}

/** The part of the guide that explains each page. */
export const GUIDE_SECTION: Record<HelpKey, string> = {
  projects: 'cara-kerja',
  tasks: 'penguji',
  profile: 'masuk',
  dashboard: 'cara-kerja',
  cycles: 'admin',
  testCases: 'admin',
  imports: 'admin',
  workshop: 'admin',
  runs: 'penguji',
  execution: 'penguji',
  bugs: 'developer',
  evidence: 'penguji',
  reports: 'pemantau',
  members: 'peran',
  settings: 'admin',
  adminUsers: 'super-admin',
  adminProjects: 'admin',
  adminRecovery: 'super-admin',
  adminSettings: 'super-admin',
  adminAudit: 'super-admin',
  guide: 'cara-kerja',
  search: 'cara-kerja',
}
