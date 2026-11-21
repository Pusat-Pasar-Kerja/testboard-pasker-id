import { z } from 'zod'
import {
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_SOURCE_KINDS,
  DEFECT_STATUSES,
  type DefectStatus,
  type MemberRole,
} from './enums.js'
import { evidenceRefSchema, UPLOAD_LIMITS } from './files.js'
import { codeSchema } from './schemas.js'

/**
 * Bug status workflow (doc 02 section 4, ADR 0007):
 *   OPEN -> IN_PROGRESS -> FIXED -> READY_FOR_RETEST -> VERIFIED -> CLOSED
 *   READY_FOR_RETEST -> REOPENED -> IN_PROGRESS, OPEN -> WONT_FIX
 * plus documented additions: a bug can be declined while being worked on, a verified,
 * closed or declined bug can be reopened (regression / decision reversed).
 * A failed or passed test never changes a bug status by itself (DEC-07).
 */
export const DEFECT_TRANSITIONS: Record<DefectStatus, readonly DefectStatus[]> = {
  OPEN: ['IN_PROGRESS', 'WONT_FIX'],
  IN_PROGRESS: ['FIXED', 'WONT_FIX'],
  FIXED: ['READY_FOR_RETEST'],
  READY_FOR_RETEST: ['VERIFIED', 'REOPENED'],
  VERIFIED: ['CLOSED', 'REOPENED'],
  REOPENED: ['IN_PROGRESS', 'WONT_FIX'],
  CLOSED: ['REOPENED'],
  WONT_FIX: ['REOPENED'],
}

/** Who may move a bug INTO each status. Developers act only on bugs assigned to them. */
const TARGET_ROLES: Record<DefectStatus, readonly MemberRole[]> = {
  OPEN: [],
  IN_PROGRESS: ['ADMIN', 'QA_LEAD', 'DEVELOPER'],
  FIXED: ['ADMIN', 'QA_LEAD', 'DEVELOPER'],
  READY_FOR_RETEST: ['ADMIN', 'QA_LEAD', 'DEVELOPER'],
  // Verification is done by testing, never by the person who fixed it (doc 02).
  VERIFIED: ['ADMIN', 'QA_LEAD', 'TESTER'],
  REOPENED: ['ADMIN', 'QA_LEAD', 'TESTER'],
  CLOSED: ['ADMIN', 'QA_LEAD'],
  WONT_FIX: ['ADMIN', 'QA_LEAD'],
}

/** Statuses that need a written reason (shown in the history timeline). */
export const DEFECT_REASON_REQUIRED: readonly DefectStatus[] = ['REOPENED', 'WONT_FIX']

export interface DefectActor {
  role: MemberRole
  /** The bug is assigned to this user. */
  isAssignee: boolean
  /** This user reported the bug. */
  isReporter: boolean
}

export function canTransitionDefect(
  from: DefectStatus,
  to: DefectStatus,
  actor?: DefectActor,
): boolean {
  if (!DEFECT_TRANSITIONS[from].includes(to)) return false
  if (!actor) return true
  if (!TARGET_ROLES[to].includes(actor.role)) return false
  return actor.role !== 'DEVELOPER' || actor.isAssignee
}

/** Next statuses this actor may choose for a bug currently in `from`. */
export function defectTransitionsFor(from: DefectStatus, actor: DefectActor): DefectStatus[] {
  return DEFECT_TRANSITIONS[from].filter((to) => canTransitionDefect(from, to, actor))
}

/** Text fields describing the bug; the reporter may keep improving them. */
const DESCRIPTIVE_FIELDS = [
  'title',
  'description',
  'steps_to_reproduce',
  'expected_behavior',
  'actual_behavior',
  'module_id',
  'cycle_id',
  'severity_code',
  'priority_code',
  'environment_name',
  'build_version',
  'browser_name',
] as const

export const DEFECT_FIELDS = [...DESCRIPTIVE_FIELDS, 'assigned_to', 'fixed_in_version'] as const
export type DefectField = (typeof DEFECT_FIELDS)[number]

