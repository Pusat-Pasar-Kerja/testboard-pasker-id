import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'

/**
 * The one header of the whole website (owner, 2026-11-24: "publik dan admin harus terasa
 * satu"): the same height, colours, logo and the thin blue-to-teal line on the public pages,
 * in the application and on the table screen. Like Google Drive it spans the full width;
 * the left panel of the application sits below it.
 *
 * Not blurred and not transformed on purpose: either would trap the fixed panels it opens.
 */
export function TopBar({
  home,
  homeLabel,
  menuButton,
  middle,
  actions,
  logo,
  width = '',
}: {
  /** Where the logo leads. */
  home: string
  homeLabel: string
  /** Opens the left panel on small screens (application only). */
  menuButton?: ReactNode
  /** Navigation (public), or project switcher and search (application). */
  middle?: ReactNode
  /** Accessibility, help, language, account or sign-in. */
  actions?: ReactNode
  /** Replaces the full logo, e.g. the table name on the table screen. */
  logo?: ReactNode
  /** Container width; full width when empty. */
  width?: string
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div aria-hidden="true" className="chip-gradient h-1" />
      <div
        className={`mx-auto flex min-h-16 flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 sm:gap-x-3 sm:px-6 ${width}`}
      >
        {menuButton}
        <Link to={home} aria-label={homeLabel} className="mr-1 shrink-0 rounded-lg">
          {logo ?? <TestBoardLogo size="md" />}
        </Link>
        {middle}
        <div className="ml-auto flex items-center gap-1 sm:gap-2">{actions}</div>
      </div>
    </header>
  )
}
