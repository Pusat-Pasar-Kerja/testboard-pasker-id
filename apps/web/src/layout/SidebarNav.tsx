import {
  Bug,
  CalendarRange,
  ChartColumn,
  FileUp,
  FolderCog,
  FolderKanban,
  History,
  Images,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Presentation,
  Settings2,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { useCurrentUser, useRecoverySummary } from '../hooks/queries'
import { projectPath } from '../hooks/route-state'

type NavKey =
  | 'dashboard'
  | 'testCases'
  | 'cycles'
  | 'workshop'
  | 'runs'
  | 'bugs'
  | 'evidence'
  | 'imports'
  | 'reports'
  | 'team'

/** Order follows docs/03 "Struktur navigasi utama". `soon` = built in a later milestone. */
const ITEMS: { key: NavKey; path: string; icon: LucideIcon; soon?: boolean }[] = [
  { key: 'dashboard', path: 'dashboard', icon: LayoutDashboard },
  { key: 'testCases', path: 'test-cases', icon: ListChecks },
  { key: 'cycles', path: 'cycles', icon: CalendarRange },
  { key: 'workshop', path: 'workshop', icon: Presentation },
  { key: 'runs', path: 'runs', icon: PlayCircle },
  { key: 'bugs', path: 'bugs', icon: Bug },
  { key: 'evidence', path: 'evidence', icon: Images },
  { key: 'imports', path: 'imports', icon: FileUp },
  { key: 'reports', path: 'reports', icon: ChartColumn },
  { key: 'team', path: 'members', icon: Users },
]

/** Super Admin console (ADR 0011): website-wide management. */
const ADMIN_ITEMS = [
  { key: 'adminProjects', path: '/admin/projects', icon: FolderCog },
  { key: 'adminUsersShort', path: '/admin/users', icon: UsersRound },
  { key: 'adminRecovery', path: '/admin/recovery', icon: KeyRound },
  { key: 'adminSettings', path: '/admin/settings', icon: Settings2 },
  { key: 'adminAudit', path: '/admin/audit', icon: History },
] as const

export function SidebarNav({
  projectCode,
  onNavigate,
}: {
  projectCode?: string
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const me = useCurrentUser()
  // New "Lupa kata sandi / email" requests: shown as a badge (no e-mail is sent).
  const recoverySummary = useRecoverySummary(Boolean(me.data?.is_super_admin))
  const openRequests = recoverySummary.data?.open_requests ?? 0
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
      isActive
        ? 'bg-brand-100 font-semibold text-brand-800 shadow-[inset_3px_0_0_var(--color-brand-600)]'
        : 'text-ink hover:bg-neutral-soft'
    }`

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Link to="/projects" onClick={onNavigate} aria-label="TestBoard PASKER ID">
          <TestBoardLogo size="md" />
        </Link>
      </div>
      <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto px-3 py-4">
        {projectCode && (
          <ul className="space-y-1">
            {ITEMS.map((item) => (
              <li key={item.key}>
                <NavLink
                  to={projectPath(projectCode, item.path)}
                  className={linkClass}
                  onClick={onNavigate}
                >
                  <item.icon aria-hidden="true" className="size-5 shrink-0" />
                  <span className="flex-1">{t(`nav.${item.key}`)}</span>
                  {item.soon && (
                    <span className="rounded bg-neutral-soft px-1.5 py-0.5 text-[11px] font-medium text-ink-muted">
                      {t('nav.soon')}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
        <div className={projectCode ? 'mt-4 border-t border-line pt-4' : ''}>
          <NavLink to="/projects" end className={linkClass} onClick={onNavigate}>
            <FolderKanban aria-hidden="true" className="size-5 shrink-0" />
            <span>{t('nav.projects')}</span>
          </NavLink>
          {me.data?.is_super_admin && (
            <>
              <p className="mt-5 px-3 pb-1 text-[11px] font-semibold tracking-wide text-ink-muted uppercase">
                {t('nav.adminSection')}
              </p>
              <ul className="space-y-1">
                {ADMIN_ITEMS.map((item) => (
                  <li key={item.key}>
                    <NavLink to={item.path} className={linkClass} onClick={onNavigate}>
                      <item.icon aria-hidden="true" className="size-5 shrink-0" />
                      <span>{t(`nav.${item.key}`)}</span>
                      {item.key === 'adminRecovery' && openRequests > 0 && (
                        <span className="ml-auto rounded-full bg-danger px-1.5 text-xs font-semibold text-white tabular-nums">
                          {openRequests}
                          <span className="sr-only"> {t('nav.openRequests')}</span>
                        </span>
                      )}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </nav>
    </div>
  )
}
