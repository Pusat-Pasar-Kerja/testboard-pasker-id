import { BookOpen, CircleHelp, Compass, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useLocation } from 'react-router'
import { GUIDE_SECTION, helpKeyOf, startTour } from './tour-state'

/**
 * "Bantuan" in the top bar (owner, 2026-11-24): a side panel that explains the page being
 * used in plain words - what it is for and the usual steps - with a link to the full guide
 * and the short tour.
 */
export function PageHelp() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const key = helpKeyOf(pathname)
  // Arrays of steps live in the translation files (returnObjects).
  const tx = t as unknown as (k: string, options: { returnObjects: true }) => unknown
  const steps = tx(`help.pages.${key}.steps`, { returnObjects: true })
  const stepList = Array.isArray(steps) ? (steps as string[]) : []

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label={t('help.button')}
        data-tour="page-help"
        className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
      >
        <CircleHelp aria-hidden="true" className="size-5" />
        <span aria-hidden="true" className="hidden sm:inline">
          {t('help.button')}
        </span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <button
            type="button"
            aria-label={t('help.close')}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-brand-900/40 animate-fade-in"
          />
          <aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="bantuan-judul"
            className="relative flex h-full w-full max-w-md animate-drawer-in flex-col overflow-y-auto bg-surface shadow-lg"
          >
            <div className="flex items-start justify-between gap-3 border-b border-line bg-gradient-to-br from-brand-50 to-teal-50 p-5">
              <div>
                <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
                  {t('help.eyebrow')}
                </p>
                <h2 id="bantuan-judul" className="mt-1 text-xl font-bold text-brand-800">
                  {t(`help.pages.${key}.title`)}
                </h2>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-white/70"
              >
                <X aria-hidden="true" className="size-5" />
                <span className="sr-only">{t('help.close')}</span>
              </button>
            </div>
            <div className="space-y-5 p-5">
              <p className="text-ink">{t(`help.pages.${key}.what`)}</p>
              {stepList.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-ink-muted">{t('help.stepsTitle')}</h3>
                  <ol className="mt-2 space-y-3">
                    {stepList.map((step, index) => (
                      <li key={step} className="flex gap-3">
                        <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full chip-gradient text-sm font-bold">
                          {index + 1}
                        </span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="flex flex-col gap-2 border-t border-line pt-5">
                <Link
                  to={`/panduan#${GUIDE_SECTION[key]}`}
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand-700 px-4 font-semibold text-white hover:bg-brand-800"
                >
                  <BookOpen aria-hidden="true" className="size-5" />
                  {t('help.fullGuide')}
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    startTour()
                  }}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-4 font-semibold hover:bg-brand-50"
                >
                  <Compass aria-hidden="true" className="size-5" />
                  {t('help.tour')}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  )
}
