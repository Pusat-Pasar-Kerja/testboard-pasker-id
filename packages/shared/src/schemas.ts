import { z } from 'zod'
import {
  LOCALES,
  MEMBER_ROLES,
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  TEST_TYPES,
} from './enums.js'

/**
 * Request validation shared by API (authoritative) and web forms (early feedback).
 * Codes are normalised to upper case because the database collation
 * (utf8mb4_general_ci) treats 'uat-1' and 'UAT-1' as the same value (ADR 0004).
 */

const trimmed = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => (value.trim() === '' ? null : value))
    .nullable()
    .optional()

export const codeSchema = (max: number) =>
  z
    .string()
    .trim()
    .min(2)
    .max(max)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/, 'Use letters, numbers, dot, dash or underscore')
    .transform((value) => value.toUpperCase())

export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .pipe(z.email())
  .transform((value) => value.toLowerCase())

/** OWASP: length over complexity; 12+ characters, upper bound to cap hashing cost. */
/** Owner decision 2026-11-21: at least 8 characters (login lockout guards guessing). */
export const passwordSchema = z.string().min(8).max(128)

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
})

export const profileUpdateSchema = z
  .object({
    display_name: trimmed(200).min(1).optional(),
    preferred_locale: z.enum(LOCALES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export const changePasswordSchema = z.object({
  current_password: z.string().min(1).max(128),
  new_password: passwordSchema,
})

export const projectCreateSchema = z.object({
  project_code: codeSchema(40),
  name: trimmed(200).min(1),
  description: optionalText(5000),
})

export const projectUpdateSchema = z
  .object({
    name: trimmed(200).min(1).optional(),
    description: optionalText(5000),
    is_archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export const memberAddSchema = z.object({
  email: emailSchema,
  role_code: z.enum(MEMBER_ROLES),
})

export const memberUpdateSchema = z.object({ role_code: z.enum(MEMBER_ROLES) })

export const moduleCreateSchema = z.object({
  module_code: codeSchema(40),
  name: trimmed(200).min(1),
  description: optionalText(5000),
})

export const moduleUpdateSchema = z
  .object({
    /** Existing test case codes (UAT-<MODULE>-NNN) keep their prefix; new ones use this. */
    module_code: codeSchema(40).optional(),
    name: trimmed(200).min(1).optional(),
    description: optionalText(5000),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export const suiteCreateSchema = z.object({
  name: trimmed(255).min(1),
  module_id: z.string().regex(/^\d+$/).nullable().optional(),
  description: optionalText(5000),
  reference_document: optionalText(500),
  reference_url: z.url().max(1000).nullable().optional(),
  reference_version: optionalText(100),
  owner_unit: optionalText(255),
  scope_description: optionalText(5000),
  preparation_date: z.iso.date().nullable().optional(),
  source_notes: optionalText(5000),
})

export const suiteUpdateSchema = suiteCreateSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

const caseFields = {
  module_code: codeSchema(40).nullable().optional(),
  suite_id: z.string().regex(/^\d+$/).nullable().optional(),
  sequence_number: z.number().int().min(0).max(4_294_967_295).nullable().optional(),
  category: optionalText(255),
  title: z.string().trim().min(3).max(5000),
  requirement_refs: optionalText(5000),
  priority_code: z.enum(TEST_CASE_PRIORITIES).default('MUST_HAVE'),
  test_type_code: z.enum(TEST_TYPES).default('POSITIVE'),
  actor_label: optionalText(500),
  preconditions: optionalText(65_000),
  test_steps_text: optionalText(65_000),
  expected_result: z.string().trim().min(1).max(65_000),
  source_locale: z.enum(LOCALES).default('id'),
}

export const testCaseCreateSchema = z.object({
  ...caseFields,
  /** Empty = generated as UAT-<MODULE>-NNN by the server. */
  case_code: codeSchema(100).optional(),
  case_status: z.enum(['DRAFT', 'READY']).default('DRAFT'),
})

export const testCaseUpdateSchema = z
  .object({
    module_code: caseFields.module_code,
    suite_id: caseFields.suite_id,
    sequence_number: caseFields.sequence_number,
    category: caseFields.category,
    title: caseFields.title.optional(),
    requirement_refs: caseFields.requirement_refs,
    priority_code: z.enum(TEST_CASE_PRIORITIES).optional(),
    test_type_code: z.enum(TEST_TYPES).optional(),
    actor_label: caseFields.actor_label,
    preconditions: caseFields.preconditions,
    test_steps_text: caseFields.test_steps_text,
    expected_result: caseFields.expected_result.optional(),
    source_locale: z.enum(LOCALES).optional(),
    case_status: z.enum(['DRAFT', 'READY']).optional(),
    change_reason: optionalText(500),
    /** Optimistic concurrency: reject the edit if someone saved a newer version first. */
    expected_version: z.number().int().min(1).optional(),
  })
  .refine(
    (v) => Object.keys(v).some((key) => !['change_reason', 'expected_version'].includes(key)),
    'Nothing to update',
  )

export const testCaseCloneSchema = z.object({ case_code: codeSchema(100).optional() })

export const testCaseStatusFilter = z.enum([...TEST_CASE_STATUSES, 'ALL'])

export const adminUserCreateSchema = z.object({
  email: emailSchema,
  display_name: trimmed(200).min(1),
  /** Omit to let the server generate a strong temporary password (returned once). */
  password: passwordSchema.optional(),
  is_super_admin: z.boolean().default(false),
  preferred_locale: z.enum(LOCALES).default('id'),
})

export const adminUserUpdateSchema = z
  .object({
    display_name: trimmed(200).min(1).optional(),
    is_active: z.boolean().optional(),
    is_super_admin: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

/** Super Admin edits of a project from the admin console. */
export const adminProjectUpdateSchema = z
  .object({
    /** Changes the project's links (/projects/<code>/...); existing bug codes stay as they are. */
    project_code: codeSchema(40).optional(),
    name: trimmed(200).min(1).optional(),
    description: optionalText(5000),
    /** Archived projects stay readable but no longer accept changes. */
    is_archived: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

export type LoginInput = z.infer<typeof loginSchema>
export type TestCaseCreateInput = z.infer<typeof testCaseCreateSchema>
export type TestCaseUpdateInput = z.infer<typeof testCaseUpdateSchema>

export type ProjectCreateInput = z.input<typeof projectCreateSchema>
export type AdminProjectUpdateInput = z.input<typeof adminProjectUpdateSchema>
