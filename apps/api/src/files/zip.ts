/**
 * Minimal ZIP central-directory reader for DOCX/XLSX checks: entry names and declared
 * sizes only, nothing is decompressed. Enough to refuse macros, ActiveX/OLE objects and
 * decompression bombs before a file is released (doc 07: macro-bearing files blocked).
 */
export interface ZipEntry {
  name: string
  compressedSize: number
  uncompressedSize: number
}

const EOCD_SIGNATURE = 0x06054b50
const CENTRAL_SIGNATURE = 0x02014b50

export function readZipEntries(bytes: Buffer): ZipEntry[] | null {
  // End of central directory: last 22 bytes + up to 64 KiB comment.
  const from = Math.max(0, bytes.length - 22 - 0xffff)
  let eocd = -1
  for (let i = bytes.length - 22; i >= from; i--) {
    if (bytes.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i
      break
    }
  }
  if (eocd < 0) return null
  const count = bytes.readUInt16LE(eocd + 10)
  const size = bytes.readUInt32LE(eocd + 12)
  let offset = bytes.readUInt32LE(eocd + 16)
  if (offset + size > bytes.length || count === 0xffff) return null // ZIP64 not expected here

  const entries: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || bytes.readUInt32LE(offset) !== CENTRAL_SIGNATURE) return null
    const compressedSize = bytes.readUInt32LE(offset + 20)
    const uncompressedSize = bytes.readUInt32LE(offset + 24)
    const nameLength = bytes.readUInt16LE(offset + 28)
    const extraLength = bytes.readUInt16LE(offset + 30)
    const commentLength = bytes.readUInt16LE(offset + 32)
    const name = bytes.toString('utf8', offset + 46, offset + 46 + nameLength)
    entries.push({ name, compressedSize, uncompressedSize })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

export type OfficeCheck =
  'OK' | 'CORRUPT' | 'ACTIVE_CONTENT' | 'ARCHIVE_BOMB' | 'SIGNATURE_MISMATCH'

const ACTIVE_PART =
  /(vbaproject\.bin$|vbadata\.xml$|\/activex\/|\/embeddings\/.*\.(bin|docm|xlsm|pptm|exe|dll|js|vbs|ps1|bat|cmd)$)/i

const MAX_TOTAL_UNCOMPRESSED = 250 * 1024 * 1024
const MAX_ENTRIES = 5000
const MAX_RATIO = 200

/** Validate an Office Open XML package of the expected flavour. */
export function checkOfficePackage(bytes: Buffer, ext: 'docx' | 'xlsx'): OfficeCheck {
  const entries = readZipEntries(bytes)
  if (!entries || entries.length === 0) return 'CORRUPT'
  const names = new Set(entries.map((e) => e.name))
  if (!names.has('[Content_Types].xml')) return 'SIGNATURE_MISMATCH'
  if (ext === 'docx' && !names.has('word/document.xml')) return 'SIGNATURE_MISMATCH'
  if (ext === 'xlsx' && !names.has('xl/workbook.xml')) return 'SIGNATURE_MISMATCH'
  // Macros, ActiveX and embedded OLE/macro objects. Plain .bin parts such as
  // xl/printerSettings/printerSettings1.bin are normal and allowed.
  if (entries.some((e) => ACTIVE_PART.test(e.name))) {
    return 'ACTIVE_CONTENT'
  }
  if (entries.length > MAX_ENTRIES) return 'ARCHIVE_BOMB'
  let total = 0
  for (const e of entries) {
    total += e.uncompressedSize
    if (
      e.uncompressedSize > 1024 * 1024 &&
      e.uncompressedSize / Math.max(1, e.compressedSize) > MAX_RATIO
    ) {
      return 'ARCHIVE_BOMB'
    }
  }
  return total > MAX_TOTAL_UNCOMPRESSED ? 'ARCHIVE_BOMB' : 'OK'
}
