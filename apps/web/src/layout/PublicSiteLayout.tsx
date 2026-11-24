import { ArrowRight, BookOpen, House, LogIn, QrCode } from 'lucide-react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink } from 'react-router'
import { AnnouncementBanner } from '../components/AnnouncementBanner'
import { AccessibilityMenu } from '../components/a11y/AccessibilityMenu'
import { useCurrentUser, usePublicSettings } from '../hooks/queries'
import { HEADER_PILL } from './header-styles'
import { SiteFooter } from './SiteFooter'
import { TopBar } from './TopBar'

/** The account slot of the public header: sign in, or go back to where this device is signed in. */
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
    <Link to={target.to} className={`inline-flex ${HEADER_PILL}`}>
      <Icon aria-hidden="true" className="size-4" />
      {target.label}
    </Link>
  )
}

/**
 * The frame of every page anyone may open without signing in (front page, public Fase,
 * guide, the sign-in page, account recovery): the same one-row header and the same footer
 * as the application and the table screen, so the whole website feels like one place.
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
  // On phones the menu shows its icons only; the words stay for screen readers.
  const navClass = ({ isActive }: { isActive: boolean }) =>
    `inline-flex h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-full px-3 text-sm font-semibold sm:px-4 ${
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
      <TopBar
        home="/"
        homeLabel={siteName}
        width={width}
        context={
          <nav aria-label={t('public.nav')} className="flex items-center gap-1">
            <NavLink to="/publik" className={navClass}>
              <House aria-hidden="true" className="size-4 shrink-0" />
              <span className="sr-only sm:not-sr-only">{t('public.home')}</span>
            </NavLink>
            <NavLink to="/panduan" className={navClass}>
              <BookOpen aria-hidden="true" className="size-4 shrink-0" />
              <span className="sr-only sm:not-sr-only">{t('public.guide')}</span>
            </NavLink>
          </nav>
        }
        actions={<AccessibilityMenu />}
        account={<HeaderAction />}
      />
      <AnnouncementBanner />
      <main id="isi" className={`mx-auto w-full flex-1 px-4 py-8 sm:px-6 sm:py-10 ${width}`}>
        {children}
      </main>
      <SiteFooter />
    </div>
  )
}
