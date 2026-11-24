import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { markTourDone, onTourStart, tourDone } from './tour-state'

type StepKey = 'myTasks' | 'projectMenu' | 'startHere' | 'pageHelp' | 'a11y' | 'admin'

/** The parts of the screen the tour points at, in order (data-tour attributes). */
const STEPS: { key: StepKey; target: string }[] = [
  { key: 'myTasks', target: 'my-tasks' },
  { key: 'projectMenu', target: 'project-menu' },
  { key: 'startHere', target: 'start-here' },
  { key: 'pageHelp', target: 'page-help' },
  { key: 'a11y', target: 'a11y' },
  { key: 'admin', target: 'admin' },
]

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** Only targets that are on screen now (the sidebar is hidden on phones, etc.). */
function visibleSteps() {
  return STEPS.filter(({ target }) => {
    const element = document.querySelector<HTMLElement>(`[data-tour="${target}"]`)
    if (!element) return false
    const rect = element.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })
}

/**
 * A short guided tour of the app (owner, 2026-11-24). Starts once on the first visit (not in
 * tests), and again from "Bantuan > Ulangi tur". It dims the page and points at one part at a
 * time; Escape or "Lewati" ends it.
 */
export function Tour() {
  const { t } = useTranslation()
  const [steps, setSteps] = useState<typeof STEPS>([])
  const [index, setIndex] = useState(0)
  const [box, setBox] = useState<Box | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const step = steps[index]

  const start = useCallback(() => {
    const available = visibleSteps()
    if (available.length === 0) return
    setSteps(available)
    setIndex(0)
  }, [])

  const finish = useCallback(() => {
    markTourDone()
    setSteps([])
    setBox(null)
  }, [])

  useEffect(() => onTourStart(start), [start])

  // First visit: start after the page has drawn (never in automated tests).
  useEffect(() => {
    if (import.meta.env.MODE === 'test' || tourDone()) return
    const timer = window.setTimeout(start, 900)
    return () => window.clearTimeout(timer)
  }, [start])

  useLayoutEffect(() => {
    if (!step) return
    const element = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
    if (!element) return
    element.scrollIntoView?.({ block: 'nearest' })
    const measure = () => {
      const rect = element.getBoundingClientRect()
      setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
    }
    measure()
    cardRef.current?.focus()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [step])

  useEffect(() => {
    if (!step) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, finish])

  if (!step || !box) return null

  const pad = 6
  const cardWidth = Math.min(340, window.innerWidth - 32)
  const below = box.top + box.height + 16 + 180 < window.innerHeight
  const cardTop = below ? box.top + box.height + 14 : Math.max(16, box.top - 14 - 200)
  const toRight = box.left + box.width + cardWidth + 24 < window.innerWidth && box.height > 160
  const cardLeft = toRight
    ? box.left + box.width + 16
    : Math.min(Math.max(16, box.left), window.innerWidth - cardWidth - 16)
  const last = index === steps.length - 1

  // Portal: a sticky, blurred header or an animated page would trap a fixed overlay.
  return createPortal(
    <div className="fixed inset-0 z-[60]" aria-live="polite">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute rounded-2xl ring-4 ring-teal-500/70 transition-all duration-200"
        style={{
          top: box.top - pad,
          left: box.left - pad,
          width: box.width + pad * 2,
          height: box.height + pad * 2,
          boxShadow: '0 0 0 9999px rgb(14 44 75 / 0.55)',
        }}
      />
      <div
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tur-judul"
        tabIndex={-1}
        className="absolute animate-pop-in rounded-2xl bg-surface p-5 shadow-lg outline-none"
        style={{
          width: cardWidth,
          top: toRight ? Math.max(16, box.top) : cardTop,
          left: cardLeft,
        }}
      >
        <p className="text-xs font-semibold tracking-wider text-teal-700 uppercase">
          {t('tour.counter', { n: index + 1, total: steps.length })}
        </p>
        <h2 id="tur-judul" className="mt-1 text-lg font-bold text-brand-800">
          {t(`tour.steps.${step.key}.title`)}
        </h2>
        <p className="mt-1 text-ink">{t(`tour.steps.${step.key}.body`)}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={finish}
            className="min-h-10 rounded-lg px-3 text-sm font-semibold text-ink-muted hover:bg-neutral-soft"
          >
            {t('tour.skip')}
          </button>
          <div className="flex gap-2">
            {index > 0 && (
              <button
                type="button"
                onClick={() => setIndex(index - 1)}
                className="min-h-10 rounded-lg border border-line-strong px-3 text-sm font-semibold hover:bg-brand-50"
              >
                {t('tour.back')}
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : setIndex(index + 1))}
              className="min-h-10 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
            >
              {last ? t('tour.done') : t('tour.next')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
