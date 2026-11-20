import type { AttachedFileDto } from '@testboard/shared'
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react'
import { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { useFocusTrap } from '../../hooks/use-focus-trap'

/** Full-size screenshot viewer: authorized preview URL, arrows/Esc, focus kept inside. */
export function Lightbox({
  files,
  index,
  urlOf,
  onIndex,
  onClose,
}: {
  files: AttachedFileDto[]
  index: number
  urlOf: (file: AttachedFileDto, kind: 'preview' | 'download') => string
  onIndex: (index: number) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const file = files[index]
  useFocusTrap(Boolean(file), ref, onClose, '[data-autofocus]')
  if (!file) return null
  const go = (delta: number) => onIndex((index + delta + files.length) % files.length)

  return createPortal(
    <div className="fixed inset-0 z-50 flex animate-fade-in items-center justify-center bg-ink/80 p-3 sm:p-6">
      <div aria-hidden="true" className="absolute inset-0" onClick={onClose} />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={(event) => {
          if (files.length < 2) return
          if (event.key === 'ArrowRight') go(1)
          if (event.key === 'ArrowLeft') go(-1)
        }}
        className="relative flex max-h-full w-full max-w-6xl animate-pop-in flex-col overflow-hidden rounded-2xl bg-surface shadow-lg"
      >
        <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
          <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-semibold">
            {file.caption ?? file.original_filename}
          </h2>
          {files.length > 1 && (
            <span className="text-xs text-ink-muted tabular-nums">
              {t('evidence.counter', { n: index + 1, total: files.length })}
            </span>
          )}
          <a
            href={urlOf(file, 'download')}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
          >
            <Download aria-hidden="true" className="size-4" />
            {t('evidence.download')}
          </a>
          <button
            type="button"
            onClick={onClose}
            data-autofocus
            className="inline-flex size-10 items-center justify-center rounded-lg hover:bg-neutral-soft"
          >
            <X aria-hidden="true" className="size-5" />
            <span className="sr-only">{t('evidence.close')}</span>
          </button>
        </header>
        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-neutral-soft">
          <img
            key={file.id}
            src={urlOf(file, 'preview')}
            alt={file.caption ?? file.original_filename}
            className="max-h-[78vh] w-auto max-w-full animate-fade-in object-contain"
          />
          {files.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => go(-1)}
                className="absolute left-2 inline-flex size-11 items-center justify-center rounded-full bg-surface/90 shadow-sm hover:bg-surface"
              >
                <ChevronLeft aria-hidden="true" className="size-5" />
                <span className="sr-only">{t('evidence.prev')}</span>
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                className="absolute right-2 inline-flex size-11 items-center justify-center rounded-full bg-surface/90 shadow-sm hover:bg-surface"
              >
                <ChevronRight aria-hidden="true" className="size-5" />
                <span className="sr-only">{t('evidence.next')}</span>
              </button>
            </>
          )}
        </div>
        {file.caption && (
          <p className="border-t border-line px-4 py-2 text-xs text-ink-muted">
            {file.original_filename}
          </p>
        )}
      </div>
    </div>,
    document.body,
  )
}
