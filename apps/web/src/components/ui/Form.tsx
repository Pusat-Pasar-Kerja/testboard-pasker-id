import { CircleAlert } from 'lucide-react'
import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { useTranslation } from 'react-i18next'

const CONTROL =
  'w-full rounded-lg border bg-surface px-3 text-sm text-ink placeholder:text-ink-muted/70 focus:border-brand-500 disabled:bg-neutral-soft'

interface FieldProps {
  label: string
  error?: string
  hint?: ReactNode
  required?: boolean
  className?: string
}

/** Label + control + hint + error, wired with aria-describedby / aria-invalid. */
function Field({
  label,
  error,
  hint,
  required,
  className = '',
  children,
}: FieldProps & { children: (ids: { id: string; describedBy?: string }) => ReactNode }) {
  const { t } = useTranslation()
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">
        {label}
        {required ? (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        ) : (
          <span className="font-normal text-ink-muted"> ({t('form.optional')})</span>
        )}
      </label>
      {children({ id, describedBy })}
      {hint && (
        <p id={hintId} className="mt-1 text-xs text-ink-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="mt-1 flex items-center gap-1 text-xs font-medium text-danger">
          <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

export function TextField({
  label,
  error,
  hint,
  required,
  className,
  ...input
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy }) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          className={`${CONTROL} min-h-11 ${error ? 'border-danger' : 'border-line-strong'}`}
          {...input}
        />
      )}
    </Field>
  )
}

export function TextArea({
  label,
  error,
  hint,
  required,
  className,
  ...input
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy }) => (
        <textarea
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          aria-required={required || undefined}
          rows={4}
          className={`${CONTROL} py-2 leading-relaxed ${error ? 'border-danger' : 'border-line-strong'}`}
          {...input}
        />
      )}
    </Field>
  )
}

export function SelectField({
  label,
  error,
  hint,
  required,
  className,
  options,
  ...select
}: FieldProps &
  SelectHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {({ id, describedBy }) => (
        <select
          id={id}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className={`${CONTROL} min-h-11 ${error ? 'border-danger' : 'border-line-strong'}`}
          {...select}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  )
}

/** Announces a form-level error (conflict, network, permission) above the actions. */
export function FormAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <p
      role="alert"
      className="flex animate-fade-in items-start gap-2 rounded-lg bg-danger-soft p-3 text-sm text-danger"
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  )
}
