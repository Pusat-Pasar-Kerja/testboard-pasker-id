import { z } from 'zod'
import type { IdString } from './api.js'
import type { DefectSeverity, DefectStatus, ExecutionStatus, RunStatus } from './enums.js'
import { DEFECT_PRIORITIES, DEFECT_SEVERITIES } from './enums.js'
import { evidenceRefSchema } from './files.js'
import { emailSchema, passwordSchema } from './schemas.js'
import { wordTokens } from './similarity.js'

/**
 * Mode Workshop (ADR 0016): UAT in a forum workshop, done in groups ("meja") by people who
 * are often not technical. A Fase (test cycle) can be shown to the public, field by field.
 */

const idString = z.string().regex(/^\d{1,20}$/)
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => (value.trim() === '' ? null : value.trim()))
    .nullable()
    .optional()

// ---- Public visibility (per field, everything hidden by default) ------------------------

export const PUBLIC_FIELD_GROUPS = [
  { group: 'cycle', fields: ['cycle.description', 'cycle.period', 'cycle.progress'] },
  {
    group: 'features',
    fields: [
      'features.list',
      'features.progress',
      'features.cases',
      'features.tables',
      'features.members',
    ],
  },
  {
    group: 'bugs',
    fields: [
      'bugs.list',
      'bugs.code',
      'bugs.feature',
      'bugs.description',
      'bugs.severity',
      'bugs.priority',
      'bugs.reporter',
      'bugs.date',
      'bugs.confirmations',
      'bugs.evidence',
    ],
  },
] as const

export type PublicFieldGroup = (typeof PUBLIC_FIELD_GROUPS)[number]['group']
export type PublicField = (typeof PUBLIC_FIELD_GROUPS)[number]['fields'][number]
export const PUBLIC_FIELDS = PUBLIC_FIELD_GROUPS.flatMap((g) => g.fields) as PublicField[]

/** A field only makes sense when the field it builds on is shown too. */
export const PUBLIC_FIELD_REQUIRES: Partial<Record<PublicField, PublicField>> = {
  'features.progress': 'features.list',
  'features.cases': 'features.list',
  'features.tables': 'features.list',
  'features.members': 'features.tables',
  'bugs.code': 'bugs.list',
  'bugs.feature': 'bugs.list',
  'bugs.description': 'bugs.list',
  'bugs.severity': 'bugs.list',
  'bugs.priority': 'bugs.list',
  'bugs.reporter': 'bugs.list',
  'bugs.date': 'bugs.list',
  'bugs.confirmations': 'bugs.list',
  'bugs.evidence': 'bugs.list',
}

/** Known fields only, in canonical order, without fields whose base field is hidden. */
export function normalizePublicFields(fields: readonly string[]): PublicField[] {
  const chosen = new Set(fields)
  const enabled = (field: PublicField): boolean => {
    if (!chosen.has(field)) return false
    const base = PUBLIC_FIELD_REQUIRES[field]
    return base ? enabled(base) : true
  }
  return PUBLIC_FIELDS.filter(enabled)
}

export const cyclePublicSchema = z.object({
  is_public: z.boolean(),
  public_fields: z.array(z.string().max(60)).max(60),
  public_intro: optionalText(2000),
})
export type CyclePublicInput = z.input<typeof cyclePublicSchema>

export const WORKSHOP_FEATURE_STATES = ['OPEN', 'DONE', 'HIDDEN'] as const
export type WorkshopFeatureState = (typeof WORKSHOP_FEATURE_STATES)[number]

export const workshopFeatureStateSchema = z.object({
  module_id: idString,
  state_code: z.enum(WORKSHOP_FEATURE_STATES),
})

// ---- Tables (meja) -----------------------------------------------------------------------

export const memberNamesSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(30)
  .transform((names) => [...new Set(names)])

/**
 * One person at a table (owner, 2026-11-24): a name, and optionally the e-mail an Admin
 * entered. An e-mail makes the person a User account (Penguji in the project) that they
 * activate later; participants at the table never type e-mails.
 */
export const tableMemberInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    emailSchema.nullable().optional(),
  ),
})
export type TableMemberInput = z.input<typeof tableMemberInputSchema>
export type TableMember = z.output<typeof tableMemberInputSchema>

