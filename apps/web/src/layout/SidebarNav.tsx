import type { MemberRole } from '@testboard/shared'
import {
  BookOpen,
  Bug,
  CalendarRange,
  ChartColumn,
  ClipboardCheck,
  FileUp,
  FolderCog,
  FolderKanban,
  Globe,
  History,
  Images,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Presentation,
  Settings2,
  SlidersHorizontal,
  Users,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { useCurrentUser, useProject, useRecoverySummary } from '../hooks/queries'
import { projectPath } from '../hooks/route-state'

/** Who sees a menu item: Admin (website role, or a legacy lead row) or a User's task. */
type Who = 'ADMIN' | 'TESTER' | 'DEVELOPER' | 'VIEWER'
const EVERYONE: readonly Who[] = ['ADMIN', 'TESTER', 'DEVELOPER', 'VIEWER']

type ItemKey =
  | 'dashboard'
  | 'cycles'
  | 'testCases'
  | 'imports'
  | 'workshop'
  | 'runs'
  | 'bugs'
  | 'evidence'
  | 'reports'
  | 'members'
  | 'settings'
type GroupKey = 'prepare' | 'run' | 'results' | 'manage'

interface Item {
  key: ItemKey
  path: string
  icon: LucideIcon
  who: readonly Who[]
}

/**
 * The project menu follows the order of the work (owner, 2026-11-24): get ready, test,
 * look at the results, manage. Plain words first, the original term small underneath.
 * A User only sees the parts of their task (ADR 0017); the API enforces the same.
 */
const GROUPS: { key: GroupKey | null; items: Item[] }[] = [
  {
    key: null,
    items: [{ key: 'dashboard', path: 'dashboard', icon: LayoutDashboard, who: EVERYONE }],
  },
  {
    key: 'prepare',
    items: [
      { key: 'cycles', path: 'cycles', icon: CalendarRange, who: ['ADMIN', 'VIEWER'] },
      { key: 'testCases', path: 'test-cases', icon: ListChecks, who: EVERYONE },
      { key: 'imports', path: 'imports', icon: FileUp, who: ['ADMIN'] },
    ],
  },
  {
    key: 'run',
    items: [
      { key: 'workshop', path: 'workshop', icon: Presentation, who: ['ADMIN', 'VIEWER'] },
      { key: 'runs', path: 'runs', icon: PlayCircle, who: EVERYONE },
    ],
  },
  {
    key: 'results',
    items: [
      { key: 'bugs', path: 'bugs', icon: Bug, who: EVERYONE },
      { key: 'evidence', path: 'evidence', icon: Images, who: EVERYONE },
      { key: 'reports', path: 'reports', icon: ChartColumn, who: ['ADMIN', 'DEVELOPER', 'VIEWER'] },
    ],
  },
  {
    key: 'manage',
    items: [
      { key: 'members', path: 'members', icon: Users, who: ['ADMIN', 'VIEWER'] },
      { key: 'settings', path: 'settings', icon: SlidersHorizontal, who: ['ADMIN'] },
    ],
  },
]

/** Website administration (ADR 0011, 0017): an Admin sees the projects page only. */
const ADMIN_ITEMS = [
  { key: 'adminProjects', path: '/admin/projects', icon: FolderCog },
  { key: 'adminUsersShort', path: '/admin/users', icon: UsersRound },
  { key: 'adminRecovery', path: '/admin/recovery', icon: KeyRound },
  { key: 'adminSettings', path: '/admin/settings', icon: Settings2 },
  { key: 'adminAudit', path: '/admin/audit', icon: History },
] as const

const whoOf = (role: MemberRole | undefined, siteRole: boolean): Who | null => {
  if (siteRole || role === 'ADMIN' || role === 'QA_LEAD') return 'ADMIN'
  return role ?? null
}

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center gap-3 rounded-xl px-3 py-1.5 text-sm transition-colors ${
    isActive
      ? 'bg-brand-50 font-semibold text-brand-800 shadow-[inset_3px_0_0_var(--color-brand-600)]'
      : 'text-ink hover:bg-brand-50/60'
  }`

function GroupTitle({ children }: { children: string }) {
  return (
    <p className="mt-5 mb-1 px-3 text-[11px] font-semibold tracking-wider text-ink-muted uppercase">
      {children}
    </p>
  )
}

export function SidebarNav({
  projectCode,
  onNavigate,
}: {
  projectCode?: string
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const project = useProject(projectCode ?? '')
  const siteRole = me.data?.system_role ?? null
  const who = projectCode ? whoOf(project.data?.role_code, Boolean(siteRole)) : null
  // New "Lupa kata sandi / email" requests: shown as a badge (no e-mail is sent).
  const recoverySummary = useRecoverySummary(siteRole === 'SUPER_ADMIN')
  const openRequests = recoverySummary.data?.open_requests ?? 0

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Link to="/projects" onClick={onNavigate} aria-label="TestBoard PASKER ID">
          <TestBoardLogo size="md" />
        </Link>
      </div>
      <nav aria-label={t('nav.main')} className="flex-1 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          <li>
            <NavLink to="/tugas" className={linkClass} onClick={onNavigate} data-tour="my-tasks">
              <ClipboardCheck aria-hidden="true" className="size-5 shrink-0" />
              <span>{t('nav.myTasks')}</span>
            </NavLink>
          </li>
          <li>
            <NavLink to="/projects" end className={linkClass} onClick={onNavigate}>
              <FolderKanban aria-hidden="true" className="size-5 shrink-0" />
              <span>{t('nav.projects')}</span>
            </NavLink>
          </li>
        </ul>

        {projectCode && (
          <div className="mt-4 border-t border-line pt-4" data-tour="project-menu">
            <div className="mb-2 rounded-xl bg-gradient-to-br from-brand-50 to-teal-50 px-3 py-2 ring-1 ring-brand-100">
              <p className="text-[11px] font-semibold tracking-wider text-teal-700 uppercase">
                {t('nav.thisProject')}
              </p>
              <p className="truncate font-semibold text-brand-800">
                {project.data?.name ?? projectCode}
              </p>
              {who && who !== 'ADMIN' && (
                <p className="text-xs text-ink-muted">
                  {t('nav.yourTask', { task: t(`codes.role.${who}`) })}
                </p>
              )}
            </div>
            {GROUPS.map((group) => {
              const items = group.items.filter((item) => who && item.who.includes(who))
              if (items.length === 0) return null
              return (
                <div
                  key={group.key ?? 'home'}
                  data-tour={group.key ? `group-${group.key}` : 'home'}
                >
                  {group.key && <GroupTitle>{t(`nav.group.${group.key}`)}</GroupTitle>}
                  <ul className="space-y-0.5">
                    {items.map((item) => (
                      <li key={item.key}>
                        <NavLink
                          to={projectPath(projectCode, item.path)}
                          className={linkClass}
                          onClick={onNavigate}
                        >
                          <item.icon aria-hidden="true" className="size-5 shrink-0" />
                          <span className="min-w-0 flex-1 leading-tight">
                            <span className="block truncate">{t(`nav.${item.key}`)}</span>
                            <span className="block truncate text-[11px] font-normal text-ink-muted">
                              {t(`nav.term.${item.key}`)}
                            </span>
                          </span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </div>
        )}

        <div className="mt-4 border-t border-line pt-4">
          <GroupTitle>{t('nav.group.help')}</GroupTitle>
          <NavLink to="/panduan" className={linkClass} onClick={onNavigate} data-tour="guide">
            <BookOpen aria-hidden="true" className="size-5 shrink-0" />
            <span>{t('nav.guide')}</span>
          </NavLink>
          <NavLink to="/publik" className={linkClass} onClick={onNavigate}>
            <Globe aria-hidden="true" className="size-5 shrink-0" />
            <span>{t('nav.publicSite')}</span>
          </NavLink>
          {siteRole && (
            <>
              <GroupTitle>{t('nav.adminSection')}</GroupTitle>
              <ul className="space-y-0.5">
                {ADMIN_ITEMS.filter(
                  (item) => siteRole === 'SUPER_ADMIN' || item.key === 'adminProjects',
                ).map((item) => (
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
