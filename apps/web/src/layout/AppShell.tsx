import { Menu, Search, Settings } from 'lucide-react'
import { useCallback, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, Outlet, useLocation, useNavigate, useParams } from 'react-router'
import { AccessibilityMenu } from '../components/a11y/AccessibilityMenu'
import { AnnouncementBanner } from '../components/AnnouncementBanner'
import { PageHelp } from '../components/help/PageHelp'
import { Tour } from '../components/help/Tour'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useCurrentUser, usePublicSettings, useRecoverySummary } from '../hooks/queries'
import { projectPath } from '../hooks/route-state'
import { MobileDrawer } from './MobileDrawer'
import { ProjectSwitcher } from './ProjectSwitcher'
import { SidebarNav } from './SidebarNav'
import { TopBar } from './TopBar'
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

/** "Administrasi" in the top bar, with the count of new account-recovery requests. */
function AdminLink() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const role = me.data?.system_role ?? null
  const summary = useRecoverySummary(role === 'SUPER_ADMIN')
  if (!role) return null
  const open = summary.data?.open_requests ?? 0
  return (
    <Link
      to={role === 'SUPER_ADMIN' ? '/admin/users' : '/admin/projects'}
      aria-label={t('nav.adminSection')}
      data-tour="admin"
      className="relative inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
    >
      <Settings aria-hidden="true" className="size-5" />
      <span aria-hidden="true" className="hidden xl:inline">
        {t('nav.adminSection')}
      </span>
      {open > 0 && (
        <span className="absolute top-0.5 right-0.5 min-w-5 rounded-full bg-danger px-1 text-center text-[11px] leading-5 font-bold text-white tabular-nums">
          {open}
          <span className="sr-only"> {t('nav.openRequests')}</span>
        </span>
      )}
    </Link>
  )
}

/**
 * Application frame, like Google Drive (owner, 2026-11-24): one full-width top bar (logo,
 * project, search, accessibility, help, administration, language, account) and below it
 * the left panel with only the current context. The same top bar is used on the public
 * pages and the table screen, so the website feels like one place.
 * Renders the matched child route, or `children` for a page that picks its frame itself
 * (the guide).
 */
export function AppShell({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  const { projectCode } = useParams()
  const { pathname } = useLocation()
  const siteName = usePublicSettings().data?.['site.name'] ?? 'TestBoard PASKER ID'
  const [menuOpen, setMenuOpen] = useState(false)
  // Every drawer link calls closeMenu, so navigation from the drawer always closes it.
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-brand-700 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('shell.skipToContent')}
      </a>

      <TopBar
        home="/projects"
        homeLabel={siteName}
        menuButton={
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-expanded={menuOpen}
            className="-ml-2 inline-flex size-11 items-center justify-center rounded-lg hover:bg-neutral-soft lg:hidden"
          >
            <Menu aria-hidden="true" className="size-5" />
            <span className="sr-only">{t('nav.openMenu')}</span>
          </button>
        }
        middle={
          projectCode && (
            <>
              <div className="order-last w-full md:order-none md:w-auto">
                <ProjectSwitcher projectCode={projectCode} />
              </div>
              <TopbarSearch projectCode={projectCode} />
            </>
          )
        }
        actions={
          <>
            {projectCode && (
              <Link
                to={projectPath(projectCode, 'search')}
                aria-label={t('search.title')}
                className="inline-flex size-11 items-center justify-center rounded-lg text-brand-700 hover:bg-brand-50 2xl:hidden"
              >
                <Search aria-hidden="true" className="size-5" />
              </Link>
            )}
            <AccessibilityMenu />
            <PageHelp />
            <AdminLink />
            <span className="hidden md:inline-flex">
              <LanguageSwitcher />
            </span>
            <UserMenu />
          </>
        }
      />
      <AnnouncementBanner />

      <div className="flex-1 lg:grid lg:grid-cols-[288px_minmax(0,1fr)] xl:grid-cols-[304px_minmax(0,1fr)]">
        <aside className="sticky top-[calc(4.25rem+1px)] hidden h-[calc(100dvh-4.25rem-1px)] border-r border-line bg-surface lg:block">
          <SidebarNav projectCode={projectCode} />
        </aside>

        <div className="flex min-w-0 flex-col">
          <main
            id="main"
            tabIndex={-1}
            className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8"
          >
            <div key={pathname} className="animate-page-in">
              {children ?? <Outlet />}
            </div>
          </main>
          <footer className="border-t border-line px-4 py-4 text-xs text-ink-muted sm:px-6 lg:px-8">
            {t('public.footer', { name: siteName })}
          </footer>
        </div>
      </div>

      <Tour />
      <MobileDrawer open={menuOpen} onClose={closeMenu}>
        <SidebarNav projectCode={projectCode} onNavigate={closeMenu} />
      </MobileDrawer>
    </div>
  )
}
