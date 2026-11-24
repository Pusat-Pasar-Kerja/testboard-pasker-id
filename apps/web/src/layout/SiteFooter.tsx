import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { useCurrentUser } from '../hooks/queries'

/**
 * The one footer of the whole website (owner, 2026-11-24: "header dan footer itu sama semua
 * dan simetris"): Kemnaker navy with everything centred - the logo, the links people look
 * for at the bottom of a page, and who runs the site. The same on the public pages, in the
 * application and on the table screen.
 */
export function SiteFooter() {
  const { t } = useTranslation()
  const me = useCurrentUser()
  const links = [
    { to: '/publik', label: t('footer.publicHome') },
    { to: '/panduan', label: t('public.guide') },
    // Only once we know nobody is signed in on this device (no flicker while checking).
    ...(me.data === null ? [{ to: '/masuk', label: t('public.signIn') }] : []),
  ]
  return (
    <footer className="bg-brand-800 text-white">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 py-6 text-center sm:px-6">
        <TestBoardLogo size="sm" tone="light" />
        <nav aria-label={t('public.footerNav')}>
          <ul className="flex flex-wrap items-center justify-center text-sm">
            {links.map((link, index) => (
              <li key={link.to} className="flex items-center">
                {index > 0 && (
                  <span aria-hidden="true" className="px-1 text-white/40">
                    ·
                  </span>
                )}
                <Link
                  to={link.to}
                  className="inline-flex min-h-10 items-center rounded-md px-2 text-white/90 hover:text-white hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="text-xs text-white/70">
          © {new Date().getFullYear()} {t('public.footer')}
        </p>
      </div>
    </footer>
  )
}
