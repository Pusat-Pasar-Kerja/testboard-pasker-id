import type { FileFailureReason } from '@testboard/shared'
import sharp, { type Metadata } from 'sharp'
import { gzipSync } from 'node:zlib'
import { stripJpegMetadata, stripPngMetadata, stripWebpMetadata } from './metadata.js'
import { MIME_FOR_EXTENSION } from './sniff.js'
import { checkOfficePackage } from './zip.js'

/** Screenshots up to e.g. 1920 x 26000 px; larger is treated as a decompression bomb. */
const MAX_PIXELS = 50_000_000
/** A lossy JPEG re-encode is only worth it when clearly smaller. */
const JPEG_MIN_GAIN = 0.15

export type Processed =
  | { ok: false; reason: FileFailureReason }
  | {
      ok: true
      bytes: Buffer
      ext: string
      mime: string
      method: string
      notes: string[]
      width?: number
      height?: number
      thumbnail?: Buffer
    }

const reject = (reason: FileFailureReason): Processed => ({ ok: false, reason })

/**
 * Screenshots (doc 07): keep text legible. Lossless re-encodes are pixel-identical to the
 * decoded image; a lossy JPEG re-encode is high quality and only kept when clearly
 * smaller. When nothing is smaller the original is kept with metadata removed losslessly.
 */
export async function processImage(
  input: Buffer,
  ext: 'png' | 'jpeg' | 'webp',
): Promise<Processed> {
  let meta: Metadata
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS, failOn: 'error' }).metadata()
  } catch (error) {
    return reject(/pixel limit/i.test(String(error)) ? 'TOO_MANY_PIXELS' : 'CORRUPT')
  }
  const format = String(meta.format) === 'jpg' ? 'jpeg' : meta.format
  if (format !== ext) return reject('SIGNATURE_MISMATCH')
  if (!meta.width || !meta.height) return reject('CORRUPT')
  if (meta.width * meta.height > MAX_PIXELS) return reject('TOO_MANY_PIXELS')

  // Photos with an orientation flag must be rotated before the flag is dropped.
  const needsRotation = (meta.orientation ?? 1) !== 1
  const base = () => sharp(input, { limitInputPixels: MAX_PIXELS }).rotate()
  const candidates: { bytes: Buffer; ext: string; method: string; minGain: number }[] = []
  try {
    candidates.push({
      bytes: await base().webp({ lossless: true, effort: 6 }).toBuffer(),
      ext: 'webp',
      method: 'WEBP_LOSSLESS',
      minGain: 0,
    })
    if (ext === 'png') {
      candidates.push({
        bytes: await base()
          .png({ compressionLevel: 9, adaptiveFiltering: true, effort: 10 })
          .toBuffer(),
        ext: 'png',
        method: 'PNG_OPTIMIZE',
        minGain: 0,
      })
    }
    if (ext === 'jpeg') {
      candidates.push({
        bytes: await base().jpeg({ quality: 90, mozjpeg: true }).toBuffer(),
        ext: 'jpg',
        method: 'JPEG_MOZJPEG_Q90',
        minGain: JPEG_MIN_GAIN,
      })
    }
  } catch {
    return reject('CORRUPT')
  }

  const smaller = candidates
    .filter(
      (c) => c.bytes.length <= input.length * (1 - c.minGain) && c.bytes.length < input.length,
    )
    .sort((a, b) => a.bytes.length - b.bytes.length)[0]

  let chosen: { bytes: Buffer; ext: string; method: string }
  const notes: string[] = []
  if (smaller) {
    chosen = smaller
  } else if (needsRotation) {
    // Cannot keep the original without its orientation flag; lossless output is correct.
    chosen = candidates[0] as (typeof candidates)[number]
    notes.push('NO_SIZE_GAIN')
  } else {
    const stripped =
      ext === 'png'
        ? stripPngMetadata(input)
        : ext === 'jpeg'
          ? stripJpegMetadata(input)
          : stripWebpMetadata(input)
    chosen = {
      bytes: stripped,
      ext: ext === 'jpeg' ? 'jpg' : ext,
      method: stripped.length < input.length ? 'METADATA_STRIP' : 'NONE',
    }
    notes.push('NO_SIZE_GAIN')
  }

  // Verify the output decodes to the same picture size before releasing it.
  let out: Metadata
  try {
    out = await sharp(chosen.bytes, { limitInputPixels: MAX_PIXELS }).metadata()
  } catch {
    return reject('PROCESSING_ERROR')
  }
  const [w, h] =
    needsRotation && (meta.orientation ?? 1) >= 5
      ? [meta.height, meta.width]
      : [meta.width, meta.height]
  if (out.width !== w || out.height !== h) return reject('PROCESSING_ERROR')

  const thumbnail = await sharp(chosen.bytes)
    .rotate()
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer()

  return {
    ok: true,
    bytes: chosen.bytes,
    ext: chosen.ext,
    mime: chosen.ext === 'webp' ? 'image/webp' : chosen.ext === 'png' ? 'image/png' : 'image/jpeg',
    method: chosen.method,
    notes,
    width: w,
    height: h,
    thumbnail,
  }
}

