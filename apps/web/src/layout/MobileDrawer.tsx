import { X } from 'lucide-react'
import { useRef, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useFocusTrap } from '../hooks/use-focus-trap'

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
  useFocusTrap(open, panelRef, onClose)

  if (!open) return null
  return (
    <div className="fixed inset-0 z-40 lg:hidden">
      <div
        aria-hidden="true"
        className="absolute inset-0 animate-fade-in bg-ink/30 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.main')}
        className="absolute inset-y-0 left-0 flex w-[min(20rem,85vw)] animate-drawer-in flex-col bg-surface shadow-lg"
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
