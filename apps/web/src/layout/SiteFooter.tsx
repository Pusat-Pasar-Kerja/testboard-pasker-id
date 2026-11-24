import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'

/**
 * The one footer of the whole website (owner, 2026-11-24): a slim white bar that mirrors
 * the header - who runs the site on the left, a few links and the release number on the
 * right. In the application it closes the page column next to the left panel (same white,
 * same thin lines), so panel, header and footer frame the work area; on the public pages
 * and the table screen it lines up with the header's column.
 */
export function SiteFooter({
  frame = 'site',
  width = 'max-w-6xl',
}: {
  /** "app": inside the page column next to the left panel; "site": a centred column. */
  frame?: 'app' | 'site'
  /** Width of the centred column (site frame), the same as the header's. */
  width?: string
}) {
  const { t } = useTranslation()
  const isApp = frame === 'app'
  const link =
    'inline-flex min-h-8 items-center rounded-md px-1.5 text-ink-muted hover:text-brand-700 hover:underline'
  return (
    <footer className="border-t border-line bg-surface">
      <div
        className={`flex flex-col items-center gap-1 py-3 text-center text-xs text-ink-muted sm:flex-row sm:justify-between sm:gap-4 sm:py-2 sm:text-left ${
          isApp ? 'px-4 sm:px-6 lg:px-8' : `mx-auto ${width} px-4 sm:px-6`
        }`}
      >
        <p>
          © {new Date().getFullYear()} {t('public.footer')}
        </p>
        <nav aria-label={t('public.footerNav')}>
          <ul className="flex flex-wrap items-center justify-center gap-x-2 whitespace-nowrap sm:flex-nowrap">
            <li>
              <Link to="/panduan" className={link}>
                {t('public.guide')}
              </Link>
            </li>
            <li aria-hidden="true">·</li>
            <li>
              <Link to="/publik" className={link}>
                {t('footer.publicHome')}
              </Link>
            </li>
            <li aria-hidden="true">·</li>
            <li className="px-1.5">{t('footer.version', { version: __APP_VERSION__ })}</li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}
