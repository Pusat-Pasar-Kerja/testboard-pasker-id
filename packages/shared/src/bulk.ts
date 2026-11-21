import { z } from 'zod'
import type { IdString } from './api.js'
import {
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  TEST_CASE_PRIORITIES,
} from './enums.js'

/**
 * Bulk actions on many test cases or bugs at once (ADR 0013). Every item goes through the
 * same rules as a single edit (permissions, workflow, versions, audit); items that the rules
 * refuse are skipped and reported, the rest are applied.
 */
export const BULK_MAX = 200

const idString = z.string().regex(/^\d{1,20}$/)
const ids = z.array(idString).min(1).max(BULK_MAX)
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => (value.trim() === '' ? null : value.trim()))
    .nullable()
    .optional()

export const defectBulkSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('update'),
    defect_ids: ids,
    changes: z
      .object({
        severity_code: z.enum(DEFECT_SEVERITIES).optional(),
        priority_code: z.enum(DEFECT_PRIORITIES).optional(),
        module_id: idString.nullable().optional(),
        cycle_id: idString.nullable().optional(),
        assigned_to: idString.nullable().optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, 'Nothing to update'),
  }),
  z.object({
    action: z.literal('status'),
    defect_ids: ids,
    status_code: z.enum(DEFECT_STATUSES),
    comment: optionalText(1000),
  }),
])
export type DefectBulkInput = z.input<typeof defectBulkSchema>

export const CASE_BULK_ACTIONS = ['set_status', 'archive', 'set_module', 'set_priority'] as const

export const caseBulkSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('set_status'),
    case_ids: ids,
    case_status: z.enum(['DRAFT', 'READY']),
  }),
  z.object({ action: z.literal('archive'), case_ids: ids }),
  z.object({
    action: z.literal('set_module'),
    case_ids: ids,
    module_code: z.string().trim().min(1).max(40),
  }),
  z.object({
    action: z.literal('set_priority'),
    case_ids: ids,
    priority_code: z.enum(TEST_CASE_PRIORITIES),
  }),
])
export type CaseBulkInput = z.input<typeof caseBulkSchema>

export interface BulkSkipped {
  id: IdString
  /** Case or bug code, for the message. */
  code: string
  /** Short machine reason, e.g. INVALID_TRANSITION, FORBIDDEN, ARCHIVED, NOT_FOUND. */
  reason: string
}

export interface BulkResult {
  /** Items that changed. */
  updated: number
  /** Items that already had the requested values. */
  unchanged: number
  skipped: BulkSkipped[]
}
