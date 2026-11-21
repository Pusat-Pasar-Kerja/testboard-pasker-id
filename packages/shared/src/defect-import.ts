import { z } from 'zod'
import {
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_SOURCE_KINDS,
  DEFECT_STATUSES,
  type DefectPriority,
  type DefectSeverity,
  type DefectSourceKind,
  type DefectStatus,
} from './enums.js'
import { IMPORT_LIMITS, normalizeHeader, parseLegacyDate, type ImportImage } from './import.js'
import { columnName, type PlanSheet } from './import-plan.js'

/**
 * "Impor Bug" (ADR 0013): bugs from a tracker workbook (e.g. Tracker Fase 1: failed UAT
 * rows with severity and screenshots, plus the "Aduan user" sheet). Same job flow as the
 * test case import (upload -> configure -> preview -> commit); only the target differs.
 */
export const IMPORT_TARGETS = ['TEST_CASES', 'DEFECTS'] as const
export type ImportTarget = (typeof IMPORT_TARGETS)[number]

export const DEFECT_IMPORT_FIELDS = [
  'bug_code',
  'case_code',
  'category',
  'title',
  'description',
  'notes',
  'severity',
  'priority',
  'status',
  'retest_status',
  'reporter_name',
  'reported_at',
  'evidence',
] as const
export type DefectImportField = (typeof DEFECT_IMPORT_FIELDS)[number]

const SYNONYMS: Record<DefectImportField, string[]> = {
  bug_code: ['id', 'id bug', 'kode bug', 'bug id', 'id aduan', 'bug code'],
  case_code: ['id uat', 'kode test case', 'test case id', 'case code', 'id test case'],
  category: ['kategori', 'category', 'jenis aduan'],
  title: ['fitur proses', 'fitur', 'judul', 'title', 'ringkasan', 'summary'],
  description: [
    'detail hasil aktual defect',
    'detail hasil aktual',
    'hasil aktual',
    'deskripsi',
    'description',
    'defect',
  ],
  notes: ['notes', 'catatan', 'catatan retest', 'keterangan'],
  severity: ['severity', 'tingkat keparahan'],
  priority: ['prioritas', 'priority'],
  status: ['status', 'status uat', 'status bug'],
  retest_status: ['status retest', 'retest'],
  reporter_name: ['penguji', 'pelapor', 'tester', 'reporter', 'nama penguji'],
  reported_at: ['tgl uat', 'tanggal', 'tgl', 'tanggal uji', 'tanggal lapor', 'reported at'],
  evidence: ['bukti', 'bukti uji', 'evidence', 'screenshot'],
}
const LOOKUP = new Map<string, DefectImportField>()
for (const field of DEFECT_IMPORT_FIELDS) {
  for (const alias of SYNONYMS[field]) LOOKUP.set(normalizeHeader(alias), field)
  LOOKUP.set(normalizeHeader(field), field)
}

/**
 * Column -> field suggestion (first matching column wins). "ID UAT" is a test case code
 * (link to the result); a plain "ID" column is the bug's own code.
 */
export function suggestDefectMapping(headers: string[]): (DefectImportField | null)[] {
  const used = new Set<DefectImportField>()
  return headers.map((header) => {
    const field = LOOKUP.get(normalizeHeader(header)) ?? null
    if (!field || used.has(field)) return null
    used.add(field)
    return field
  })
}

/** Status labels that are test results, not bug states: failed -> bug, the rest skipped. */
const STATUS_DEFAULTS: Record<string, DefectStatus | 'SKIP'> = {
  'gagal diuji': 'OPEN',
  gagal: 'OPEN',
  failed: 'OPEN',
  fail: 'OPEN',
  'berhasil diuji': 'SKIP',
  berhasil: 'SKIP',
  passed: 'SKIP',
  pass: 'SKIP',
  'belum diuji': 'SKIP',
  'not run': 'SKIP',
  'terhambat diuji': 'SKIP',
  blocked: 'SKIP',
  'dilewati diuji': 'SKIP',
  skipped: 'SKIP',
  done: 'CLOSED',
  selesai: 'CLOSED',
  closed: 'CLOSED',
  fixed: 'FIXED',
  verified: 'VERIFIED',
  'not done': 'OPEN',
  'belum selesai': 'OPEN',
  open: 'OPEN',
  pending: 'OPEN',
  'on progress': 'IN_PROGRESS',
  'in progress': 'IN_PROGRESS',
  info: 'CLOSED',
}
const SEVERITY_DEFAULTS: Record<string, DefectSeverity> = {
  critical: 'CRITICAL',
  kritis: 'CRITICAL',
  blocker: 'CRITICAL',
  high: 'HIGH',
  tinggi: 'HIGH',
  major: 'HIGH',
  medium: 'MEDIUM',
  sedang: 'MEDIUM',
  minor: 'LOW',
  low: 'LOW',
  rendah: 'LOW',
  info: 'INFO',
  informasi: 'INFO',
  trivial: 'INFO',
}
const PRIORITY_DEFAULTS: Record<string, DefectPriority> = {
  urgent: 'URGENT',
  mendesak: 'URGENT',
  high: 'HIGH',
  tinggi: 'HIGH',
  'must have': 'HIGH',
  medium: 'MEDIUM',
  sedang: 'MEDIUM',
  'should have': 'MEDIUM',
  low: 'LOW',
  rendah: 'LOW',
  'could have': 'LOW',
}
const key = (label: string) => normalizeHeader(label)
export const defaultDefectStatus = (label: string) => STATUS_DEFAULTS[key(label)] ?? null
export const defaultDefectSeverity = (label: string) => SEVERITY_DEFAULTS[key(label)] ?? null
export const defaultDefectPriority = (label: string) => PRIORITY_DEFAULTS[key(label)] ?? null

