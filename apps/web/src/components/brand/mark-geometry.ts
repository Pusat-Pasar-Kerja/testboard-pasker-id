/**
 * TestBoard symbol geometry, "siklus uji" (chosen by the owner 2026-11-24, replacing the
 * 2026-11-21 board with a check): one thick, round-capped 270-degree arc and one solid dot,
 * the Kemnaker hub family grammar (Karirhub, Maganghub, Skillhub: one bold rounded shape +
 * one dot, no check marks). It reads as the testing loop: try, report, fix, try again.
 *
 * Mirrored in apps/web/public/favicon.svg and docs/brand/testboard-mark.svg - keep all
 * three in sync (docs/brand/README.md; brand.test.ts checks it).
 */
export const MARK_VIEWBOX = '0 0 72 72'
/** The loop: from 3 o'clock clockwise round to 12 o'clock, leaving the top-right open. */
export const MARK_ARC_PATH = 'M58 36A22 22 0 1 1 36 14'
/** One thick, round-capped stroke (hub family weight). */
export const MARK_STROKE_WIDTH = 11
/** The hub-family solid dot, in the teal accent, sitting in the opening of the loop. */
export const MARK_DOT = { cx: 51.5, cy: 20.5, r: 7.5 } as const
/** Kemnaker blue (contrast 5.3:1 on white), "Biru Pasker" theme 2026-11-24. */
export const MARK_COLOR = '#1F6CBC'
/** SIAPkerja / Pasker teal for the dot (decorative). */
export const MARK_ACCENT = '#10A493'
