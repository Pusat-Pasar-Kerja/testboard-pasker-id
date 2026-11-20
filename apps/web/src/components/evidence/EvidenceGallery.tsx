import type { AttachedFileDto } from '@testboard/shared'
import { Download, ExternalLink, FileText, ScrollText, ShieldCheck, Unlink } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toLocale } from '../../lib/format'
import { useDataSource } from '../../services/use-data-source'
import { fileFacts } from './file-facts'
import { Lightbox } from './Lightbox'

/**
 * Attached evidence: screenshot thumbnails open a lightbox, documents and logs open in a
 * new tab (PDF, logs as plain text) or download. Every URL goes through the API's
 * permission check; nothing is a public link.
 */
export function EvidenceGallery({
  projectCode,
  files,
  onDetach,
  canDetach,
  compact = false,
}: {
  projectCode: string
  files: AttachedFileDto[]
  onDetach?: (file: AttachedFileDto) => void
  canDetach?: (file: AttachedFileDto) => boolean
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = toLocale(i18n.resolvedLanguage)
  const ds = useDataSource()
  const [open, setOpen] = useState<number | null>(null)
  if (files.length === 0) return null

  const screenshots = files.filter((f) => f.evidence_type === 'SCREENSHOT')
  const others = files.filter((f) => f.evidence_type !== 'SCREENSHOT')
  const url = (file: AttachedFileDto, kind: 'preview' | 'thumbnail' | 'download') =>
    ds.fileUrl(projectCode, file.id, kind)
  const detachButton = (file: AttachedFileDto) =>
    onDetach && (canDetach?.(file) ?? true) ? (
      <button
        type="button"
        onClick={() => onDetach(file)}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-ink-muted hover:bg-neutral-soft hover:text-danger"
        title={t('evidence.detach', { name: file.original_filename })}
      >
        <Unlink aria-hidden="true" className="size-4" />
        <span className="sr-only">{t('evidence.detach', { name: file.original_filename })}</span>
      </button>
    ) : null

  return (
    <div className="space-y-3">
      {screenshots.length > 0 && (
        <ul
          className={`grid gap-2 ${compact ? 'grid-cols-3 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}
        >
          {screenshots.map((file, index) => (
            <li key={file.id} className="min-w-0">
              <div className="group relative overflow-hidden rounded-lg border border-line bg-neutral-soft">
                <button
                  type="button"
                  onClick={() => setOpen(index)}
                  aria-label={t('evidence.preview', { name: file.original_filename })}
                  className="block aspect-video w-full"
                  title={fileFacts(t, locale, file)}
                >
                  <img
                    src={url(file, file.has_thumbnail ? 'thumbnail' : 'preview')}
                    alt=""
                    loading="lazy"
                    className="size-full object-cover transition-transform duration-300 ease-soft group-hover:scale-[1.03]"
                  />
                  <span className="sr-only">
                    {t('evidence.preview', { name: file.original_filename })}
                  </span>
                </button>
                {file.step_number !== null && (
                  <span className="absolute top-1.5 left-1.5 rounded-full bg-surface/90 px-1.5 text-[11px] font-semibold text-brand-800">
                    {t('evidence.stepBadge', { n: file.step_number })}
                  </span>
                )}
                {detachButton(file) && (
                  <span className="absolute top-1 right-1 rounded-md bg-surface/90">
                    {detachButton(file)}
                  </span>
                )}
              </div>
              {!compact && (
                <p className="mt-1 truncate text-xs" title={file.caption ?? file.original_filename}>
                  {file.caption ?? file.original_filename}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <ul className="space-y-2">
          {others.map((file) => {
            const Icon = file.evidence_type === 'LOG' ? ScrollText : FileText
            const viewable = file.evidence_type === 'LOG' || file.stored_mime === 'application/pdf'
            return (
              <li
                key={file.id}
                className="flex items-center gap-3 rounded-lg border border-line p-2.5 text-sm"
              >
                <Icon aria-hidden="true" className="size-5 shrink-0 text-ink-muted" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium" title={file.original_filename}>
                    {file.caption ?? file.original_filename}
                  </span>
                  <span className="block truncate text-xs text-ink-muted">
                    {file.caption ? `${file.original_filename} · ` : ''}
                    {fileFacts(t, locale, file)}
                  </span>
                </span>
                {viewable && (
                  <a
                    href={url(file, 'preview')}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex size-9 items-center justify-center rounded-md text-brand-700 hover:bg-brand-50"
                    title={t('evidence.open')}
                  >
                    <ExternalLink aria-hidden="true" className="size-4" />
                    <span className="sr-only">
                      {t('evidence.open')} {file.original_filename}
                    </span>
                  </a>
                )}
                <a
                  href={url(file, 'download')}
                  className="inline-flex size-9 items-center justify-center rounded-md text-brand-700 hover:bg-brand-50"
                  title={t('evidence.download')}
                >
                  <Download aria-hidden="true" className="size-4" />
                  <span className="sr-only">
                    {t('evidence.download')} {file.original_filename}
                  </span>
                </a>
                {detachButton(file)}
              </li>
            )
          })}
        </ul>
      )}
      {!compact && files[0]?.scan_engine && (
        <p className="flex items-center gap-1 text-xs text-ink-muted">
          <ShieldCheck aria-hidden="true" className="size-3.5" />
          {t(`evidence.scan.${files[0].scan_engine}`, files[0].scan_engine)}
        </p>
      )}
      {open !== null && (
        <Lightbox
          files={screenshots}
          index={open}
          urlOf={(file, kind) => url(file, kind)}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  )
}