export const tableMembersSchema = z
  .array(tableMemberInputSchema)
  .max(30)
  .superRefine((members, ctx) => {
    const names = new Set<string>()
    const emails = new Set<string>()
    members.forEach((member, index) => {
      const name = member.name.toLocaleLowerCase('id')
      if (names.has(name)) {
        ctx.addIssue({ code: 'custom', path: [index, 'name'], message: 'DUPLICATE_NAME' })
      }
      names.add(name)
      const email = member.email?.toLowerCase()
      if (email && emails.has(email)) {
        ctx.addIssue({ code: 'custom', path: [index, 'email'], message: 'DUPLICATE_EMAIL' })
      }
      if (email) emails.add(email)
    })
  })

const isoDateTime = z.iso.datetime({ offset: true })

export const workshopTableCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    run_id: idString.nullable(),
    module_ids: z.array(idString).max(200),
    members: tableMembersSchema.default([]),
    valid_from: isoDateTime.nullable().optional(),
    valid_until: isoDateTime,
  })
  .refine((v) => !v.valid_from || Date.parse(v.valid_from) < Date.parse(v.valid_until), {
    path: ['valid_until'],
    message: 'The card must end after it starts',
  })
export type WorkshopTableInput = z.input<typeof workshopTableCreateSchema>

export const workshopTableUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    run_id: idString.nullable().optional(),
    module_ids: z.array(idString).max(200).optional(),
    members: tableMembersSchema.optional(),
    valid_from: isoDateTime.nullable().optional(),
    valid_until: isoDateTime.optional(),
    /** New 6-digit code; printed cards with the old code stop working. */
    regenerate_code: z.boolean().optional(),
    /** true = card blocked and every device of this table signed out; false = allowed again. */
    revoked: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')
export type WorkshopTableUpdate = z.input<typeof workshopTableUpdateSchema>

export const workshopJoinSchema = z.object({
  code: z
    .string()
    .transform((value) => value.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{6}$/)),
})

/** From the table itself: the names without an account (members with one stay as they are). */
export const workshopMembersSchema = z.object({ member_names: memberNamesSchema })

/** "Aktifkan akun saya" at the table: a listed member without a password chooses one. */
export const workshopActivateSchema = z.object({ password: passwordSchema })

/** A signed-in User opens the Mode Mudah of a table they are listed at ("Tugas saya"). */
export const workshopJoinAsMemberSchema = z.object({ table_id: idString })

/** Tester name chosen on the device ("Yang mengisi"); text only, never an account. */
const testerName = z
  .string()
  .trim()
  .max(100)
  .transform((value) => value || null)
  .nullable()
  .optional()

export const WORKSHOP_RESULTS = ['PASSED', 'FAILED', 'BLOCKED'] as const
export type WorkshopResult = (typeof WORKSHOP_RESULTS)[number]

export const workshopResultSchema = z
  .object({
    result_status: z.enum(WORKSHOP_RESULTS),
    /** "Apa yang terjadi?" (FAILED) or why it could not be tried (BLOCKED). */
    note: optionalText(5000),
    tester_name: testerName,
    evidence: z.array(evidenceRefSchema).max(10).optional(),
    /** FAILED only: report a new problem, or add "+1" to one already reported. */
    same_as_defect_id: idString.nullable().optional(),
    /** Client-generated id so a retried submission (offline outbox) is saved once. */
    client_id: z.string().max(64).optional(),
  })
  .refine((v) => v.result_status !== 'FAILED' || Boolean(v.note) || Boolean(v.same_as_defect_id), {
    path: ['note'],
    message: 'Describe what happened',
  })
export type WorkshopResultInput = z.input<typeof workshopResultSchema>

export const workshopBugSchema = z.object({
  module_id: idString.nullable(),
  note: z.string().trim().min(3).max(5000),
  title: optionalText(200),
  tester_name: testerName,
  evidence: z.array(evidenceRefSchema).max(10).optional(),
  client_id: z.string().max(64).optional(),
})
export type WorkshopBugInput = z.input<typeof workshopBugSchema>

export const workshopConfirmSchema = z.object({
  note: optionalText(2000),
  tester_name: testerName,
  evidence: z.array(evidenceRefSchema).max(10).optional(),
})
export type WorkshopConfirmInput = z.input<typeof workshopConfirmSchema>

