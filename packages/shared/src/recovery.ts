import { z } from 'zod'
import type { IdString } from './api.js'
import { emailSchema, passwordSchema } from './schemas.js'

/**
 * Account recovery (ADR 0012). Visitors who forgot their e-mail or password send a request
 * to the administrators from the login page; only a Super Admin helps, by issuing a
 * time-limited, single-use reset link. At most one link per account is active at a time.
 */
export const RECOVERY_KINDS = ['FORGOT_PASSWORD', 'FORGOT_EMAIL'] as const
export type RecoveryKind = (typeof RECOVERY_KINDS)[number]

export const RECOVERY_STATUSES = ['OPEN', 'RESOLVED', 'DISMISSED'] as const
export type RecoveryStatus = (typeof RECOVERY_STATUSES)[number]

/** Why a reset link no longer works (shown to the person who opened it). */
export const RESET_LINK_PROBLEMS = ['INVALID', 'EXPIRED', 'USED', 'REVOKED'] as const
export type ResetLinkProblem = (typeof RESET_LINK_PROBLEMS)[number]

const text = (max: number) => z.string().trim().max(max)
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()

/** Hidden "website" field: people leave it empty, form-filling bots do not. */
const honeypot = z.string().max(200).optional()

/** Public "Hubungi Administrator" form on the login page (no sign-in). */
export const recoveryRequestSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('FORGOT_PASSWORD'),
    email: emailSchema,
    name: text(120).min(1),
    contact: optionalText(200),
    message: optionalText(1000),
    website: honeypot,
  }),
  z.object({
    kind: z.literal('FORGOT_EMAIL'),
    name: text(120).min(1),
    /** How the administrator can reach the person (WhatsApp, another e-mail, unit...). */
    contact: text(200).min(3),
    message: optionalText(1000),
    website: honeypot,
  }),
])
export type RecoveryRequestInput = z.input<typeof recoveryRequestSchema>

const idString = z.string().regex(/^\d{1,20}$/)

/** Super Admin: close / reopen a request, link it to an account, leave a note. */
export const recoveryRequestUpdateSchema = z
  .object({
    status: z.enum(RECOVERY_STATUSES).optional(),
    user_id: idString.nullable().optional(),
    note: optionalText(500),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, 'Nothing to update')
export type RecoveryRequestUpdate = z.input<typeof recoveryRequestUpdateSchema>

/** Super Admin: issue a reset link. `replace` revokes the account's current link first. */
export const resetLinkIssueSchema = z
  .object({
    request_id: idString.optional(),
    replace: z.boolean().default(false),
  })
  .strict()
export type ResetLinkIssueInput = z.input<typeof resetLinkIssueSchema>

export const resetTokenSchema = z.object({ token: z.string().trim().min(20).max(200) })

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20).max(200),
  new_password: passwordSchema,
})

export interface ResetLinkDto {
  id: IdString
  user: { id: IdString; display_name: string; email: string }
  issued_at: string
  expires_at: string
  issued_by: { id: IdString; display_name: string } | null
  request_id: IdString | null
}

/** Response of issuing a link: the raw token is returned exactly once, never stored. */
export interface IssuedResetLink {
  link: ResetLinkDto
  token: string
}

export interface RecoveryRequestDto {
  id: IdString
  kind: RecoveryKind
  status: RecoveryStatus
  name: string
  email: string | null
  contact: string | null
  message: string | null
  /** How many times the same person sent it while it was open (duplicates are merged). */
  submit_count: number
  created_at: string
  last_submitted_at: string
  /** The account it belongs to: matched by e-mail, or linked by a Super Admin. */
  user: {
    id: IdString
    display_name: string
    email: string
    is_active: boolean
    is_permanent: boolean
  } | null
  /** The account's active reset link, if any. */
  active_link: ResetLinkDto | null
  handled_by: { id: IdString; display_name: string } | null
  handled_at: string | null
  note: string | null
}

export interface RecoverySummary {
  open_requests: number
  active_links: number
}

/** What the reset page shows to the holder of a valid link. */
export interface ResetLinkCheck {
  email: string
  display_name: string
  issued_at: string
  expires_at: string
}

/** Remaining validity of a link at `now` (fraction 0..1 of the whole validity period). */
export function linkValidity(
  issuedAt: string,
  expiresAt: string,
  now: number = Date.now(),
): { remainingMs: number; fraction: number; expired: boolean } {
  const start = Date.parse(issuedAt)
  const end = Date.parse(expiresAt)
  const remainingMs = Math.max(0, end - now)
  const total = Math.max(1, end - start)
  return { remainingMs, fraction: Math.min(1, remainingMs / total), expired: remainingMs <= 0 }
}
