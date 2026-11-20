/**
 * Lossless metadata removal (doc 07: EXIF/GPS must not leak) for when the original bytes
 * are kept because no re-encoding was smaller. Pixels are untouched; only metadata
 * segments/chunks are dropped.
 */

/** JPEG: drop APP1 (EXIF/XMP), APP12/APP13 (IPTC/Photoshop) and comments; keep ICC (APP2). */
export function stripJpegMetadata(bytes: Buffer): Buffer {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return bytes
  const parts: Buffer[] = [bytes.subarray(0, 2)]
  let offset = 2
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return bytes // unexpected layout: leave as is
    const marker = bytes[offset + 1] as number
    if (marker === 0xda) {
      // Start of scan: the rest is image data.
      parts.push(bytes.subarray(offset))
      return Buffer.concat(parts)
    }
    const length = bytes.readUInt16BE(offset + 2)
    const segment = bytes.subarray(offset, offset + 2 + length)
    const drop = marker === 0xe1 || marker === 0xec || marker === 0xed || marker === 0xfe
    if (!drop) parts.push(segment)
    offset += 2 + length
  }
  return bytes
}

const PNG_DROP = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'])

/** PNG: drop text, EXIF and time chunks. */
export function stripPngMetadata(bytes: Buffer): Buffer {
  const parts: Buffer[] = [bytes.subarray(0, 8)]
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset)
    const type = bytes.toString('latin1', offset + 4, offset + 8)
    const end = offset + 12 + length
    if (end > bytes.length) return bytes
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(offset, end))
    offset = end
    if (type === 'IEND') break
  }
  return Buffer.concat(parts)
}

/** WebP: drop EXIF and XMP chunks and clear their flags in VP8X. */
export function stripWebpMetadata(bytes: Buffer): Buffer {
  const parts: Buffer[] = []
  let offset = 12
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('latin1', offset, offset + 4)
    const size = bytes.readUInt32LE(offset + 4)
    const end = offset + 8 + size + (size % 2)
    if (end > bytes.length) return bytes
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = Buffer.from(bytes.subarray(offset, end))
      if (type === 'VP8X') chunk[8] = (chunk[8] as number) & ~(0x08 | 0x04)
      parts.push(chunk)
    }
    offset = end
  }
  const body = Buffer.concat(parts)
  const header = Buffer.alloc(12)
  header.write('RIFF', 0, 'latin1')
  header.writeUInt32LE(body.length + 4, 4)
  header.write('WEBP', 8, 'latin1')
  return Buffer.concat([header, body])
}
