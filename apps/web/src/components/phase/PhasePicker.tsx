import { Folder, FolderInput } from 'lucide-react'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { usePhaseTree } from '../../hooks/structure-queries'

/** "none" stands for "Belum masuk Fase" in the pickers. */
export const NO_PHASE = 'none'

/**
 * Choose a target Fase as big radio cards (copy / move scenarios or feature folders). The
 * source Fase is left out; "Belum masuk Fase" only where it makes sense (moving out).
 */
export function PhasePicker({
  code,
  value,
  onChange,
  exclude,
  allowUnassigned,
  error,
}: {
  code: string
  value: string
  onChange: (value: string) => void
  /** The Fase things come from (a Fase id or NO_PHASE). */
  exclude?: string | null
  allowUnassigned: boolean
  error?: string
}) {
  const { t } = useTranslation()
  const name = useId()
  const tree = usePhaseTree(code)
  const options = [
    ...(tree.data?.phases ?? [])
      .filter((p) => p.id !== exclude)
      .map((p) => ({ value: p.id ?? '', label: p.title ?? '', code: p.cycle_code ?? '' })),
    ...(allowUnassigned && exclude !== NO_PHASE
      ? [{ value: NO_PHASE, label: t('phases.unassigned'), code: '' }]
      : []),
  ]
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{t('phases.transfer.target')}</legend>
      {tree.isSuccess && options.length === 0 ? (
        <p className="text-sm text-ink-muted">{t('phases.transfer.noTargets')}</p>
      ) : (
        <div className="grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2">
          {options.map((option) => (
            <label
              key={option.value}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-xl border p-3 ${
                option.value === value
                  ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-200'
                  : 'border-line hover:bg-neutral-soft'
              }`}
            >
              <input
                type="radio"
                name={name}
                className="size-5 accent-brand-700"
                checked={option.value === value}
                onChange={() => onChange(option.value)}
              />
              {option.value === NO_PHASE ? (
                <FolderInput aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
              ) : (
                <Folder aria-hidden="true" className="size-5 shrink-0 text-brand-600" />
              )}
              <span className="min-w-0">
                <span className="block font-semibold break-words">{option.label}</span>
                {option.code && <span className="block text-xs text-ink-muted">{option.code}</span>}
              </span>
            </label>
          ))}
        </div>
      )}
      {error && <p className="mt-2 text-sm font-medium text-danger">{error}</p>}
    </fieldset>
  )
}