/**
 * Field-level edit rights ("field restrictions", doc 06): leads edit everything, the
 * reporting tester edits the description, the assigned developer records the fix version.
 * Nobody but a lead can (re)assign a bug.
 */
export function defectEditableFields(actor: DefectActor): readonly DefectField[] {
  if (actor.role === 'ADMIN' || actor.role === 'QA_LEAD') return DEFECT_FIELDS
  if (actor.role === 'TESTER' && actor.isReporter) return DESCRIPTIVE_FIELDS
  if (actor.role === 'DEVELOPER' && actor.isAssignee) return ['fixed_in_version']
  return []
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => (value.trim() === '' ? null : value.trim()))
    .nullable()
    .optional()

const idString = z.string().regex(/^\d{1,20}$/)

const defectFields = {
  title: z.string().trim().min(3).max(500),
  description: optionalText(60_000),
  steps_to_reproduce: optionalText(60_000),
  expected_behavior: optionalText(60_000),
  actual_behavior: optionalText(60_000),
  module_id: idString.nullable().optional(),
  cycle_id: idString.nullable().optional(),
  severity_code: z.enum(DEFECT_SEVERITIES),
  priority_code: z.enum(DEFECT_PRIORITIES),
  environment_name: optionalText(100),
  build_version: optionalText(100),
  browser_name: optionalText(100),
  assigned_to: idString.nullable().optional(),
  fixed_in_version: optionalText(100),
}

export const defectCreateSchema = z.object({
  /** Empty = generated per project, e.g. BUG-KAR-0001. */
  bug_code: codeSchema(100).optional(),
  ...defectFields,
  severity_code: defectFields.severity_code.default('MEDIUM'),
  priority_code: defectFields.priority_code.default('MEDIUM'),
  source_kind: z.enum(DEFECT_SOURCE_KINDS).default('UAT'),
  /** Test attempts this bug was found in (TB-BUG-001). Empty = standalone (TB-BUG-002). */
  execution_ids: z.array(idString).max(20).optional(),
  /** Evidence to attach right away, e.g. the screenshots of the failed attempt (doc 07). */
  evidence: z.array(evidenceRefSchema).max(UPLOAD_LIMITS.attachPerRequest).optional(),
})

export const defectUpdateSchema = z
  .object({
    title: defectFields.title.optional(),
    description: defectFields.description,
    steps_to_reproduce: defectFields.steps_to_reproduce,
    expected_behavior: defectFields.expected_behavior,
    actual_behavior: defectFields.actual_behavior,
    module_id: defectFields.module_id,
    cycle_id: defectFields.cycle_id,
    severity_code: defectFields.severity_code.optional(),
    priority_code: defectFields.priority_code.optional(),
    environment_name: defectFields.environment_name,
    build_version: defectFields.build_version,
    browser_name: defectFields.browser_name,
    assigned_to: defectFields.assigned_to,
    fixed_in_version: defectFields.fixed_in_version,
    /** Last `updated_at` the editor saw; a newer value means someone else saved first. */
    expected_updated_at: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => Object.keys(v).some((key) => key !== 'expected_updated_at'), 'Nothing to update')

export const defectStatusSchema = z
  .object({
    status_code: z.enum(DEFECT_STATUSES),
    /** Status the user saw; protects against two people moving the bug at once. */
    expected_status: z.enum(DEFECT_STATUSES).optional(),
    comment: optionalText(1000),
    fixed_in_version: optionalText(100),
  })
  .superRefine((value, ctx) => {
    if (DEFECT_REASON_REQUIRED.includes(value.status_code) && !value.comment) {
      ctx.addIssue({ code: 'custom', path: ['comment'], message: 'A reason is required' })
    }
  })

export const defectCommentSchema = z.object({ body: z.string().trim().min(1).max(20_000) })

export const defectLinkSchema = z.object({ execution_id: idString })

export type DefectCreateInput = z.input<typeof defectCreateSchema>
export type DefectUpdateInput = z.input<typeof defectUpdateSchema>
export type DefectStatusInput = z.input<typeof defectStatusSchema>
