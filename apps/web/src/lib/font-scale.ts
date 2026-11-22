import { useCallback, useSyncExternalStore } from 'react'

/**
 * Text size for readers who need larger letters (A- / A / A+). Every size in the app is in
 * rem, so changing the root font size scales the whole page, buttons included. The choice
 * is kept per browser; it is a convenience only and safe to lose.
 */
export const FONT_SCALES = [1, 1.125, 1.25, 1.375] as const
export type FontScale = (typeof FONT_SCALES)[number]

const STORAGE_KEY = 'tb.font-scale'
const listeners = new Set<() => void>()

function read(): FontScale {
  try {
    const value = Number(window.localStorage.getItem(STORAGE_KEY))
    return (FONT_SCALES as readonly number[]).includes(value) ? (value as FontScale) : 1
  } catch {
    return 1
  }
}

let current: FontScale = typeof window === 'undefined' ? 1 : read()

export function applyFontScale(scale: FontScale = current): void {
  if (typeof document === 'undefined') return
  document.documentElement.style.fontSize = scale === 1 ? '' : `${scale * 100}%`
}

export function setFontScale(scale: FontScale): void {
  current = scale
  try {
    window.localStorage.setItem(STORAGE_KEY, String(scale))
  } catch {
    // Storage may be blocked; the size still applies until the page is closed.
  }
  applyFontScale(scale)
  for (const listener of listeners) listener()
}

export function useFontScale() {
  const scale = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => current,
    () => 1 as FontScale,
  )
  const step = useCallback(
    (delta: 1 | -1) => {
      const index = FONT_SCALES.indexOf(scale)
      const next = FONT_SCALES[Math.min(FONT_SCALES.length - 1, Math.max(0, index + delta))]
      if (next !== undefined) setFontScale(next)
    },
    [scale],
  )
  return {
    scale,
    canGrow: scale < FONT_SCALES[FONT_SCALES.length - 1]!,
    canShrink: scale > FONT_SCALES[0],
    grow: () => step(1),
    shrink: () => step(-1),
    reset: () => setFontScale(1),
  }
}
