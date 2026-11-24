/*
 * One look for everything in the top bar (owner, 2026-11-24: "buat satu baris, simplify dan
 * nyaman di mata"). Every control is 44 px tall, icons are calm grey and turn blue on hover,
 * and each icon names itself on hover or focus (header-tip, from data-tip).
 * The classes carry no display value, so a caller can add `hidden sm:inline-flex`.
 */

/** A round icon button or link: Cari, Aksesibilitas, Bantuan, Administrasi. */
export const HEADER_ICON =
  'header-tip size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-brand-50 hover:text-brand-700 aria-expanded:bg-brand-50 aria-expanded:text-brand-700'

/** The account slot on the right end, filled: Masuk, Buka TestBoard, Kembali ke meja. */
export const HEADER_PILL =
  'h-11 shrink-0 items-center gap-2 rounded-full bg-brand-700 px-4 text-sm font-semibold whitespace-nowrap text-white shadow-xs hover:bg-brand-800 sm:px-5'

/** The account slot when the action is a quiet one: Keluar on the table screen. */
export const HEADER_PILL_QUIET =
  'h-11 shrink-0 items-center gap-2 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold whitespace-nowrap text-ink hover:bg-neutral-soft sm:px-5'

/** A field in the top bar (project, search): the same height and roundness. */
export const HEADER_FIELD =
  'h-11 w-full min-w-0 rounded-full border border-line bg-canvas pl-10 text-sm hover:border-line-strong'
