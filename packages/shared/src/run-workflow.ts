import { z } from 'zod'
import { evidenceRefSchema, UPLOAD_LIMITS } from './files.js'
import { codeSchema } from './schemas.js'
import { CYCLE_STATUSES, RUN_STATUSES, type ExecutionStatus, type RunStatus } from './enums.js'

/**
 * Run lifecycle (doc 02 section 3): PLANNED -> ACTIVE -> COMPLETED, which can be reopened
 * to ACTIVE for retests, or LOCKED once approved. LOCKED is final.
 * Tests are executed only while a run is ACTIVE.
 */
export const RUN_TRANSITIONS: Record<RunStatus, readonly RunStatus[]> = {
  PLANNED: ['ACTIVE'],
  ACTIVE: ['COMPLETED'],
  COMPLETED: ['ACTIVE', 'LOCKED'],
  LOCKED: [],
}

export function canTransitionRun(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to)
}

/** Results a tester can record. NOT_RUN is "no attempt yet", never a recorded attempt. */
export const RECORDABLE_RESULTS = ['PASSED', 'FAILED', 'BLOCKED', 'SKIPPED'] as const
export type RecordableResult = (typeof RECORDABLE_RESULTS)[number]

/** Per-step outcome, as in the blueprint execution example. */
export const STEP_RESULTS = ['PASSED', 'FAILED', 'BLOCKED', 'SKIPPED', 'NOT_RUN'] as const

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => (value.trim() === '' ? null : value.trim()))
    .nullable()
    .optional()

const idString = z.string().regex(/^\d{1,20}$/)

export const cycleCreateSchema = z
  .object({
    cycle_code: codeSchema(60),
    title: z.string().trim().min(1).max(200),
    description: optionalText(5000),
    starts_on: z.iso.date().nullable().optional(),
    ends_on: z.iso.date().nullable().optional(),
    status_code: z.enum(CYCLE_STATUSES).default('PLANNED'),
  })
  .refine((v) => !v.starts_on || !v.ends_on || v.starts_on <= v.ends_on, {
    path: ['ends_on'],
    message: 'End date must not be before the start date',
  })

export const cycleUpdateSchema = z
  .object({
    cycle_code: codeSchema(60).optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: optionalText(5000),
    starts_on: z.iso.date().nullable().optional(),
    ends_on: z.iso.date().nullable().optional(),
    status_code: z.enum(CYCLE_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

const runFields = {
  name: z.string().trim().min(1).max(255),
  cycle_id: idString.nullable().optional(),
  environment_name: optionalText(100),
  build_version: optionalText(100),
  environment_url: z
    .url({ protocol: /^https?$/ })
    .max(1000)
    .nullable()
    .optional()
    .or(z.literal('').transform(() => null)),
  starts_at: z.iso.datetime({ offset: true }).nullable().optional(),
  ends_at: z.iso.datetime({ offset: true }).nullable().optional(),
}

export const runCreateSchema = z.object({
  /** Empty = generated as RUN-YYYYMMDD-N. */
  run_code: codeSchema(80).optional(),
  ...runFields,
})

export const runUpdateSchema = z
  .object({ ...runFields, name: runFields.name.optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export const runStatusSchema = z.object({ status_code: z.enum(RUN_STATUSES) })

export const runCasesAddSchema = z.object({
  test_case_ids: z.array(idString).min(1).max(500),
  assigned_to: idString.nullable().optional(),
})

export const runCasesAssignSchema = z.object({
  run_case_ids: z.array(idString).min(1).max(500),
  assigned_to: idString.nullable(),
})

export const executionCreateSchema = z
  .object({
    result_status: z.enum(RECORDABLE_RESULTS),
    actual_result: optionalText(65_000),
    notes: optionalText(65_000),
    execution_kind: z.enum(['RETEST', 'RERUN']).optional(),
    browser_name: optionalText(100),
    device_name: optionalText(100),
    operating_system: optionalText(100),
    step_results: z
      .array(
        z.object({
          step_number: z.number().int().min(1).max(500),
          result_status: z.enum(STEP_RESULTS),
          actual_result: optionalText(10_000),
        }),
      )
      .max(500)
      .optional(),
    /** Evidence uploaded before saving (doc 06); must be READY + CLEAN in this project. */
    evidence: z.array(evidenceRefSchema).max(UPLOAD_LIMITS.attachPerRequest).optional(),
  })
  .superRefine((value, ctx) => {
    // doc 02: FAILED needs the actual result; BLOCKED and SKIPPED need a reason.
    if (value.result_status === 'FAILED' && !value.actual_result) {
      ctx.addIssue({ code: 'custom', path: ['actual_result'], message: 'Required for FAILED' })
    }
    if ((value.result_status === 'BLOCKED' || value.result_status === 'SKIPPED') && !value.notes) {
      ctx.addIssue({ code: 'custom', path: ['notes'], message: 'A reason is required' })
    }
    const numbers = (value.step_results ?? []).map((s) => s.step_number)
    if (new Set(numbers).size !== numbers.length) {
      ctx.addIssue({ code: 'custom', path: ['step_results'], message: 'Duplicate step number' })
    }
  })

export type ExecutionCreateInput = z.infer<typeof executionCreateSchema>

/** Results that count as "executed" for progress, never as passed unless PASSED. */
export function isConcluded(status: ExecutionStatus): boolean {
  return status === 'PASSED' || status === 'FAILED' || status === 'BLOCKED' || status === 'SKIPPED'
}
