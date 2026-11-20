import type { FileDto } from '@testboard/shared'
import type { TFunction } from 'i18next'
import { formatBytes, savedPercent } from '../../lib/format'
import type { Locale } from '@testboard/shared'

/**
 * One line describing what the pipeline did: "2,4 MB -> 0,9 MB · saved 62% · lossless WebP".
 * Shown so users can see compression happened and why a file did not get smaller.
 */
export function fileFacts(t: TFunction, locale: Locale, file: FileDto): string {
  const parts: string[] = []
  const original = formatBytes(file.original_size_bytes, locale)
  if (file.stored_size_bytes !== null && file.stored_size_bytes !== file.original_size_bytes) {
    parts.push(`${original} → ${formatBytes(file.stored_size_bytes, locale)}`)
  } else {
    parts.push(original)
  }
  const saved = savedPercent(file.original_size_bytes, file.stored_size_bytes)
  if (saved !== null) parts.push(t('evidence.saving', { percent: saved }))
  if (file.compression_method && file.compression_method !== 'NONE') {
    parts.push(t(`evidence.method.${file.compression_method}`, file.compression_method))
  }
  for (const note of (file.compression_note ?? '').split(',').filter(Boolean)) {
    parts.push(t(`evidence.note.${note}`, note))
  }
  return parts.join(' · ')
}
