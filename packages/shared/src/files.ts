import { z } from 'zod'
import type { IdString } from './api.js'
import type { UserRef } from './dto.js'
import type { FileProcessingStatus, FileScanStatus } from './enums.js'

/**
 * Evidence types (doc 07, ADR 0008). Video is intentionally not accepted: the project
 * owner chose screenshots for all visual evidence.
 */
export const EVIDENCE_TYPES = ['SCREENSHOT', 'DOCUMENT', 'LOG'] as const
export type EvidenceType = (typeof EVIDENCE_TYPES)[number]

const MIB = 1024 * 1024

/** Accepted extensions and per-file limits (doc 07 default proposal, configurable later). */
export const EVIDENCE_RULES: Record<
  EvidenceType,
  { extensions: readonly string[]; maxBytes: number }
> = {
  SCREENSHOT: { extensions: ['png', 'jpg', 'jpeg', 'webp'], maxBytes: 15 * MIB },
  DOCUMENT: { extensions: ['pdf', 'docx', 'xlsx'], maxBytes: 25 * MIB },
  LOG: { extensions: ['txt', 'log', 'csv', 'json', 'har'], maxBytes: 20 * MIB },
}

export const UPLOAD_LIMITS = {
  filesPerRequest: 10,
  requestBytes: 300 * MIB,
  /** Files attached in one go (execution, bug, case). */
  attachPerRequest: 20,
} as const

export function extensionOf(filename: string): string {
  const match = /\.([A-Za-z0-9]{1,10})$/.exec(filename.trim())
  return match ? (match[1] as string).toLowerCase() : ''
}

/** Evidence type from the file name, or null when the extension is not accepted. */
export function evidenceTypeFor(filename: string): EvidenceType | null {
  const ext = extensionOf(filename)
  return EVIDENCE_TYPES.find((type) => EVIDENCE_RULES[type].extensions.includes(ext)) ?? null
}

/** `accept` attribute for file inputs. */
export const EVIDENCE_ACCEPT = EVIDENCE_TYPES.flatMap((type) =>
  EVIDENCE_RULES[type].extensions.map((ext) => `.${ext}`),
).join(',')

/** Safe reason codes shown to users (never paths, stack traces or scanner internals). */
export const FILE_FAILURE_REASONS = [
  'EMPTY',
  'TOO_LARGE',
  'TYPE_NOT_ALLOWED',
  'SIGNATURE_MISMATCH',
  'CORRUPT',
  'TOO_MANY_PIXELS',
  'ACTIVE_CONTENT',
  'ARCHIVE_BOMB',
  'NOT_TEXT',
  'INVALID_JSON',
  'INFECTED',
  'SCAN_ERROR',
  'PROCESSING_ERROR',
  'INTERRUPTED',
] as const
export type FileFailureReason = (typeof FILE_FAILURE_REASONS)[number]

export interface FileDto {
  id: IdString
  evidence_type: EvidenceType
  original_filename: string
  original_mime: string
  stored_mime: string
  original_size_bytes: number
  stored_size_bytes: number | null
  compression_method: string | null
  compression_note: string | null
  processing_status: FileProcessingStatus
  scan_status: FileScanStatus
  /** BASIC = built-in content checks, CLAMAV = antivirus (ADR 0008). */
  scan_engine: string | null
  failure_reason: FileFailureReason | null
  width_px: number | null
  height_px: number | null
  has_thumbnail: boolean
  uploaded_by: UserRef | null
  uploaded_at: string
  processed_at: string | null
}

/** A file as attached to an execution, bug or test case. */
export interface AttachedFileDto extends FileDto {
  caption: string | null
  step_number: number | null
}

/** Where a file is used, for the Evidence Center. */
export interface FileUsage {
  kind: 'EXECUTION' | 'DEFECT' | 'TEST_CASE'
  /** Human label, e.g. "RUN-S2 / UAT-AUTH-001 #2", "BUG-KAR-0003", "UAT-AUTH-001". */
  label: string
  /** App route below /projects/:code/. */
  path: string
}

export interface EvidenceItem extends FileDto {
  usages: FileUsage[]
}

export const isFileUsable = (file: Pick<FileDto, 'processing_status' | 'scan_status'>) =>
  file.processing_status === 'READY' && file.scan_status === 'CLEAN'

const idString = z.string().regex(/^\d{1,20}$/)
const caption = z
  .string()
  .max(500)
  .transform((value) => (value.trim() === '' ? null : value.trim()))
  .nullable()
  .optional()

/** One evidence file referenced when saving a result (doc 06 `evidence_file_ids`). */
export const evidenceRefSchema = z.object({
  file_id: idString,
  caption,
  step_number: z.number().int().min(1).max(500).nullable().optional(),
})
export type EvidenceRef = z.input<typeof evidenceRefSchema>

export const fileAttachSchema = z.object({
  files: z.array(evidenceRefSchema).min(1).max(UPLOAD_LIMITS.attachPerRequest),
})
