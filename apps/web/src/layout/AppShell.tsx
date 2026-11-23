import { Menu, Search } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { AnnouncementBanner } from '../components/AnnouncementBanner'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { FontSizeControl } from '../components/FontSizeControl'
import { PageHelp } from '../components/help/PageHelp'
import { Tour } from '../components/help/Tour'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { projectPath } from '../hooks/route-state'
import { MobileDrawer } from './MobileDrawer'
import { ProjectSwitcher } from './ProjectSwitcher'
import { SidebarNav } from './SidebarNav'
import { UserMenu } from './UserMenu'

function TopbarSearch({ projectCode }: { projectCode: string }) {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [value, setValue] = useState('')
  return (
    <form
      role="search"
      className="hidden max-w-xs min-w-56 flex-1 2xl:block"
      onSubmit={(event) => {
        event.preventDefault()
        const q = value.trim()
        // One search for scenarios, problems and test sheets (audit 2026-11-24).
        navigate(`${projectPath(projectCode, 'search')}${q ? `?q=${encodeURIComponent(q)}` : ''}`)
        setValue('')
      }}
    >
      <label className="relative block">
        <span className="sr-only">{t('shell.searchLabel')}</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted"
        />
        <input
          type="search"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder={t('shell.search')}
          className="min-h-11 w-full rounded-lg border border-line-strong bg-canvas pr-3 pl-9 text-sm"
        />
      </label>
    </form>
  )
}

/**
 * Responsive application frame: sidebar (lg+), drawer (< lg), topbar, main landmark.
 * Renders the matched child route, or `children` for a page that picks its frame itself
 * (the guide).
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const { projectCode } = useParams()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  // Every drawer link calls closeMenu, so navigation from the drawer always closes it.
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-brand-700 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('shell.skipToContent')}
      </a>

      <aside className="sticky top-0 hidden h-dvh border-r border-line bg-surface lg:block">
        <SidebarNav projectCode={projectCode} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-20 border-b border-line bg-surface/95 backdrop-blur">
          <div className="flex min-h-16 flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 sm:gap-x-3 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-expanded={menuOpen}
              className="-ml-2 inline-flex size-11 items-center justify-center rounded-lg hover:bg-neutral-soft lg:hidden"
            >
              <Menu aria-hidden="true" className="size-5" />
              <span className="sr-only">{t('nav.openMenu')}</span>
            </button>
            <span className="lg:hidden">
              <TestBoardLogo size="sm" showTagline={false} />
            </span>
            {projectCode && (
              <div className="order-last w-full md:order-none md:w-auto">
                <ProjectSwitcher projectCode={projectCode} />
              </div>
            )}
            {projectCode && <TopbarSearch projectCode={projectCode} />}
            <div className="ml-auto flex items-center gap-2">
              <span data-tour="font-size" className="hidden md:inline-flex">
                <FontSizeControl />
              </span>
              {projectCode && (
                <Link
                  to={projectPath(projectCode, 'search')}
                  aria-label={t('search.title')}
                  className="inline-flex size-11 items-center justify-center rounded-lg hover:bg-neutral-soft 2xl:hidden"
                >
                  <Search aria-hidden="true" className="size-5" />
                </Link>
              )}
              <PageHelp />
              <LanguageSwitcher />
              <UserMenu />
            </div>
          </div>
        </header>
        <AnnouncementBanner />

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8"
        >
          <div key={pathname} className="animate-page-in">
            {children ?? <Outlet />}
          </div>
        </main>
      </div>

      <Tour />
      <MobileDrawer open={menuOpen} onClose={closeMenu}>
        <SidebarNav projectCode={projectCode} onNavigate={closeMenu} />
      </MobileDrawer>
    </div>
  )
}