/** Facilitator triage of a problem reported by a table (stage "Masalah masuk"). */
export const defectReviewSchema = z
  .object({
    severity_code: z.enum(DEFECT_SEVERITIES).optional(),
    priority_code: z.enum(DEFECT_PRIORITIES).optional(),
    /** Close as a duplicate of another bug (its "+1" count grows). null = not a duplicate. */
    duplicate_of_id: idString.nullable().optional(),
    reviewed: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')
export type DefectReviewInput = z.input<typeof defectReviewSchema>

// ---- DTOs --------------------------------------------------------------------------------

export interface ResultCounts {
  total: number
  /** Scenarios with at least one answer (Berhasil / Gagal / Terhambat / Dilewati). */
  tried: number
  passed: number
  failed: number
  blocked: number
  skipped: number
}

export const emptyCounts = (): ResultCounts => ({
  total: 0,
  tried: 0,
  passed: 0,
  failed: 0,
  blocked: 0,
  skipped: 0,
})

/** Add one scenario's latest status to the counts. */
export function countResult(counts: ResultCounts, status: ExecutionStatus, n = 1): ResultCounts {
  counts.total += n
  if (status === 'PASSED') counts.passed += n
  else if (status === 'FAILED') counts.failed += n
  else if (status === 'BLOCKED') counts.blocked += n
  else if (status === 'SKIPPED') counts.skipped += n
  if (status !== 'NOT_RUN' && status !== 'IN_PROGRESS') counts.tried += n
  return counts
}

export type WorkshopTableState = 'ACTIVE' | 'NOT_YET' | 'EXPIRED' | 'REVOKED'

export function tableState(
  t: { valid_from: string | null; valid_until: string; revoked_at: string | null },
  now = Date.now(),
): WorkshopTableState {
  if (t.revoked_at) return 'REVOKED'
  if (t.valid_from && Date.parse(t.valid_from) > now) return 'NOT_YET'
  if (Date.parse(t.valid_until) <= now) return 'EXPIRED'
  return 'ACTIVE'
}

export interface ModuleRef {
  id: IdString
  module_code: string
  name: string
}

/** NONE = a name only; NOT_ACTIVATED = a User account without a password yet. */
export type TableMemberAccount = 'NONE' | 'NOT_ACTIVATED' | 'ACTIVE'

/** A table member as Admins see it (with the e-mail). */
export interface TableMemberDto {
  id: IdString
  name: string
  email: string | null
  user_id: IdString | null
  account: TableMemberAccount
}

/** A table member as the table itself sees it: never the full e-mail. */
export interface TableSessionMember {
  id: IdString
  name: string
  account: TableMemberAccount
  /** Masked e-mail ("b***@gmail.com") so a member recognises their own account. */
  email_hint: string | null
}

export interface WorkshopTableDto {
  id: IdString
  name: string
  cycle: { id: IdString; cycle_code: string; title: string }
  run: { id: IdString; run_code: string; name: string; status_code: RunStatus } | null
  modules: ModuleRef[]
  member_names: string[]
  members: TableMemberDto[]
  access_code: string
  valid_from: string | null
  valid_until: string
  revoked_at: string | null
  state: WorkshopTableState
  progress: ResultCounts
  open_bugs: number
  last_activity_at: string | null
  /** Devices currently signed in with this table's card. */
  devices: number
}

export interface WorkshopFeatureDto {
  module: ModuleRef
  state: WorkshopFeatureState
  progress: ResultCounts
}

export interface WorkshopSessionDto {
  table: { id: IdString; name: string; member_names: string[]; members: TableSessionMember[] }
  project: { code: string; name: string }
  cycle: { id: IdString; cycle_code: string; title: string }
  run: { id: IdString; name: string; status_code: RunStatus } | null
  features: WorkshopFeatureDto[]
  valid_until: string
}

export interface WorkshopAnswer {
  status: ExecutionStatus
  table_name: string | null
  tester_name: string | null
  note: string | null
  at: string | null
  /** Answered by this table (not another table sharing the feature). */
  mine: boolean
}

export interface WorkshopCaseDto {
  run_case_id: IdString
  case_code: string
  title: string
  actor_label: string | null
  preconditions: string | null
  steps: string[]
  expected_result: string | null
  latest: WorkshopAnswer | null
  /** Problems already reported for this scenario (any table). */
  bugs: { id: IdString; bug_code: string; title: string; status_code: DefectStatus }[]
}

export interface WorkshopFileRef {
  id: IdString
  original_filename: string
  ready: boolean
}

export interface WorkshopBugDto {
  id: IdString
  bug_code: string
  title: string
  description: string | null
  module: ModuleRef | null
  status_code: DefectStatus
  severity_code: DefectSeverity
  reported_at: string
  table_name: string | null
  tester_name: string | null
  confirmations: number
  confirmed_by_me: boolean
  duplicate_of: { id: IdString; bug_code: string } | null
  files: WorkshopFileRef[]
  /** Similarity to the text typed in "Apa yang terjadi?" (0..1), when searching. */
  score?: number
}

export interface WorkshopResultSaved {
  execution_id: IdString
  defect: { id: IdString; bug_code: string; created: boolean } | null
}

// ---- Facilitator board -------------------------------------------------------------------

export interface WorkshopBoardTable {
  id: IdString
  name: string
  member_names: string[]
  state: WorkshopTableState
  modules: ModuleRef[]
  progress: ResultCounts
  bugs: number
  last_activity_at: string | null
}

export interface WorkshopBoardDto {
  cycle: {
    id: IdString
    cycle_code: string
    title: string
    is_public: boolean
    public_fields: PublicField[]
    public_intro: string | null
  }
  totals: ResultCounts
  bugs: { total: number; to_review: number; confirmations: number }
  tables: WorkshopBoardTable[]
  features: WorkshopFeatureDto[]
  recent: {
    at: string
    kind: 'RESULT' | 'BUG' | 'CONFIRM'
    table_name: string | null
    tester_name: string | null
    title: string
    status: ExecutionStatus | null
  }[]
}

export interface WorkshopInboxItem extends WorkshopBugDto {
  priority_code: string
  scenario: { run_case_id: IdString; case_code: string; title: string } | null
  similar: { id: IdString; bug_code: string; title: string; score: number }[]
}

// ---- Public pages ------------------------------------------------------------------------

export interface PublicCycleSummary {
  id: IdString
  project: { code: string; name: string }
  cycle_code: string
  title: string
  intro: string | null
  status_code: string
  description?: string | null
  period?: { starts_on: string | null; ends_on: string | null }
  progress?: ResultCounts
  /** Only with "bugs.list": problems reported in the Fase (duplicates counted once). */
  bug_count?: number
  /** Only with "bugs.list": of those, the ones not finished yet. */
  bug_open?: number
  fields: PublicField[]
}

/** Problem statuses the public pages count as finished. */
export const PUBLIC_DONE_STATUSES = ['CLOSED', 'VERIFIED', 'WONT_FIX'] as const

export interface PublicFeatureDto {
  name: string
  module_code: string
  state: WorkshopFeatureState
  progress?: ResultCounts
  cases?: { title: string; status: ExecutionStatus }[]
  tables?: { name: string; members?: string[] }[]
}

export interface PublicCycleDetail extends PublicCycleSummary {
  features?: PublicFeatureDto[]
}

export interface PublicBugDto {
  id: IdString
  title: string
  status_code: DefectStatus
  bug_code?: string
  feature?: string | null
  description?: string | null
  severity_code?: DefectSeverity
  priority_code?: string
  reporter?: string | null
  reported_at?: string
  confirmations?: number
  files?: { id: IdString; name: string }[]
}

// ---- Suggestions: "Masalah mirip sudah dilaporkan" ----------------------------------------

/**
 * How close a typed description is to an existing problem: half Jaccard, half overlap of the
 * shorter text (short notes like "tombol simpan error" should still match a long report).
 */
export function textCloseness(a: string, b: string): number {
  const x = wordTokens(a)
  const y = wordTokens(b)
  if (x.size === 0 || y.size === 0) return 0
  let shared = 0
  for (const word of x) if (y.has(word)) shared += 1
  const jaccard = shared / (x.size + y.size - shared)
  const overlap = shared / Math.min(x.size, y.size)
  return 0.5 * jaccard + 0.5 * overlap
}

/** Random 6-digit card code (never starts with 0 so it reads well when printed). */
export function newAccessCode(random: () => number = Math.random): string {
  return String(100000 + Math.floor(random() * 900000))
}

// ---- "Tugas saya" (a User's own work, owner 2026-11-24) -----------------------------------

export interface MyTableTask {
  table: { id: IdString; name: string }
  member: { id: IdString; name: string }
  project: { code: string; name: string }
  cycle: { id: IdString; title: string }
  valid_from: string | null
  valid_until: string
  state: WorkshopTableState
}

export interface MyRunTask {
  project: { code: string; name: string }
  run: { id: IdString; name: string; status_code: RunStatus }
  assigned: number
  done: number
  /** First assigned scenario not tried yet (to continue straight away). */
  next_run_case_id: IdString | null
}

export interface MyTasksDto {
  tables: MyTableTask[]
  runs: MyRunTask[]
  bugs: { project: { code: string; name: string }; open: number; total: number }[]
}
