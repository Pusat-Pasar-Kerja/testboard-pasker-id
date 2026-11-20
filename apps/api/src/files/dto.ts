import type {
  AttachedFileDto,
  EvidenceType,
  FileDto,
  FileFailureReason,
  FileProcessingStatus,
  FileScanStatus,
} from '@testboard/shared'
import { iso, select, type Db } from '../db/tx.js'

export interface FileRow {
  id: string
  project_id: string
  object_key: string
  thumbnail_object_key: string | null
  evidence_type: EvidenceType
  original_filename: string
  original_mime: string
  stored_mime: string
  original_size_bytes: string | number
  stored_size_bytes: string | number | null
  compression_method: string | null
  compression_note: string | null
  processing_status: FileProcessingStatus
  scan_status: FileScanStatus
  scan_engine: string | null
  failure_reason: FileFailureReason | null
  width_px: number | null
  height_px: number | null
  uploaded_by: string | null
  uploader_name: string | null
  uploaded_at: Date
  processed_at: Date | null
  deleted_at: Date | null
}

export const FILE_SELECT = `
  SELECT f.*, u.display_name AS uploader_name
    FROM file_objects f
    LEFT JOIN users u ON u.id = f.uploaded_by`

export function toFileDto(row: FileRow): FileDto {
  return {
    id: String(row.id),
    evidence_type: row.evidence_type,
    original_filename: row.original_filename,
    original_mime: row.original_mime,
    stored_mime: row.stored_mime,
    original_size_bytes: Number(row.original_size_bytes),
    stored_size_bytes: row.stored_size_bytes === null ? null : Number(row.stored_size_bytes),
    compression_method: row.compression_method,
    compression_note: row.compression_note,
    processing_status: row.processing_status,
    scan_status: row.scan_status,
    scan_engine: row.scan_engine,
    failure_reason: row.failure_reason,
    width_px: row.width_px === null ? null : Number(row.width_px),
    height_px: row.height_px === null ? null : Number(row.height_px),
    has_thumbnail: row.thumbnail_object_key !== null,
    uploaded_by: row.uploaded_by
      ? { id: String(row.uploaded_by), display_name: row.uploader_name ?? '' }
      : null,
    uploaded_at: iso(row.uploaded_at) as string,
    processed_at: iso(row.processed_at),
  }
}

const OWNERS = {
  execution: {
    table: 'execution_files',
    column: 'execution_id',
    step: 'l.step_number',
    order: 'l.sort_order, l.id',
  },
  defect: { table: 'defect_files', column: 'defect_id', step: 'NULL', order: 'l.sort_order, l.id' },
  test_case: { table: 'test_case_files', column: 'test_case_id', step: 'NULL', order: 'l.id' },
} as const

/** Attached files per owner id (one query for many owners). Deleted files are hidden. */
export async function attachedFiles(
  db: Db,
  owner: keyof typeof OWNERS,
  ownerIds: string[],
): Promise<Map<string, AttachedFileDto[]>> {
  const map = new Map<string, AttachedFileDto[]>()
  if (ownerIds.length === 0) return map
  const o = OWNERS[owner]
  const rows = await select<
    FileRow & { owner_id: string; caption: string | null; step_number: number | null }
  >(
    db,
    `SELECT f.*, u.display_name AS uploader_name, l.${o.column} AS owner_id,
            l.caption, ${o.step} AS step_number
       FROM ${o.table} l
       JOIN file_objects f ON f.id = l.file_object_id
       LEFT JOIN users u ON u.id = f.uploaded_by
      WHERE l.${o.column} IN (${ownerIds.map(() => '?').join(', ')}) AND f.deleted_at IS NULL
      ORDER BY ${o.order}`,
    ownerIds,
  )
  for (const row of rows) {
    const key = String(row.owner_id)
    const list = map.get(key) ?? []
    list.push({
      ...toFileDto(row),
      caption: row.caption,
      step_number: row.step_number === null ? null : Number(row.step_number),
    })
    map.set(key, list)
  }
  return map
}
