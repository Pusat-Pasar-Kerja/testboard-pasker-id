/**
 * TestBoard symbol geometry ("papan centang", chosen by the owner 2026-11-21). Mirrored in
 * apps/web/public/favicon.svg and docs/brand/testboard-mark.svg - keep all three in sync
 * (docs/brand/README.md).
 */
export const MARK_VIEWBOX = '0 0 72 72'
/** The board: a rounded square outline. */
export const MARK_BOARD = { x: 9, y: 16, width: 54, height: 48, rx: 13 } as const
/** The check mark on the board (a passed test). */
export const MARK_CHECK_PATH = 'M23 41 32 50 49 31'
/** Board and check share one thick, round-capped stroke (hub family grammar). */
export const MARK_STROKE_WIDTH = 8
/** The pin holding the board: the hub-family solid dot, in the teal accent. */
export const MARK_DOT = { cx: 36, cy: 12, r: 8 } as const
/** Kemnaker blue (contrast 5.3:1 on white), "Biru Pasker" theme 2026-11-24. */
export const MARK_COLOR = '#1F6CBC'
/** SIAPkerja / Pasker teal for the pin (decorative). */
export const MARK_ACCENT = '#10A493'