/** Label used for an empty status cell in the status map. */
export const EMPTY_LABEL = ''

const idString = z.string().regex(/^\d{1,20}$/)
export const defectImportConfigSchema = z.object({
  sheets: z
    .array(
      z.object({
        name: z.string().min(1).max(255),
        header_row: z.number().int().min(1).max(1000),
        mapping: z.array(z.enum(DEFECT_IMPORT_FIELDS).nullable()).max(200),
        module_code: z.string().trim().max(40).optional(),
        source_kind: z.enum(DEFECT_SOURCE_KINDS).default('UAT'),
      }),
    )
    .min(1)
    .max(IMPORT_LIMITS.sheets),
  cycle_id: idString.nullable().optional(),
  /** Raw status label -> bug status, or SKIP (row not imported). Empty cell = "". */
  status_map: z.record(z.string().max(200), z.enum([...DEFECT_STATUSES, 'SKIP'])).optional(),
  severity_map: z.record(z.string().max(200), z.enum(DEFECT_SEVERITIES)).optional(),
  priority_map: z.record(z.string().max(200), z.enum(DEFECT_PRIORITIES)).optional(),
  /** Link each bug to the latest attempt of its test case (by "ID UAT") in the cycle. */
  link_results: z.boolean().default(true),
  image_rows: z.record(z.string().max(200), z.number().int().min(1).nullable()).optional(),
})
export type DefectImportConfigInput = z.input<typeof defectImportConfigSchema>
export type DefectImportConfig = z.output<typeof defectImportConfigSchema>

export interface DefectImportValues {
  bug_code: string | null
  case_code: string | null
  module_code: string | null
  category: string | null
  title: string
  description: string | null
  notes: string | null
  severity: DefectSeverity
  priority: DefectPriority
  status: DefectStatus
  retest_status: string | null
  reporter_name: string | null
  reported_at: string | null
  source_kind: DefectSourceKind
}

export interface PreparedDefectRow {
  sheet: string
  row: number
  status: 'VALID' | 'ERROR' | 'DUPLICATE' | 'SKIPPED'
  action: 'CREATE' | null
  values: DefectImportValues
  labels: { status: string; severity: string | null; priority: string | null }
  issues: { field?: string; level: 'error' | 'warning'; code: string; value?: string }[]
  raw: Record<string, string>
  duplicate_of: string | null
  images: string[]
  fingerprint: string
}

export interface LabelCount<T> {
  label: string
  count: number
  mapped: T | null
}

export interface DefectImportPreview {
  counts: {
    total: number
    create: number
    skipped: number
    duplicate: number
    invalid: number
    review: number
  }
  statuses: LabelCount<DefectStatus | 'SKIP'>[]
  severities: LabelCount<DefectSeverity>[]
  priorities: LabelCount<DefectPriority>[]
  new_modules: string[]
  images: { total: number; auto: number; review: ImportImage[] }
}

export interface DefectImportResult {
  created_defects: number
  skipped_rows: number
  linked_results: number
  images_imported: number
  images_failed: number
  images_left_out: number
}

const CODE = /^[A-Za-z0-9][A-Za-z0-9_.-]{1,99}$/
const MODULE = /^[A-Z0-9][A-Z0-9_.-]{1,39}$/

function tally<T>(
  rows: PreparedDefectRow[],
  pick: (r: PreparedDefectRow) => string | null,
  map: (label: string) => T | null,
) {
  const counts = new Map<string, number>()
  for (const row of rows) {
    const label = pick(row)
    if (label === null) continue
    counts.set(label, (counts.get(label) ?? 0) + 1)
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]): LabelCount<T> => ({ label, count, mapped: map(label) }))
}

/**
 * Map + validate rows, apply the value maps, anchor screenshots to their rows and
 * summarise. `existingBugCodes` = codes already used in the project; `knownModules` =
 * module codes that exist. Nothing is written here.
 */
