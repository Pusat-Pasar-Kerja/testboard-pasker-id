import {
  Bug,
  CalendarRange,
  ChartColumn,
  FileUp,
  FolderKanban,
  Images,
  LayoutDashboard,
  ListChecks,
  PlayCircle,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { projectPath } from '../hooks/route-state'

type NavKey =
  | 'dashboard'
  | 'testCases'
  | 'cycles'
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
  { key: 'cycles', path: 'cycles', icon: CalendarRange, soon: true },
  { key: 'runs', path: 'runs', icon: PlayCircle },
  { key: 'bugs', path: 'bugs', icon: Bug },
  { key: 'evidence', path: 'evidence', icon: Images, soon: true },
  { key: 'imports', path: 'imports', icon: FileUp, soon: true },
  { key: 'reports', path: 'reports', icon: ChartColumn, soon: true },
  { key: 'team', path: 'members', icon: Users },
]

export function SidebarNav({
  projectCode,
  onNavigate,
}: {
  projectCode?: string
  onNavigate?: () => void
}) {
  const { t } = useTranslation()
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm transition-colors ${
      isActive
        ? 'bg-brand-50 font-semibold text-brand-700 shadow-[inset_3px_0_0_var(--color-brand-600)]'
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
        </div>
      </nav>
    </div>
  )
}
