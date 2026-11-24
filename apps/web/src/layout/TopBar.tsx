import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { TestBoardLogo } from '../components/brand/TestBoardLogo'
import { TestBoardMark } from '../components/brand/TestBoardMark'

/**
 * The one header of the whole website (owner, 2026-11-24: "header dan footer itu sama semua
 * dan simetris"): a single row that never wraps - on the public pages, in the application
 * and on the table screen. It is mirrored: on the left the logo, a thin line, then where
 * you are (the project, the public menu, the group); on the right the round icon buttons,
 * a thin line, then the account. The blue-to-teal line on top is the Pasker signature.
 *
 * In the application (frame="app") the logo sits in a column exactly as wide as the left
 * panel, like Google Drive, and the rest lines up with the page below it.
 *
 * Not blurred and not transformed on purpose: either would trap the fixed panels it opens.
 */
export function TopBar({
  home,
  homeLabel,
  menuButton,
  context,
  actions,
  account,
  frame = 'site',
  width = 'max-w-6xl',
}: {
  /** Where the logo leads. */
  home: string
  homeLabel: string
  /** Opens the left panel on small screens (application only). */
  menuButton?: ReactNode
  /** Where you are: project and search, the public menu, or the group on the table screen. */
  context?: ReactNode
  /** Round icon buttons: search, accessibility (with language), help, administration. */
  actions?: ReactNode
  /** The right end: the account menu, or one pill (sign in, back, leave). */
  account?: ReactNode
  /** "app": full width with the logo above the left panel; "site": a centred column. */
  frame?: 'app' | 'site'
  /** Width of the centred column (site frame). */
  width?: string
}) {
  const app = frame === 'app'
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <div aria-hidden="true" className="chip-gradient h-1" />
      <div className={`mx-auto flex h-16 items-stretch ${app ? '' : `${width} px-4 sm:px-6`}`}>
        <div
          className={`flex shrink-0 items-center gap-1 ${
            app ? 'pl-2 sm:pl-4 lg:w-[288px] lg:border-r lg:border-line lg:pl-6 xl:w-[304px]' : ''
          }`}
        >
          {menuButton}
          <Link
            to={home}
            aria-label={homeLabel}
            className="inline-flex shrink-0 items-center rounded-lg"
          >
            <TestBoardMark className="size-9 text-brand-mark sm:hidden" />
            <span className="hidden sm:inline-flex">
              <TestBoardLogo size="md" />
            </span>
          </Link>
        </div>

        <div
          className={`flex min-w-0 flex-1 items-center gap-2 sm:gap-3 ${
            app ? 'pr-2 pl-2 sm:pr-4 sm:pl-3 lg:px-8' : 'pl-2 sm:pl-3'
          }`}
        >
          {context ? (
            <>
              <span
                aria-hidden="true"
                className={`hidden h-7 w-px shrink-0 bg-line ${app ? 'md:block lg:hidden' : 'sm:block'}`}
              />
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:gap-3">{context}</div>
            </>
          ) : (
            <div className="flex-1" />
          )}
          {actions && <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">{actions}</div>}
          {account && (
            <>
              <span aria-hidden="true" className="hidden h-7 w-px shrink-0 bg-line sm:block" />
              {account}
            </>
          )}
        </div>
      </div>
    </header>
  )
}
