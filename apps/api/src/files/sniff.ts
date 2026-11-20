/**
 * Real file type from the bytes (magic numbers), never from the name or the browser's
 * Content-Type (doc 07 / OWASP File Upload). Unknown = rejected.
 */
export type SniffedKind = 'png' | 'jpeg' | 'webp' | 'pdf' | 'zip' | 'text' | 'unknown'

const startsWith = (bytes: Buffer, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length &&
  signature.every((value, index) => bytes[offset + index] === value)

export function sniff(head: Buffer): SniffedKind {
  if (startsWith(head, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png'
  if (startsWith(head, [0xff, 0xd8, 0xff])) return 'jpeg'
  if (startsWith(head, [0x52, 0x49, 0x46, 0x46]) && startsWith(head, [0x57, 0x45, 0x42, 0x50], 8))
    return 'webp'
  if (startsWith(head, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'
  if (startsWith(head, [0x50, 0x4b, 0x03, 0x04])) return 'zip'
  if (looksLikeText(head)) return 'text'
  return 'unknown'
}

/** UTF-8 (optionally with BOM), no NUL bytes, no other binary control characters. */
export function looksLikeText(bytes: Buffer): boolean {
  if (bytes.length === 0) return false
  for (const byte of bytes) {
    if (byte === 0) return false
    if (byte < 0x09 || (byte > 0x0d && byte < 0x20 && byte !== 0x1b)) return false
  }
  try {
    // A multi-byte character may be cut at the end of the sample; trim up to 3 bytes.
    new TextDecoder('utf-8', { fatal: true }).decode(trimPartialUtf8(bytes))
    return true
  } catch {
    return false
  }
}

function trimPartialUtf8(bytes: Buffer): Buffer {
  let end = bytes.length
  for (let i = 1; i <= 3 && end - i >= 0; i++) {
    const byte = bytes[end - i] as number
    if ((byte & 0xc0) === 0x80) continue // continuation byte
    if ((byte & 0xc0) === 0xc0) {
      const needed = byte >= 0xf0 ? 4 : byte >= 0xe0 ? 3 : 2
      if (i < needed) end -= i
    }
    break
  }
  return bytes.subarray(0, end)
}

/** Expected sniffed kind for an accepted extension. */
export const KIND_FOR_EXTENSION: Record<string, SniffedKind> = {
  png: 'png',
  jpg: 'jpeg',
  jpeg: 'jpeg',
  webp: 'webp',
  pdf: 'pdf',
  docx: 'zip',
  xlsx: 'zip',
  txt: 'text',
  log: 'text',
  csv: 'text',
  json: 'text',
  har: 'text',
}

export const MIME_FOR_EXTENSION: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  log: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  har: 'application/json',
}
