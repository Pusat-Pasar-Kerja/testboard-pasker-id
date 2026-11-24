import {
  CalendarRange,
  ChartColumn,
  Check,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Bug,
  ListChecks,
  PlayCircle,
  Presentation,
  Sparkles,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import { projectPath } from '../../hooks/route-state'

export interface StartHereFacts {
  cycles: number
  cases: number
  runs: number
  executed: number
  openBugs: number
}

type StepKey = 'cycle' | 'cases' | 'plan' | 'test' | 'review' | 'report'
interface Step {
  key: StepKey
  icon: LucideIcon
  path: string
  /** Second, smaller way to do the step (e.g. import instead of typing). */
  alt?: {
    label: 'startHere.steps.cases.alt' | 'startHere.steps.plan.alt'
    path: string
    icon: LucideIcon
  }
  done?: (facts: StartHereFacts) => boolean
}

/** The work in order (owner, 2026-11-24: "tidak tahu harus mulai dari mana"). */
const STEPS: Step[] = [
  { key: 'cycle', icon: CalendarRange, path: 'fase?baru=1', done: (f) => f.cycles > 0 },
  {
    key: 'cases',
    icon: ListChecks,
    path: 'fase',
    alt: { label: 'startHere.steps.cases.alt', path: 'imports', icon: ClipboardCheck },
    done: (f) => f.cases > 0,
  },
  {
    key: 'plan',
    icon: PlayCircle,
    path: 'uat/baru',
    alt: { label: 'startHere.steps.plan.alt', path: 'uat', icon: Presentation },
    done: (f) => f.runs > 0,
  },
  { key: 'test', icon: Sparkles, path: 'uat', done: (f) => f.executed > 0 },
  { key: 'review', icon: Bug, path: 'bugs' },
  { key: 'report', icon: ChartColumn, path: 'reports' },
]

const STORAGE = (code: string) => `tb-start-here-${code}`

function readHidden(code: string): boolean | null {
  try {
    const value = localStorage.getItem(STORAGE(code))
    return value === null ? null : value === 'hidden'
  } catch {
    return null
  }
}

/**
 * "Mulai di sini" on the project home for Admins: six steps from an empty project to a
 * report, each with a button, ticked off from the project's own data.
 */
export function StartHere({ code, facts }: { code: string; facts: StartHereFacts }) {
  const { t } = useTranslation()
  const doneCount = STEPS.filter((step) => step.done?.(facts)).length
  const firstOpen = STEPS.findIndex((step) => step.done && !step.done(facts))
  const allSet = STEPS.every((step) => !step.done || step.done(facts))
  const [hidden, setHidden] = useState(() => readHidden(code) ?? allSet)
  const toggle = () => {
    const next = !hidden
    setHidden(next)
    try {
      localStorage.setItem(STORAGE(code), next ? 'hidden' : 'shown')
    } catch {
      // private mode: remembered for this view only
    }
  }

  return (
    <section
      aria-labelledby="mulai-di-sini"
      className="rounded-3xl card-pasker p-5 sm:p-6"
      data-tour="start-here"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="mulai-di-sini" className="heading-bar text-xl font-bold text-brand-800">
            {t('startHere.title')}
          </h2>
          <p className="mt-1 text-sm text-ink-muted">
            {t('startHere.subtitle', { done: doneCount, total: 4 })}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!hidden}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
        >
          {hidden ? (
            <ChevronDown aria-hidden="true" className="size-4" />
          ) : (
            <ChevronUp aria-hidden="true" className="size-4" />
          )}
          {hidden ? t('startHere.show') : t('startHere.hide')}
        </button>
      </div>
      {!hidden && (
        <ol className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {STEPS.map((step, index) => {
            const done = step.done?.(facts) ?? false
            const current = index === firstOpen
            return (
              <li
                key={step.key}
                className={`flex flex-col gap-3 rounded-2xl border p-4 ${
                  current
                    ? 'border-brand-300 bg-brand-50 shadow-xs'
                    : done
                      ? 'border-success/25 bg-success-soft/40'
                      : 'border-line bg-surface'
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${
                      done ? 'bg-success text-white' : 'chip-gradient'
                    }`}
                  >
                    {done ? <Check aria-hidden="true" className="size-5" /> : index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {t(`startHere.steps.${step.key}.title`)}
                      {done && <span className="sr-only"> ({t('startHere.done')})</span>}
                    </p>
                    <p className="mt-0.5 text-sm text-ink-muted">
                      {step.key === 'review'
                        ? t('startHere.steps.review.body', { count: facts.openBugs })
                        : t(`startHere.steps.${step.key}.body`)}
                    </p>
                  </div>
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link
                    to={projectPath(code, step.path)}
                    className={`inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold ${
                      current
                        ? 'bg-brand-700 text-white hover:bg-brand-800'
                        : 'border border-line-strong bg-surface text-ink hover:bg-brand-50'
                    }`}
                  >
                    <step.icon aria-hidden="true" className="size-4" />
                    {t(`startHere.steps.${step.key}.action`)}
                  </Link>
                  {step.alt && (
                    <Link
                      to={projectPath(code, step.alt.path)}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
                    >
                      <step.alt.icon aria-hidden="true" className="size-4" />
                      {t(step.alt.label)}
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}
    </section>
  )
}

/** For a Pengguna (ADR 0019): where their UATs are and how to report, in one card. */
export function TaskIntro({ code }: { code: string }) {
  const { t } = useTranslation()
  type LinkKey = 'myUat' | 'reportBug' | 'bugs'
  const links: { to: string; key: LinkKey; icon: LucideIcon }[] = [
    { to: projectPath(code, 'uat'), key: 'myUat', icon: ClipboardCheck },
    { to: projectPath(code, 'bugs/new'), key: 'reportBug', icon: Bug },
    { to: projectPath(code, 'bugs'), key: 'bugs', icon: ChartColumn },
  ]
  return (
    <section className="rounded-3xl card-pasker p-5 sm:p-6">
      <h2 className="heading-bar text-xl font-bold text-brand-800">
        {t('startHere.task.TESTER.title')}
      </h2>
      <p className="mt-1 max-w-3xl text-ink-muted">{t('startHere.task.TESTER.body')}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        {links.map((link, index) => (
          <Link
            key={link.key}
            to={link.to}
            className={`inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm font-semibold ${
              index === 0
                ? 'bg-brand-700 text-white hover:bg-brand-800'
                : 'border border-line-strong bg-surface hover:bg-brand-50'
            }`}
          >
            <link.icon aria-hidden="true" className="size-4" />
            {t(`startHere.links.${link.key}`)}
          </Link>
        ))}
      </div>
    </section>
  )
}
