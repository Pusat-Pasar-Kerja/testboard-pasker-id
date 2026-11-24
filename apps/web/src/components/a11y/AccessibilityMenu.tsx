import { CirclePersonArmsSpread, RotateCcw, X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { HEADER_ICON } from '../../layout/header-styles'
import { TEXT_SIZES, THEMES, useA11y, type A11ySettings, type Theme } from '../../lib/a11y'
import { LanguageChoice } from './LanguageChoice'

/** Small picture of each theme so the choice can be made without reading. */
const THEME_SWATCH: Record<Theme, { bg: string; bar: string; text: string }> = {
  light: { bg: '#f2f7ff', bar: '#1f6cbc', text: '#1d2939' },
  dark: { bg: '#0b1624', bar: '#3f86d2', text: '#e6edf6' },
  contrast: { bg: '#ffffff', bar: '#000000', text: '#000000' },
  system: {
    bg: 'linear-gradient(135deg, #f2f7ff 50%, #0b1624 50%)',
    bar: '#3f86d2',
    text: '#556273',
  },
}

type Toggle = 'spacing' | 'readable' | 'underline' | 'reduceMotion'
const TOGGLES: Toggle[] = ['spacing', 'readable', 'underline', 'reduceMotion']

function Switch({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean
  onChange: (value: boolean) => void
  label: string
  hint: string
}) {
  const id = useId()
  return (
    <label
      htmlFor={id}
      className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-xl border border-line px-4 py-3 hover:bg-neutral-soft"
    >
      <span>
        <span className="block font-semibold text-ink">{label}</span>
        <span className="block text-sm text-ink-muted">{hint}</span>
      </span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span
        aria-hidden="true"
        className="relative inline-flex h-8 w-14 shrink-0 rounded-full bg-line-strong transition-colors peer-checked:bg-brand-700 peer-focus-visible:ring-4 peer-focus-visible:ring-brand-300 after:absolute after:top-1 after:left-1 after:size-6 after:rounded-full after:bg-surface after:shadow after:transition-transform peer-checked:after:translate-x-6"
      />
    </label>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">{title}</h3>
      {children}
    </section>
  )
}

/**
 * "Aksesibilitas" in the top bar (owner, 2026-11-24): one place for the language, text size,
 * theme (light, dark, high contrast, follow the device), spacing, readable letters,
 * underlined links and less motion. Changes apply at once and stay on this device.
 */
export function AccessibilityMenu() {
  const { t } = useTranslation()
  const { settings, update, reset, changed } = useA11y()
  const [open, setOpen] = useState(false)
  const closeRef = useRef<HTMLButtonElement>(null)
  const titleId = useId()

  useEffect(() => {
    if (!open) return
    closeRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const setToggle = (key: Toggle, value: boolean) =>
    update({ [key]: value } as Partial<A11ySettings>)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-label={t('a11y.button')}
        data-tip={t('a11y.button')}
        data-tour="a11y"
        className={`inline-flex ${HEADER_ICON}`}
      >
        {/* The universal access symbol (a person in a circle), not a wheelchair (owner). */}
        <CirclePersonArmsSpread aria-hidden="true" className="size-5" />
      </button>
      {open &&
        createPortal(
          <div className="fixed inset-0 z-50 flex justify-end">
            <button
              type="button"
              aria-label={t('a11y.close')}
              onClick={() => setOpen(false)}
              className="absolute inset-0 animate-fade-in bg-brand-900/40"
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
              className="relative flex h-full w-full max-w-md animate-drawer-in flex-col overflow-y-auto bg-surface text-ink shadow-lg"
            >
              <div className="flex items-start justify-between gap-3 border-b border-line bg-gradient-to-br from-brand-50 to-teal-50 p-5">
                <div>
                  <h2 id={titleId} className="text-xl font-bold text-brand-800">
                    {t('a11y.title')}
                  </h2>
                  <p className="mt-1 text-sm text-ink-muted">{t('a11y.subtitle')}</p>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-surface/70"
                >
                  <X aria-hidden="true" className="size-5" />
                  <span className="sr-only">{t('a11y.close')}</span>
                </button>
              </div>

              <div className="flex-1 space-y-6 p-5">
                <Group title={t('language.title')}>
                  <LanguageChoice />
                </Group>

                <Group title={t('a11y.size.title')}>
                  <div
                    role="radiogroup"
                    aria-label={t('a11y.size.title')}
                    className="grid grid-cols-5 gap-2"
                  >
                    {TEXT_SIZES.map((scale, index) => {
                      const active = settings.size === index
                      return (
                        <button
                          key={scale}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          aria-label={t(`a11y.size.levels.${index as 0 | 1 | 2 | 3 | 4}`)}
                          onClick={() => update({ size: index })}
                          className={`flex min-h-16 flex-col items-center justify-center gap-1 rounded-xl border-2 font-bold ${
                            active
                              ? 'border-brand-700 bg-brand-50 text-brand-800'
                              : 'border-line text-ink hover:bg-neutral-soft'
                          }`}
                        >
                          <span aria-hidden="true" style={{ fontSize: `${0.8 + index * 0.22}rem` }}>
                            Aa
                          </span>
                          <span
                            aria-hidden="true"
                            className="text-[0.7rem] font-semibold text-ink-muted"
                          >
                            {Math.round(scale * 100)}%
                          </span>
                        </button>
                      )
                    })}
                  </div>
                </Group>

                <Group title={t('a11y.theme.title')}>
                  <div
                    role="radiogroup"
                    aria-label={t('a11y.theme.title')}
                    className="grid grid-cols-2 gap-2"
                  >
                    {THEMES.map((theme) => {
                      const active = settings.theme === theme
                      const swatch = THEME_SWATCH[theme]
                      return (
                        <button
                          key={theme}
                          type="button"
                          role="radio"
                          aria-checked={active}
                          onClick={() => update({ theme })}
                          className={`flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2 text-left ${
                            active
                              ? 'border-brand-700 bg-brand-50'
                              : 'border-line hover:bg-neutral-soft'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className="flex size-10 shrink-0 flex-col justify-end gap-1 overflow-hidden rounded-lg border border-line-strong p-1.5"
                            style={{ background: swatch.bg }}
                          >
                            <span
                              className="h-1.5 w-full rounded-full"
                              style={{ background: swatch.bar }}
                            />
                            <span
                              className="h-1 w-2/3 rounded-full"
                              style={{ background: swatch.text }}
                            />
                          </span>
                          <span className="font-semibold text-ink">{t(`a11y.theme.${theme}`)}</span>
                        </button>
                      )
                    })}
                  </div>
                </Group>

                <Group title={t('a11y.reading.title')}>
                  <div className="space-y-2">
                    {TOGGLES.map((key) => (
                      <Switch
                        key={key}
                        checked={settings[key]}
                        onChange={(value) => setToggle(key, value)}
                        label={t(`a11y.reading.${key}.label`)}
                        hint={t(`a11y.reading.${key}.hint`)}
                      />
                    ))}
                  </div>
                </Group>
              </div>

              <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-2 border-t border-line bg-surface p-4">
                <button
                  type="button"
                  onClick={reset}
                  disabled={!changed}
                  className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-line-strong px-4 font-semibold hover:bg-neutral-soft disabled:opacity-50"
                >
                  <RotateCcw aria-hidden="true" className="size-4" />
                  {t('a11y.reset')}
                </button>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex min-h-11 items-center rounded-lg bg-brand-700 px-5 font-semibold text-white hover:bg-brand-800"
                >
                  {t('a11y.done')}
                </button>
              </div>
            </aside>
          </div>,
          document.body,
        )}
    </>
  )
}
