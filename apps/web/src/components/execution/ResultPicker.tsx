import { RECORDABLE_RESULTS, STEP_RESULTS, type RecordableResult } from '@testboard/shared'
import { Ban, Circle, CircleCheck, CircleX, SkipForward, type LucideIcon } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

export type StepResult = (typeof STEP_RESULTS)[number]

/** Same icon + colour language as the status badges; colour is never the only signal. */
const STYLE: Record<StepResult, { icon: LucideIcon; checked: string }> = {
  PASSED: {
    icon: CircleCheck,
    checked: 'peer-checked:border-success peer-checked:bg-success-soft peer-checked:text-success',
  },
  FAILED: {
    icon: CircleX,
    checked: 'peer-checked:border-danger peer-checked:bg-danger-soft peer-checked:text-danger',
  },
  BLOCKED: {
    icon: Ban,
    checked: 'peer-checked:border-warning peer-checked:bg-warning-soft peer-checked:text-warning',
  },
  SKIPPED: {
    icon: SkipForward,
    checked: 'peer-checked:border-neutral peer-checked:bg-neutral-soft peer-checked:text-ink',
  },
  NOT_RUN: {
    icon: Circle,
    checked: 'peer-checked:border-line-strong peer-checked:bg-neutral-soft peer-checked:text-ink',
  },
}

const OPTION =
  'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line-strong bg-surface text-sm font-semibold text-ink-muted transition-colors duration-200 ease-soft hover:border-brand-300 hover:text-ink peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-1 peer-disabled:cursor-not-allowed peer-disabled:opacity-50'

/** Overall result of an attempt: four large, thumb-sized choices. */
export function ResultPicker({
  value,
  onChange,
  error,
  disabled = false,
}: {
  value: RecordableResult | ''
  onChange: (value: RecordableResult) => void
  error?: string
  disabled?: boolean
}) {
  const { t } = useTranslation()
  const name = useId()
  const errorId = `${name}-error`
  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 text-sm font-medium">
        {t('pages.execution.resultLabel')}
        <span className="text-danger" aria-hidden="true">
          {' '}
          *
        </span>
      </legend>
      <div className="grid grid-cols-2 gap-2">
        {RECORDABLE_RESULTS.map((result) => {
          const { icon: Icon, checked } = STYLE[result]
          return (
            <label key={result} className="block">
              <input
                type="radio"
                name={name}
                value={result}
                checked={value === result}
                disabled={disabled}
                onChange={() => onChange(result)}
                className="peer sr-only"
              />
              <span className={`${OPTION} min-h-14 px-3 ${checked}`}>
                <Icon aria-hidden="true" className="size-5" />
                {t(`codes.execution.${result}`)}
              </span>
            </label>
          )
        })}
      </div>
      {error && (
        <p id={errorId} className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}

/** Per-step outcome: compact segmented control, icon-only on phones. */
export function StepResultPicker({
  stepNumber,
  value,
  onChange,
}: {
  stepNumber: number
  value: StepResult
  onChange: (value: StepResult) => void
}) {
  const { t } = useTranslation()
  const name = useId()
  return (
    <fieldset className="mt-2">
      <legend className="sr-only">{t('pages.execution.stepResult', { n: stepNumber })}</legend>
      <div className="flex flex-wrap gap-1.5">
        {STEP_RESULTS.map((result) => {
          const { icon: Icon, checked } = STYLE[result]
          return (
            <label key={result} className="block" title={t(`codes.execution.${result}`)}>
              <input
                type="radio"
                name={name}
                value={result}
                checked={value === result}
                onChange={() => onChange(result)}
                className="peer sr-only"
              />
              <span className={`${OPTION} min-h-11 min-w-11 px-2.5 text-xs ${checked}`}>
                <Icon aria-hidden="true" className="size-4" />
                <span className="sr-only 2xl:not-sr-only">{t(`codes.execution.${result}`)}</span>
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