export function planDefectRows(
  sheets: PlanSheet[],
  config: DefectImportConfig,
  existingBugCodes: Set<string>,
  knownModules: Set<string>,
) {
  const rows: PreparedDefectRow[] = []
  const images: ImportImage[] = []
  /**
   * Continuation rows: the same bug code again right below, without status or details,
   * usually just one more screenshot ("Aduan user"). They are folded into the first row.
   */
  const mergedInto = new Map<string, PreparedDefectRow>()
  for (const sheetConfig of config.sheets) {
    const sheet = sheets.find((s) => s.name === sheetConfig.name)
    if (!sheet) throw new Error(`SHEET_NOT_FOUND:${sheetConfig.name}`)
    const headers = sheet.rows[sheetConfig.header_row - 1] ?? []
    const hidden = new Set(sheet.hiddenRows)
    const sheetRows = new Set<number>()
    const moduleCode = sheetConfig.module_code?.trim().toUpperCase() || null
    const firstByCodeInSheet = new Map<string, PreparedDefectRow>()
    sheet.rows.slice(sheetConfig.header_row).forEach((cells, index) => {
      const rowNumber = sheetConfig.header_row + index + 1
      const raw: Record<string, string> = {}
      const value: Partial<Record<DefectImportField, string>> = {}
      headers.forEach((header, col) => {
        const text = (cells[col] ?? '').trim()
        if (header.trim() || text) raw[header.trim() || `#${col + 1}`] = text
        const field = sheetConfig.mapping[col]
        if (field && text && value[field] === undefined) value[field] = text
      })
      const ownCode = value.bug_code?.toUpperCase()
      const earlier = ownCode ? firstByCodeInSheet.get(ownCode) : undefined
      if (earlier && !value.status && !value.description) {
        sheetRows.add(rowNumber)
        mergedInto.set(`${sheet.name}!${rowNumber}`, earlier)
        return
      }
      if (!value.title && !value.description) return
      sheetRows.add(rowNumber)
      const issues: PreparedDefectRow['issues'] = []
      if (hidden.has(rowNumber)) issues.push({ level: 'warning', code: 'HIDDEN_ROW' })

      const statusLabel = value.status ?? EMPTY_LABEL
      const emptyDefault = sheetConfig.source_kind === 'UAT' ? 'SKIP' : 'OPEN'
      const status =
        config.status_map?.[statusLabel] ??
        (statusLabel === EMPTY_LABEL ? emptyDefault : defaultDefectStatus(statusLabel))
      if (status === null) {
        issues.push({
          field: 'status',
          level: 'warning',
          code: 'UNKNOWN_STATUS',
          value: statusLabel,
        })
      }
      const severityLabel = value.severity ?? null
      let severity: DefectSeverity = 'MEDIUM'
      if (severityLabel && severityLabel !== '-') {
        const mapped = config.severity_map?.[severityLabel] ?? defaultDefectSeverity(severityLabel)
        if (mapped) severity = mapped
        else
          issues.push({
            field: 'severity',
            level: 'warning',
            code: 'UNKNOWN_SEVERITY',
            value: severityLabel,
          })
      }
      const priorityLabel = value.priority ?? null
      let priority: DefectPriority = 'MEDIUM'
      if (priorityLabel && priorityLabel !== '-') {
        const mapped = config.priority_map?.[priorityLabel] ?? defaultDefectPriority(priorityLabel)
        if (mapped) priority = mapped
        else
          issues.push({
            field: 'priority',
            level: 'warning',
            code: 'UNKNOWN_PRIORITY',
            value: priorityLabel,
          })
      }
      const title = (value.title ?? (value.description ?? '').split('\n')[0] ?? '')
        .trim()
        .slice(0, 500)
      if (title.length < 3) issues.push({ field: 'title', level: 'error', code: 'REQUIRED' })
      let bugCode: string | null = null
      if (value.bug_code) {
        if (CODE.test(value.bug_code)) bugCode = value.bug_code.toUpperCase()
        else
          issues.push({
            field: 'bug_code',
            level: 'warning',
            code: 'BAD_CODE',
            value: value.bug_code,
          })
      }
      let reportedAt: string | null = null
      if (value.reported_at) {
        reportedAt = parseLegacyDate(value.reported_at)
        if (!reportedAt) {
          issues.push({
            field: 'reported_at',
            level: 'warning',
            code: 'BAD_DATE',
            value: value.reported_at,
          })
        }
      }
      if (moduleCode && !MODULE.test(moduleCode)) {
        issues.push({ field: 'module_code', level: 'error', code: 'BAD_MODULE', value: moduleCode })
      }
      const values: DefectImportValues = {
        bug_code: bugCode,
        case_code: value.case_code?.toUpperCase() ?? null,
        module_code: moduleCode,
        category: value.category ?? null,
        title,
        description: value.description ?? null,
        notes: value.notes ?? null,
        severity,
        priority,
        status: status && status !== 'SKIP' ? status : 'OPEN',
        retest_status: value.retest_status ?? null,
        reporter_name: value.reporter_name?.slice(0, 200) ?? null,
        reported_at: reportedAt,
        source_kind: sheetConfig.source_kind,
      }
      rows.push({
        sheet: sheet.name,
        row: rowNumber,
        status: issues.some((i) => i.level === 'error')
          ? 'ERROR'
          : status === 'SKIP'
            ? 'SKIPPED'
            : 'VALID',
        action: null,
        values,
        labels: { status: statusLabel, severity: severityLabel, priority: priorityLabel },
        issues,
        raw,
        duplicate_of: null,
        images: [],
        fingerprint: JSON.stringify([
          sheet.name,
          values.bug_code,
          values.case_code,
          values.title,
          values.description,
        ]),
      })
      const added = rows[rows.length - 1] as PreparedDefectRow
      if (ownCode && !firstByCodeInSheet.has(ownCode)) firstByCodeInSheet.set(ownCode, added)
    })
    for (const image of sheet.images) {
      const override = config.image_rows?.[image.key]
      const base = {
        key: image.key,
        sheet: sheet.name,
        anchor: `${columnName(image.col)}${image.row}`,
      }
      if (override === null) images.push({ ...base, row_number: null, state: 'IGNORED' })
      else if (override !== undefined && sheetRows.has(override)) {
        images.push({ ...base, row_number: override, state: 'ASSIGNED' })
      } else if (sheetRows.has(image.row))
        images.push({ ...base, row_number: image.row, state: 'AUTO' })
      else images.push({ ...base, row_number: null, state: 'REVIEW' })
    }
  }

  // A bug code that already exists (e.g. imported before) or appears twice is not re-created.
  const firstByCode = new Map<string, PreparedDefectRow>()
  for (const row of rows) {
    const code = row.values.bug_code
    if (row.status !== 'VALID' || !code) continue
    if (existingBugCodes.has(code)) {
      row.status = 'DUPLICATE'
      row.duplicate_of = code
      continue
    }
    const first = firstByCode.get(code)
    if (first) {
      row.status = 'DUPLICATE'
      row.duplicate_of = `${first.sheet}!${first.row}`
    } else firstByCode.set(code, row)
  }
  for (const row of rows) if (row.status === 'VALID') row.action = 'CREATE'
  for (const image of images) {
    if (image.row_number === null) continue
    const target =
      mergedInto.get(`${image.sheet}!${image.row_number}`) ??
      rows.find((r) => r.sheet === image.sheet && r.row === image.row_number)
    target?.images.push(image.key)
  }

  const statusOf = (label: string) =>
    config.status_map?.[label] ?? (label === EMPTY_LABEL ? null : defaultDefectStatus(label))
  const preview: DefectImportPreview = {
    counts: {
      total: rows.length,
      create: rows.filter((r) => r.status === 'VALID').length,
      skipped: rows.filter((r) => r.status === 'SKIPPED').length,
      duplicate: rows.filter((r) => r.status === 'DUPLICATE').length,
      invalid: rows.filter((r) => r.status === 'ERROR').length,
      review: rows.filter((r) => r.status === 'VALID' && r.issues.length > 0).length,
    },
    statuses: tally(rows, (r) => r.labels.status, statusOf),
    severities: tally(
      rows,
      (r) => (r.labels.severity && r.labels.severity !== '-' ? r.labels.severity : null),
      (label) => config.severity_map?.[label] ?? defaultDefectSeverity(label),
    ),
    priorities: tally(
      rows,
      (r) => (r.labels.priority && r.labels.priority !== '-' ? r.labels.priority : null),
      (label) => config.priority_map?.[label] ?? defaultDefectPriority(label),
    ),
    new_modules: [
      ...new Set(
        rows
          .filter((r) => r.status === 'VALID' && r.values.module_code)
          .map((r) => r.values.module_code as string)
          .filter((code) => !knownModules.has(code)),
      ),
    ],
    images: {
      total: images.length,
      auto: images.filter((i) => i.state === 'AUTO' || i.state === 'ASSIGNED').length,
      review: images.filter((i) => i.state === 'REVIEW'),
    },
  }
  return { rows, images, preview }
}

/** What an imported bug's description ends with: category and retest state from the file. */
export function importedDescription(values: DefectImportValues): string | null {
  const extra = [
    values.category ? `Kategori: ${values.category}` : null,
    values.retest_status ? `Status retest: ${values.retest_status}` : null,
  ].filter(Boolean)
  const parts = [values.description, extra.length ? extra.join('\n') : null].filter(Boolean)
  return parts.length ? parts.join('\n\n') : null
}
