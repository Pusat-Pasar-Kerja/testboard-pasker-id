import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), select:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Modal focus management: focus the first control (or `initial`), keep Tab inside,
 * close on Escape, lock page scroll and restore focus to the trigger on close.
 */
export function useFocusTrap(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onEscape: () => void,
  initialSelector?: string,
) {
  // Keep the latest callback without re-running the trap (which would steal focus) on render.
  const escapeRef = useRef(onEscape)
  useEffect(() => {
    escapeRef.current = onEscape
  })

  useEffect(() => {
    if (!active) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const container = containerRef.current
    const initial =
      (initialSelector && container?.querySelector<HTMLElement>(initialSelector)) ||
      container?.querySelector<HTMLElement>(FOCUSABLE)
    initial?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        escapeRef.current()
        return
      }
      if (event.key !== 'Tab' || !container) return
      const items = Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = items[0]
      const last = items.at(-1)
      if (!first || !last) return
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previouslyFocused?.focus()
    }
  }, [active, containerRef, initialSelector])
}
