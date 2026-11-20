import type { ExecutionStatus } from './enums.js'
import {
  caseFingerprint,
  checkCaseRow,
  isDataRow,
  mapRow,
  normalizeResultStatus,
  parseLegacyDate,
  type CheckedCase,
  type ImportConfig,
  type ImportImage,
  type ImportIssue,
  type ImportPreview,
} from './import.js'

/**
 * Pure import planning shared by the API and the demo (ADR 0009): map + validate rows,
 * find duplicates, decide create/update/unchanged and match images to rows. Database or
 * in-memory lookups are passed in; nothing is written here.
 */
export interface PlanSheet {
  name: string
  rows: string[][]
  hiddenRows: number[]
  images: { key: string; row: number; col: number }[]
}

export interface PreparedResult {
  label: string | null
  status: ExecutionStatus | 'IGNORE' | null
  actual_result: string | null
  notes: string | null
  tester_name: string | null
  tested_at: string | null
}

export interface PreparedRow {
  sheet: string
  row: number
  status: 'VALID' | 'ERROR' | 'DUPLICATE'
  action: 'CREATE' | 'UPDATE' | 'UNCHANGED' | null
  values: CheckedCase
  result: PreparedResult
  issues: ImportIssue[]
  raw: Record<string, string>
  duplicate_of: string | null
  target_id: string | null
  images: string[]
  /** Content fingerprint (the API stores its SHA-256 as source_hash). */
  fingerprint: string
}

export interface ExistingCase {
  id: string
  case_status: string
  values: CheckedCase
}

export function columnName(col: number): string {
  let n = col + 1
  let name = ''
  while (n > 0) {
    const r = (n - 1) % 26
    name = String.fromCharCode(65 + r) + name
    n = Math.floor((n - 1) / 26)
  }
  return name
}

/** UPDATE merges non-empty imported values; NEW_REVISION replaces the whole definition. */
export function mergeForMode(
  existing: CheckedCase,
  imported: CheckedCase,
  mode: ImportConfig['import_mode'],
): CheckedCase {
  if (mode !== 'UPDATE') return { ...imported, case_code: existing.case_code }
  const merged = { ...existing }
  for (const key of Object.keys(imported) as (keyof CheckedCase)[]) {
    const value = imported[key]
    if (value !== null && value !== '' && key !== 'case_code') {
      ;(merged as Record<string, unknown>)[key] = value
    }
  }
  return merged
}