/**
 * PDF: structure check and refusal of active content (JavaScript, launch actions,
 * embedded files). PDFs are compressed internally; stored unchanged so they stay
 * previewable (doc 07: never force a zip).
 */
export function processPdf(input: Buffer): Processed {
  if (!input.subarray(0, 5).equals(Buffer.from('%PDF-'))) return reject('SIGNATURE_MISMATCH')
  if (!input.subarray(Math.max(0, input.length - 2048)).includes('%%EOF')) return reject('CORRUPT')
  const text = input.toString('latin1')
  if (/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia|XFA)\b/.test(text))
    return reject('ACTIVE_CONTENT')
  return {
    ok: true,
    bytes: input,
    ext: 'pdf',
    mime: 'application/pdf',
    method: 'NONE',
    notes: ['ALREADY_COMPRESSED'],
  }
}

/** DOCX/XLSX: valid package of the right kind, no macros/ActiveX/OLE, no zip bomb. */
export function processOffice(input: Buffer, ext: 'docx' | 'xlsx'): Processed {
  const check = checkOfficePackage(input, ext)
  if (check !== 'OK') return reject(check)
  return {
    ok: true,
    bytes: input,
    ext,
    mime: MIME_FOR_EXTENSION[ext] as string,
    method: 'NONE',
    notes: ['ALREADY_COMPRESSED'],
  }
}

const SENSITIVE_HEADER =
  /^(cookie|set-cookie|authorization|proxy-authorization|x-api-key|x-auth-token|x-csrf-token|x-xsrf-token)$/i
const SENSITIVE_PARAM = /(token|password|passwd|secret|session|auth|api[-_]?key|otp)/i
export const REDACTED = '[DISENSOR]'
const BOM = String.fromCharCode(0xfeff)

type HarPair = { name?: unknown; value?: unknown }
const redactPairs = (list: unknown, rule: RegExp): number => {
  if (!Array.isArray(list)) return 0
  let count = 0
  for (const item of list as HarPair[]) {
    if (item && typeof item === 'object' && typeof item.name === 'string' && rule.test(item.name)) {
      item.value = REDACTED
      count++
    }
  }
  return count
}

/** HAR files carry live sessions: redact cookies, auth headers and token-like parameters. */
export function redactHar(har: unknown): number {
  const entries = (har as { log?: { entries?: unknown } })?.log?.entries
  if (!Array.isArray(entries)) return 0
  let count = 0
  for (const entry of entries as Record<string, Record<string, unknown>>[]) {
    for (const side of [entry.request, entry.response]) {
      if (!side || typeof side !== 'object') continue
      count += redactPairs(side.headers, SENSITIVE_HEADER)
      if (Array.isArray(side.cookies)) {
        for (const cookie of side.cookies as HarPair[]) {
          if (cookie && typeof cookie === 'object') {
            cookie.value = REDACTED
            count++
          }
        }
      }
      count += redactPairs(side.queryString, SENSITIVE_PARAM)
      const post = side.postData as { params?: unknown; text?: unknown } | undefined
      if (post && typeof post === 'object') count += redactPairs(post.params, SENSITIVE_PARAM)
    }
  }
  return count
}

/** Text logs: valid UTF-8 text (JSON/HAR must parse), HAR redacted, gzip when smaller. */
export function processText(input: Buffer, ext: string): Processed {
  if (input.includes(0)) return reject('NOT_TEXT')
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(input)
  } catch {
    return reject('NOT_TEXT')
  }
  const notes: string[] = []
  let bytes = input
  if (ext === 'json' || ext === 'har') {
    let parsed: unknown
    try {
      parsed = JSON.parse(text.startsWith(BOM) ? text.slice(1) : text)
    } catch {
      return reject('INVALID_JSON')
    }
    if (ext === 'har' && redactHar(parsed) > 0) {
      bytes = Buffer.from(JSON.stringify(parsed, null, 2), 'utf8')
      notes.push('HAR_REDACTED')
    }
  }
  const gz = gzipSync(bytes, { level: 9 })
  const mime = MIME_FOR_EXTENSION[ext] ?? 'text/plain'
  if (gz.length < bytes.length) {
    return { ok: true, bytes: gz, ext: `${ext}.gz`, mime, method: 'GZIP', notes }
  }
  return { ok: true, bytes, ext, mime, method: 'NONE', notes: [...notes, 'NO_SIZE_GAIN'] }
}
