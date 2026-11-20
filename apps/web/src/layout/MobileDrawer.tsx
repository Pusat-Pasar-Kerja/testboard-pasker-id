import { X } from 'lucide-react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

const FOCUSABLE = 'a[href], button:not([disabled]), select, input, [tabindex]:not([tabindex="-1"])'

/** Modal navigation drawer for < lg screens: focus trap, Esc to close, focus restore. */
export function MobileDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
}) {
  const { t } = useTranslation()
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const panel = panelRef.current
    panel?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panel) return
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE))
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
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div aria-hidden="true" className="absolute inset-0 bg-ink/40" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.main')}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] flex-col bg-surface shadow-xl"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 inline-flex size-11 items-center justify-center rounded-lg hover:bg-neutral-soft"
        >
          <X aria-hidden="true" className="size-5" />
          <span className="sr-only">{t('nav.closeMenu')}</span>
        </button>
        {children}
      </div>
    </div>
  )
}
