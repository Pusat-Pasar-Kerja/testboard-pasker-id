import { useCallback, useSyncExternalStore } from 'react'

/**
 * Accessibility settings ("Aksesibilitas", owner 2026-11-24): text size, theme, spacing,
 * readable letters, underlined links and less motion, for every page (public, staff and the
 * table screen). Kept per browser; a convenience only and safe to lose.
 *
 * public/a11y-boot.js applies the same stored settings before the app starts so a dark or
 * high-contrast page never flashes white; keep the two in sync (a11y.test.ts checks it).
 */
export const TEXT_SIZES = [0.9, 1, 1.125, 1.25, 1.4] as const
export const THEMES = ['light', 'dark', 'contrast', 'system'] as const
export type Theme = (typeof THEMES)[number]

export interface A11ySettings {
  /** Index into TEXT_SIZES (1 = normal). */
  size: number
  theme: Theme
  /** More space between lines, letters and words. */
  spacing: boolean
  /** Atkinson Hyperlegible: letters that are hard to confuse (Braille Institute). */
  readable: boolean
  /** Underline every link, not only the ones in running text. */
  underline: boolean
  /** No movement: animations and smooth scrolling off. */
  reduceMotion: boolean
}

export const DEFAULT_A11Y: A11ySettings = {
  size: 1,
  theme: 'light',
  spacing: false,
  readable: false,
  underline: false,
  reduceMotion: false,
}

export const A11Y_STORAGE_KEY = 'tb.a11y'
/** The A-/A/A+ control before 2026-11-24 stored only a scale factor. */
const OLD_FONT_KEY = 'tb.font-scale'

const isTheme = (value: unknown): value is Theme =>
  typeof value === 'string' && (THEMES as readonly string[]).includes(value)

export function readA11y(): A11ySettings {
  try {
    const raw = window.localStorage.getItem(A11Y_STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<A11ySettings>
      const size = Number(parsed.size)
      return {
        size: Number.isInteger(size) && size >= 0 && size < TEXT_SIZES.length ? size : 1,
        theme: isTheme(parsed.theme) ? parsed.theme : 'light',
        spacing: parsed.spacing === true,
        readable: parsed.readable === true,
        underline: parsed.underline === true,
        reduceMotion: parsed.reduceMotion === true,
      }
    }
    const old = Number(window.localStorage.getItem(OLD_FONT_KEY))
    const oldIndex = (TEXT_SIZES as readonly number[]).findIndex((s) => Math.abs(s - old) < 0.07)
    return oldIndex > 0 ? { ...DEFAULT_A11Y, size: oldIndex } : { ...DEFAULT_A11Y }
  } catch {
    return { ...DEFAULT_A11Y }
  }
}

const darkQuery = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

/** The theme actually drawn: "system" follows the device's light or dark setting. */
export function resolvedTheme(theme: Theme): Exclude<Theme, 'system'> {
  if (theme !== 'system') return theme
  return darkQuery()?.matches ? 'dark' : 'light'
}

export function applyA11y(settings: A11ySettings): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const scale = TEXT_SIZES[settings.size] ?? 1
  root.style.fontSize = scale === 1 ? '' : `${scale * 100}%`
  root.dataset.theme = resolvedTheme(settings.theme)
  const flag = (name: string, on: boolean) => {
    if (on) root.dataset[name] = 'on'
    else delete root.dataset[name]
  }
  flag('spacing', settings.spacing)
  flag('readable', settings.readable)
  flag('underline', settings.underline)
  flag('reduceMotion', settings.reduceMotion)
}

let current: A11ySettings = typeof window === 'undefined' ? DEFAULT_A11Y : readA11y()
const listeners = new Set<() => void>()

export function setA11y(next: A11ySettings): void {
  current = next
  try {
    window.localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(next))
    window.localStorage.removeItem(OLD_FONT_KEY)
  } catch {
    // Storage may be blocked; the settings still apply until the page is closed.
  }
  applyA11y(next)
  for (const listener of listeners) listener()
}

/** Call once at start-up: applies the stored settings and follows the device theme. */
export function startA11y(): void {
  current = readA11y()
  applyA11y(current)
  darkQuery()?.addEventListener('change', () => {
    if (current.theme === 'system') applyA11y(current)
  })
}

export function useA11y() {
  const settings = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
    () => DEFAULT_A11Y,
  )
  const update = useCallback(
    (patch: Partial<A11ySettings>) => setA11y({ ...current, ...patch }),
    [],
  )
  return {
    settings,
    update,
    reset: () => setA11y({ ...DEFAULT_A11Y }),
    changed: JSON.stringify(settings) !== JSON.stringify(DEFAULT_A11Y),
  }
}