/** Phase 1: map, validate, flag in-file duplicates, anchor images. */
export function planRows(
  sheets: PlanSheet[],
  config: ImportConfig,
  defaults: { suite_name?: string; source_locale?: 'id' | 'en' } = {},
) {
  const rows: PreparedRow[] = []
  const images: ImportImage[] = []
  for (const sheetConfig of config.sheets) {
    const sheet = sheets.find((s) => s.name === sheetConfig.name)
    if (!sheet) throw new Error(`SHEET_NOT_FOUND:${sheetConfig.name}`)
    const headers = sheet.rows[sheetConfig.header_row - 1] ?? []
    const hidden = new Set(sheet.hiddenRows)
    const sheetRows = new Set<number>()
    sheet.rows.slice(sheetConfig.header_row).forEach((cells, index) => {
      const rowNumber = sheetConfig.header_row + index + 1
      const mapped = mapRow(headers, cells, sheetConfig.mapping, {
        module_code: sheetConfig.module_code || undefined,
        suite_name: sheetConfig.suite_name || defaults.suite_name || undefined,
        source_locale: defaults.source_locale,
      })
      if (!isDataRow(mapped)) return
      sheetRows.add(rowNumber)
      const checked = checkCaseRow(mapped)
      const issues = [...checked.issues]
      if (hidden.has(rowNumber)) issues.push({ level: 'warning', code: 'HIDDEN_ROW' })
      const result: PreparedResult = {
        label: mapped.result.result_status ?? null,
        status: null,
        actual_result: mapped.result.actual_result ?? null,
        notes: mapped.result.notes ?? null,
        tester_name: mapped.result.tester_name?.slice(0, 255) ?? null,
        tested_at: null,
      }
      if (config.include_results) {
        if (result.label) {
          result.status = config.status_map?.[result.label] ?? normalizeResultStatus(result.label)
          if (result.status === null) {
            issues.push({
              field: 'result_status',
              level: 'warning',
              code: 'UNKNOWN_STATUS',
              value: result.label,
            })
          } else if (result.status === 'IN_PROGRESS') {
            issues.push({
              field: 'result_status',
              level: 'warning',
              code: 'NOT_RECORDABLE',
              value: result.label,
            })
          }
        }
        if (mapped.result.tested_at) {
          result.tested_at = parseLegacyDate(mapped.result.tested_at)
          if (!result.tested_at) {
            issues.push({
              field: 'tested_at',
              level: 'warning',
              code: 'BAD_DATE',
              value: mapped.result.tested_at,
            })
          }
        }
      }
      rows.push({
        sheet: sheet.name,
        row: rowNumber,
        status: issues.some((i) => i.level === 'error') ? 'ERROR' : 'VALID',
        action: null,
        values: checked.values,
        result,
        issues,
        raw: mapped.raw,
        duplicate_of: null,
        target_id: null,
        images: [],
        fingerprint: caseFingerprint(checked.values),
      })
    })

    // Images belong to the row they are anchored in; never matched by file order (doc 08 F).
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

  // Same code twice in the file: the first row wins, later ones are reported (TB-IMP-004).
  const firstByCode = new Map<string, PreparedRow>()
  for (const row of rows) {
    const code = row.values.case_code
    if (!code || row.status === 'ERROR') continue
    const first = firstByCode.get(code)
    if (first) {
      row.status = 'DUPLICATE'
      row.duplicate_of = `${first.sheet}!${first.row}`
    } else firstByCode.set(code, row)
  }
  for (const image of images) {
    if (image.row_number === null) continue
    rows.find((r) => r.sheet === image.sheet && r.row === image.row_number)?.images.push(image.key)
  }
  return { rows, images, codes: [...firstByCode.keys()] }
}

/** Phase 2: compare with existing cases and summarise for the preview screen. */
export function finishPlan(
  rows: PreparedRow[],
  images: ImportImage[],
  config: ImportConfig,
  existing: Map<string, ExistingCase>,
  knownModules: Set<string>,
  knownSuites: Set<string>,
): ImportPreview {
  for (const row of rows) {
    if (row.status !== 'VALID') continue
    const found = row.values.case_code ? existing.get(row.values.case_code) : undefined
    if (!found) {
      row.action = 'CREATE'
      continue
    }
    row.target_id = found.id
    if (found.case_status === 'ARCHIVED') {
      row.status = 'ERROR'
      row.issues.push({ field: 'case_code', level: 'error', code: 'ARCHIVED_CASE' })
    } else if (config.import_mode === 'CREATE_ONLY') {
      if (config.include_results) {
        // Re-using the existing case for its historical result; the definition is kept.
        row.action = 'UNCHANGED'
        row.issues.push({ field: 'case_code', level: 'warning', code: 'EXISTING_CASE_KEPT' })
      } else {
        row.status = 'DUPLICATE'
        row.duplicate_of = 'EXISTING'
      }
    } else {
      const merged = mergeForMode(found.values, row.values, config.import_mode)
      row.action =
        caseFingerprint(merged) === caseFingerprint(found.values) ? 'UNCHANGED' : 'UPDATE'
    }
  }

  const valid = rows.filter((r) => r.status === 'VALID')
  const newModules = [...new Set(valid.map((r) => r.values.module_code as string))].filter(
    (m) => !knownModules.has(m),
  )
  const newSuites = [
    ...new Set(
      valid
        .filter((r) => r.values.suite_name)
        .map((r) => `${r.values.module_code}|${r.values.suite_name}`),
    ),
  ].filter((key) => !knownSuites.has(key))
  const labels = new Map<string, number>()
  for (const row of rows) {
    if (row.result.label) labels.set(row.result.label, (labels.get(row.result.label) ?? 0) + 1)
  }
  return {
    counts: {
      total: rows.length,
      valid: valid.filter((r) => !r.issues.length).length,
      review: valid.filter((r) => r.issues.length > 0).length,
      duplicate: rows.filter((r) => r.status === 'DUPLICATE').length,
      invalid: rows.filter((r) => r.status === 'ERROR').length,
      create: valid.filter((r) => r.action === 'CREATE').length,
      update: valid.filter((r) => r.action === 'UPDATE').length,
      unchanged: valid.filter((r) => r.action === 'UNCHANGED').length,
    },
    statuses: config.include_results
      ? [...labels].map(([label, count]) => ({
          label,
          count,
          mapped: config.status_map?.[label] ?? normalizeResultStatus(label),
        }))
      : [],
    new_modules: newModules,
    new_suites: newSuites.map((key) => key.split('|')[1] as string),
    images: {
      total: images.length,
      auto: images.filter((i) => i.state === 'AUTO' || i.state === 'ASSIGNED').length,
      review: images.filter((i) => i.state === 'REVIEW'),
    },
  }
}
