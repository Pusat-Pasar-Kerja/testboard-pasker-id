import { EVIDENCE_ACCEPT, type TestCaseStepDto } from '@testboard/shared'
import {
  CircleAlert,
  CircleCheck,
  FileText,
  LoaderCircle,
  RotateCcw,
  ScrollText,
  UploadCloud,
  X,
} from 'lucide-react'
import { useEffect, useId, useState, type DragEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { formatBytes, toLocale } from '../../lib/format'
import { fileFacts } from './file-facts'
import { namePasted, type EvidenceUploads, type UploadItem } from './use-evidence-uploads'

/** Uploaders currently listening for clipboard paste, most recent last. */
const pasteOwners: symbol[] = []

const INPUT =
  'min-h-9 w-full rounded-lg border border-line-strong bg-surface px-2 text-sm text-ink focus:border-brand-500'

function ItemIcon({ item }: { item: UploadItem }) {
  // A rejected or undecodable "image" falls back to the generic icon (no broken image).
  const [broken, setBroken] = useState(false)
  const bad = item.phase === 'rejected' || item.phase === 'failed'
  if (item.previewUrl && !broken && !bad) {
    return (
      <img
        src={item.previewUrl}
        alt=""
        onError={() => setBroken(true)}
        className="size-full object-cover"
      />
    )
  }
  const Icon = /\.(txt|log|csv|json|har)$/i.test(item.name) ? ScrollText : FileText
  return <Icon aria-hidden="true" className="size-6 text-ink-muted" />
}

function UploadRow({
  item,
  uploads,
  steps,
  disabled,
}: {
  item: UploadItem
  uploads: EvidenceUploads
  steps?: TestCaseStepDto[]
  disabled: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const bad = item.phase === 'rejected' || item.phase === 'failed' || item.phase === 'error'
  const status =
    item.phase === 'uploading'
      ? t('evidence.status.uploading', { percent: Math.round(item.progress * 100) })
      : item.phase === 'processing'
        ? t('evidence.status.processing')
        : item.phase === 'ready' && item.dto
          ? fileFacts(t, locale, item.dto)
          : item.phase === 'error'
            ? t('evidence.status.error')
            : `${t(`evidence.status.${item.phase}`)}: ${t(`evidence.reason.${item.reason ?? 'PROCESSING_ERROR'}`)}`

  return (
    <li
      className={`flex animate-fade-in gap-3 rounded-lg border p-2.5 ${
        bad ? 'border-danger/30 bg-danger-soft/40' : 'border-line bg-surface'
      }`}
    >
      <span className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-soft">
        <ItemIcon item={item} />
      </span>
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium" title={item.name}>
            {item.name}
          </p>
          {item.phase === 'error' && (
            <button
              type="button"
              onClick={() => uploads.retry(item.key)}
              className="inline-flex size-8 items-center justify-center rounded-md text-brand-700 hover:bg-brand-50"
              title={t('evidence.retry', { name: item.name })}
            >
              <RotateCcw aria-hidden="true" className="size-4" />
              <span className="sr-only">{t('evidence.retry', { name: item.name })}</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => uploads.remove(item.key)}
            disabled={disabled}
            className="inline-flex size-8 items-center justify-center rounded-md text-ink-muted hover:bg-neutral-soft hover:text-danger disabled:opacity-50"
            title={t('evidence.remove', { name: item.name })}
          >
            <X aria-hidden="true" className="size-4" />
            <span className="sr-only">{t('evidence.remove', { name: item.name })}</span>
          </button>
        </div>
        <p
          className={`flex items-center gap-1.5 text-xs ${bad ? 'font-medium text-danger' : 'text-ink-muted'}`}
        >
          {item.phase === 'ready' ? (
            <CircleCheck aria-hidden="true" className="size-3.5 shrink-0 text-success" />
          ) : bad ? (
            <CircleAlert aria-hidden="true" className="size-3.5 shrink-0" />
          ) : (
            <LoaderCircle aria-hidden="true" className="size-3.5 shrink-0 animate-spin" />
          )}
          <span>
            {item.phase === 'uploading' || item.phase === 'processing'
              ? `${formatBytes(item.size, locale)} · ${status}`
              : status}
          </span>
        </p>
        {item.phase === 'uploading' && (
          <div className="h-1 overflow-hidden rounded-full bg-neutral-soft" aria-hidden="true">
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-soft"
              style={{ width: `${Math.round(item.progress * 100)}%` }}
            />
          </div>
        )}
        {!bad && (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={INPUT}
              value={item.caption}
              maxLength={500}
              disabled={disabled}
              onChange={(e) => uploads.setCaption(item.key, e.target.value)}
              placeholder={t('evidence.captionPlaceholder')}
              aria-label={t('evidence.caption', { name: item.name })}
            />
            {steps && steps.length > 0 && (
              <select
                className={`${INPUT} sm:w-40`}
                value={item.stepNumber ?? ''}
                disabled={disabled}
                onChange={(e) =>
                  uploads.setStep(item.key, e.target.value ? Number(e.target.value) : null)
                }
                aria-label={t('evidence.step', { name: item.name })}
              >
                <option value="">{t('evidence.noStep')}</option>
                {steps.map((step) => (
                  <option key={step.step_number} value={step.step_number}>
                    {t('evidence.stepOption', { n: step.step_number })}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * Multi-file evidence picker (doc 07 UI uploader): choose, drag and drop, or paste a
 * screenshot from the clipboard. Files are checked by the server before they can be used.
 */
export function EvidenceUploader({
  uploads,
  steps,
  disabled = false,
  label,
}: {
  uploads: EvidenceUploads
  steps?: TestCaseStepDto[]
  disabled?: boolean
  label?: string
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const [dragging, setDragging] = useState(false)
  const { add } = uploads

  // Paste anywhere on the page while this uploader is shown (text paste is untouched).
  // With several uploaders open, the most recently opened one receives the paste.
  useEffect(() => {
    if (disabled) return
    const token = Symbol('uploader')
    pasteOwners.push(token)
    const onPaste = (event: ClipboardEvent) => {
      if (pasteOwners.at(-1) !== token) return
      const pasted = Array.from(event.clipboardData?.files ?? [])
      if (pasted.length === 0) return
      event.preventDefault()
      add(pasted.map(namePasted))
    }
    document.addEventListener('paste', onPaste)
    return () => {
      document.removeEventListener('paste', onPaste)
      pasteOwners.splice(pasteOwners.indexOf(token), 1)
    }
  }, [add, disabled])

  const onDrop = (event: DragEvent) => {
    event.preventDefault()
    setDragging(false)
    if (disabled) return
    const dropped = Array.from(event.dataTransfer.files)
    if (dropped.length > 0) add(dropped)
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div
        onDragOver={(event) => {
          event.preventDefault()
          if (!disabled) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed px-4 py-5 text-center transition-colors duration-200 ease-soft ${
          dragging ? 'border-brand-500 bg-brand-50' : 'border-line-strong bg-canvas'
        } ${disabled ? 'opacity-60' : ''}`}
      >
        <UploadCloud aria-hidden="true" className="size-7 text-brand-600" />
        <p className="text-sm text-ink-muted">{t('evidence.dropTitle')}</p>
        <label
          htmlFor={inputId}
          className={`inline-flex min-h-10 cursor-pointer items-center rounded-lg border border-line-strong bg-surface px-4 text-sm font-semibold hover:bg-neutral-soft ${
            disabled ? 'pointer-events-none' : ''
          }`}
        >
          {t('evidence.choose')}
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          accept={EVIDENCE_ACCEPT}
          disabled={disabled}
          className="sr-only"
          onChange={(event) => {
            const chosen = Array.from(event.target.files ?? [])
            if (chosen.length > 0) add(chosen)
            event.target.value = ''
          }}
        />
        <p className="text-xs text-ink-muted">{t('evidence.rules')}</p>
      </div>
      {uploads.items.length > 0 && (
        <ul className="space-y-2" aria-live="polite">
          {uploads.items.map((item) => (
            <UploadRow
              key={item.key}
              item={item}
              uploads={uploads}
              steps={steps}
              disabled={disabled}
            />
          ))}
        </ul>
      )}
    </div>
  )
}
