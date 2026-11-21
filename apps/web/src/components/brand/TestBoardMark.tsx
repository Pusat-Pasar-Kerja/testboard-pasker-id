import {
  MARK_BOARD,
  MARK_CHECK_PATH,
  MARK_DOT,
  MARK_STROKE_WIDTH,
  MARK_VIEWBOX,
} from './mark-geometry'

/**
 * TestBoard symbol "papan centang": a board with a check mark, held by a pin. Follows the
 * Kemnaker hub logo grammar (Karirhub, Skillhub, Maganghub): thick round-capped strokes of
 * uniform weight + one solid dot. Board and check take the brand colour (currentColor);
 * the pin is the warm pastel accent.
 */
export function TestBoardMark({ className, title }: { className?: string; title?: string }) {
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      fill="none"
      className={className}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      <rect
        {...MARK_BOARD}
        stroke="currentColor"
        strokeWidth={MARK_STROKE_WIDTH}
        strokeLinejoin="round"
      />
      <path
        d={MARK_CHECK_PATH}
        stroke="currentColor"
        strokeWidth={MARK_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle {...MARK_DOT} className="fill-brand-accent" />
    </svg>
  )
}
