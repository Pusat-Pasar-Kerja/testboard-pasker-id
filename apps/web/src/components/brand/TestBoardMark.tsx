import { MARK_ARC_PATH, MARK_DOT, MARK_STROKE_WIDTH, MARK_VIEWBOX } from './mark-geometry'

/**
 * TestBoard symbol "siklus uji": a thick open loop and one solid dot, following the Kemnaker
 * hub logos (one bold rounded shape + one dot). The loop takes the brand colour
 * (currentColor); the dot is the teal accent.
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
      <path
        d={MARK_ARC_PATH}
        stroke="currentColor"
        strokeWidth={MARK_STROKE_WIDTH}
        strokeLinecap="round"
      />
      <circle {...MARK_DOT} className="fill-brand-accent" />
    </svg>
  )
}
