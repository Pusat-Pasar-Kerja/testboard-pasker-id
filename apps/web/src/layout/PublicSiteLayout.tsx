import { ArrowRight, BookOpen, House, LogIn, QrCode } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { AnnouncementBanner } from '../components/AnnouncementBanner'
import { AccessibilityMenu } from '../components/a11y/AccessibilityMenu'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { useCurrentUser, usePublicSettings } from '../hooks/queries'
import { TopBar } from './TopBar'

/** The main button in the header: sign in, or go back to where this device is signed in. */
function HeaderAction() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const kind = me.data?.account_kind
  const target = !me.data
    ? { to: '/masuk', label: t('public.signIn'), icon: LogIn }
    : kind === 'TABLE'
      ? { to: '/meja/kerja', label: t('public.backToTable'), icon: QrCode }
      : { to: '/projects', label: t('public.backToApp'), icon: ArrowRight }
  const Icon = target.icon
  return (
    <Link
      to={target.to}
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-brand-700 px-5 text-sm font-semibold text-white shadow-xs hover:bg-brand-800"
    >
      <Icon aria-hidden="true" className="size-4" />
      {target.label}
    </Link>
  )
}

/**
 * The frame of every page anyone may open without signing in (front page, public Fase,
 * guide, the sign-in page, account recovery): the same header, width, colours and navy
 * footer as the Kemnaker family sites, so the whole website feels like one place.
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
  const width = wide ? 'max-w-7xl' : 'max-w-6xl'
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex min-h-11 items-center gap-2 rounded-full px-4 text-sm font-semibold ${
      isActive ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-100' : 'text-ink hover:bg-brand-50'
    }`

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <a
        href="#isi"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2"
      >
        {t('shell.skipToContent')}
      </a>
      {/* The same top bar as the application (owner: public and admin must feel as one). */}
      <TopBar
        home="/"
        homeLabel={siteName}
        width={width}
        middle={
          <nav
            aria-label={t('public.nav')}
            className="order-last flex w-full items-center gap-1 md:order-none md:w-auto"
          >
            <NavLink to="/publik" className={navClass}>
              <House aria-hidden="true" className="size-4" />
              {t('public.home')}
            </NavLink>
            <NavLink to="/panduan" className={navClass}>
              <BookOpen aria-hidden="true" className="size-4" />
              {t('public.guide')}
            </NavLink>
          </nav>
        }
        actions={
          <>
            <AccessibilityMenu />
            <span className="hidden md:inline-flex">
              <LanguageSwitcher />
            </span>
            <HeaderAction />
          </>
        }
      />
      <AnnouncementBanner />
      <main id="isi" className={`mx-auto w-full flex-1 px-4 py-8 sm:py-10 ${width}`}>
        {children}
      </main>
      <footer className="mt-8 bg-brand-800 text-white">
        <div className={`mx-auto grid gap-6 px-4 py-8 sm:grid-cols-[minmax(0,1fr)_auto] ${width}`}>
          <div className="space-y-3">
            <TestBoardLogo size="md" tone="light" />
            <p className="max-w-xl text-sm text-white/80">
              {t('public.footerAbout', { name: siteName })}
            </p>
          </div>
          <div className="space-y-4 sm:text-right">
            <nav
              aria-label={t('public.footerNav')}
              className="flex flex-col gap-2 text-sm sm:items-end"
            >
              <Link to="/publik" className="text-white/90 hover:text-white hover:underline">
                {t('public.home')}
              </Link>
              <Link to="/panduan" className="text-white/90 hover:text-white hover:underline">
                {t('public.guide')}
              </Link>
              <Link to="/masuk" className="text-white/90 hover:text-white hover:underline">
                {t('public.signIn')}
              </Link>
            </nav>
            <LanguageSwitcher />
          </div>
        </div>
        <div className="border-t border-white/15">
          <p className={`mx-auto px-4 py-4 text-xs text-white/70 ${width}`}>
            {t('public.footer', { name: siteName })}
          </p>
        </div>
      </footer>
    </div>
  )
}
