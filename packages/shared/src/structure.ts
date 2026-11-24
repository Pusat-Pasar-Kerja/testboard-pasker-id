import { z } from 'zod'
import type { IdString } from './api.js'
import type { CycleStatus, RunStatus } from './enums.js'
import { emailSchema } from './schemas.js'
import {
  PUBLIC_FIELDS,
  type ModuleRef,
  type PublicField,
  type ResultCounts,
  type TableMemberAccount,
  type WorkshopFeatureDto,
  type WorkshopInboxItem,
} from './workshop.js'

/**
 * The project laid out like Google Drive (owner, 2026-11-24, ADR 0019):
 *
 *   Proyek
 *   ├─ Fase      > Fitur > Skenario (with steps and screenshots); a scenario lives in one Fase
 *   ├─ UAT       one testing event for one Fase: chosen features, participants, groups
 *   │            (kelompok, with a table number), results and its own public view
 *   └─ Bug Reporting   problems from UAT and, after go-live, from the public
 *
 * Only three kinds of people: Super Admin and Admin manage; a Pengguna takes part in the
 * UATs they were added to.
 */

const idString = z.string().regex(/^\d{1,20}$/)
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .transform((value) => (value.trim() === '' ? null : value.trim()))
    .nullable()
    .optional()
const isoDateTime = z.iso.datetime({ offset: true })

// ---- Fase > Fitur > Skenario ----------------------------------------------------------------

export interface PhaseFeatureDto {
  module: ModuleRef
  /** Scenarios of this feature saved in this Fase (archived ones not counted). */
  scenarios: number
  /** Of those, the ones ready to be tested. */
  ready: number
}

export interface PhaseDto {
  /** null = "Belum masuk fase": scenarios not saved in any Fase yet. */
  id: IdString | null
  cycle_code: string | null
  title: string | null
  status_code: CycleStatus | null
  starts_on: string | null
  ends_on: string | null
  scenarios: number
  /** Scenarios of this Fase that have no feature yet. */
  unsorted: number
  uats: number
  features: PhaseFeatureDto[]
}

export interface PhaseTreeDto {
  phases: PhaseDto[]
  unassigned: PhaseDto
}

/** Add a feature folder to a Fase; a new code creates the feature in the project. */
export const phaseFeatureSchema = z.object({
  module_code: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9][A-Z0-9_.-]*$/)),
  name: z.string().trim().min(1).max(200).optional(),
})
export type PhaseFeatureInput = z.input<typeof phaseFeatureSchema>

// ---- UAT ----------------------------------------------------------------------------------

export interface UatPhaseRef {
  id: IdString
  cycle_code: string
  title: string
}

export interface UatSummaryDto {
  id: IdString
  name: string
  run_code: string
  status_code: RunStatus
  phase: UatPhaseRef | null
  starts_at: string | null
  ends_at: string | null
  is_public: boolean
  features: number
  groups: number
  participants: number
  progress: ResultCounts
  /** For a Pengguna: the group they sit in at this UAT (null = no group yet). */
  my_group?: {
    id: IdString
    name: string
    table_number: number | null
    /** The features this group works on (its scenarios are the ones to try). */
    modules?: ModuleRef[]
  } | null
}

export interface UatParticipantDto {
  id: IdString
  name: string
  /** Full e-mail, for Admins only. */
  email: string | null
  user_id: IdString | null
  account: TableMemberAccount
  group: { id: IdString; name: string; table_number: number | null } | null
}

export interface UatDetailDto extends UatSummaryDto {
  environment_name: string | null
  build_version: string | null
  public_fields: PublicField[]
  public_intro: string | null
  feature_list: WorkshopFeatureDto[]
}

export const uatCreateSchema = z
  .object({
    cycle_id: idString,
    name: z.string().trim().min(1).max(255),
    module_ids: z.array(idString).min(1).max(200),
    starts_at: isoDateTime.nullable().optional(),
    ends_at: isoDateTime.nullable().optional(),
  })
  .refine((v) => !v.starts_at || !v.ends_at || Date.parse(v.starts_at) <= Date.parse(v.ends_at), {
    path: ['ends_at'],
    message: 'End before start',
  })
export type UatCreateInput = z.input<typeof uatCreateSchema>

export const uatUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    /** The features tested in this UAT; scenarios follow (results are never removed). */
    module_ids: z.array(idString).min(1).max(200).optional(),
    starts_at: isoDateTime.nullable().optional(),
    ends_at: isoDateTime.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')
export type UatUpdateInput = z.input<typeof uatUpdateSchema>

const participantInput = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.preprocess(
    (value) => (typeof value === 'string' && value.trim() === '' ? null : value),
    emailSchema.nullable().optional(),
  ),
  group_id: idString.nullable().optional(),
})

/** Add people to a UAT: a name, optionally an e-mail (becomes their account) and a group. */
export const uatParticipantsAddSchema = z.object({
  people: z
    .array(participantInput)
    .min(1)
    .max(300)
    .superRefine((people, ctx) => {
      const names = new Set<string>()
      const emails = new Set<string>()
      people.forEach((person, index) => {
        const name = person.name.toLocaleLowerCase('id')
        if (names.has(name)) {
          ctx.addIssue({ code: 'custom', path: [index, 'name'], message: 'DUPLICATE_NAME' })
        }
        names.add(name)
        const email = person.email?.toLowerCase()
        if (email && emails.has(email)) {
          ctx.addIssue({ code: 'custom', path: [index, 'email'], message: 'DUPLICATE_EMAIL' })
        }
        if (email) emails.add(email)
      })
    }),
})
export type UatParticipantsInput = z.input<typeof uatParticipantsAddSchema>

export const uatParticipantUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    group_id: idString.nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update')

/** A group (kelompok) gets an optional table number printed on its card. */
export const tableNumberSchema = z.number().int().min(1).max(999).nullable().optional()

// ---- Bug Reporting --------------------------------------------------------------------------

/** The public-view fields of Bug Reporting (the "bugs.*" fields of the old Fase settings). */
export const BUG_PUBLIC_FIELDS = PUBLIC_FIELDS.filter((field) => field.startsWith('bugs.'))

export interface BugReportingSettings {
  /** Bug Reporting shown on the public pages (owner: a public ON/OFF switch). */
  is_public: boolean
  public_fields: PublicField[]
  public_intro: string | null
  /** The public may send reports (after go-live); an Admin reviews each one first. */
  accept_reports: boolean
}

export const bugReportingSettingsSchema = z.object({
  is_public: z.boolean(),
  public_fields: z.array(z.string().max(60)).max(60),
  public_intro: optionalText(2000),
  accept_reports: z.boolean(),
})

/**
 * A report from the public form. `website` is a trap field people never see: anything in it
 * means a robot, and the report is dropped quietly.
 */
export const publicBugReportSchema = z.object({
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(5000),
  feature: optionalText(200),
  reporter_name: optionalText(100),
  contact: optionalText(200),
  website: z.string().max(200).optional(),
})
export type PublicBugReportInput = z.input<typeof publicBugReportSchema>

export interface PublicBugReportingDto {
  project: { code: string; name: string }
  intro: string | null
  fields: PublicField[]
  accept_reports: boolean
  bug_count: number
  bug_open: number
  /** Feature names of the public problems (only with "Fitur" switched on), for the filter. */
  features?: string[]
}

/** A public report waiting for an Admin, with the reporter's details (never public). */
export interface PublicReportItem extends WorkshopInboxItem {
  reporter: string | null
  contact: string | null
}
