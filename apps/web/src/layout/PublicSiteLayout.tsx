import { BookOpen, LogIn, QrCode } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { FontSizeControl } from '../components/FontSizeControl'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { usePublicSettings } from '../hooks/queries'

/**
 * Pages anyone may open without signing in (front page, public Fase, guide, table card
 * sign-in): header with the main ways in, text size control and a calm footer.
 */
export function PublicSiteLayout({
  children,
  wide = false,
}: {
  children: ReactNode
  wide?: boolean
}) {
  const { t } = useTranslation()
  const settings = usePublicSettings()
  const siteName = settings.data?.['site.name'] ?? 'TestBoard PASKER ID'
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
      isActive ? 'bg-brand-100 text-brand-800' : 'text-ink hover:bg-neutral-soft'
    }`

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a
        href="#isi"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
      >
        {t('shell.skipToContent')}
      </a>
      <header className="border-b border-line bg-surface/90 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
        <div
          className={`mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${wide ? 'max-w-7xl' : 'max-w-6xl'}`}
        >
          <Link to="/publik" aria-label={siteName} className="shrink-0">
            <TestBoardLogo size="md" />
          </Link>
          <nav aria-label={t('public.nav')} className="flex flex-wrap items-center gap-1">
            <NavLink to="/panduan" className={navClass}>
              <BookOpen aria-hidden="true" className="size-4" />
              {t('public.guide')}
            </NavLink>
            <NavLink to="/meja" className={navClass}>
              <QrCode aria-hidden="true" className="size-4" />
              {t('public.tableSignIn')}
            </NavLink>
            <NavLink to="/login" className={navClass}>
              <LogIn aria-hidden="true" className="size-4" />
              {t('public.staffSignIn')}
            </NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <FontSizeControl />
            <LanguageSwitcher />
          </div>
        </div>
      </header>
      <main
        id="isi"
        className={`mx-auto w-full flex-1 px-4 py-8 ${wide ? 'max-w-7xl' : 'max-w-6xl'}`}
      >
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <div
          className={`mx-auto flex flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-muted ${wide ? 'max-w-7xl' : 'max-w-6xl'}`}
        >
          <p>{t('public.footer', { name: siteName })}</p>
          <p className="flex gap-4">
            <Link to="/panduan" className="hover:text-brand-700 hover:underline">
              {t('public.guide')}
            </Link>
            <Link to="/login" className="hover:text-brand-700 hover:underline">
              {t('public.staffSignIn')}
            </Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
