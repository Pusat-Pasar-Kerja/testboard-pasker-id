import { MARK_CHECK_PATH, MARK_DOT, MARK_STROKE_WIDTH, MARK_VIEWBOX } from './mark-geometry'

/**
 * TestBoard symbol. Follows the Kemnaker hub logo grammar (Karirhub, Skillhub, Maganghub):
 * one thick, round-capped glyph of uniform stroke + one solid dot, single colour.
 * Glyph = check mark (a passed test); dot sits top-left (Karirhub: top-right,
 * Skillhub: left-middle, Maganghub: centre) so the family stays distinguishable.
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
      <circle {...MARK_DOT} fill="currentColor" />
      <path
        d={MARK_CHECK_PATH}
        stroke="currentColor"
        strokeWidth={MARK_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
