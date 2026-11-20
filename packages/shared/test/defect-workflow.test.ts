import { describe, expect, it } from 'vitest'
import {
  canTransitionDefect,
  DEFECT_STATUSES,
  defectEditableFields,
  defectStatusSchema,
  defectTransitionsFor,
  type DefectActor,
} from '../src/index.js'

const actor = (role: DefectActor['role'], extra: Partial<DefectActor> = {}): DefectActor => ({
  role,
  isAssignee: false,
  isReporter: false,
  ...extra,
})

describe('bug status workflow (doc 02 section 4, TB-BUG-004)', () => {
  it('allows only the documented transitions', () => {
    const allowed = DEFECT_STATUSES.flatMap((from) =>
      DEFECT_STATUSES.filter((to) => canTransitionDefect(from, to)).map((to) => `${from}->${to}`),
    )
    expect(allowed).toEqual([
      'OPEN->IN_PROGRESS',
      'OPEN->WONT_FIX',
      'IN_PROGRESS->FIXED',
      'IN_PROGRESS->WONT_FIX',
      'FIXED->READY_FOR_RETEST',
      'READY_FOR_RETEST->VERIFIED',
      'READY_FOR_RETEST->REOPENED',
      'VERIFIED->REOPENED',
      'VERIFIED->CLOSED',
      'REOPENED->IN_PROGRESS',
      'REOPENED->WONT_FIX',
      'CLOSED->REOPENED',
      'WONT_FIX->REOPENED',
    ])
  })

  it('lets developers move only bugs assigned to them, and never verify their own fix', () => {
    expect(defectTransitionsFor('OPEN', actor('DEVELOPER'))).toEqual([])
    expect(defectTransitionsFor('OPEN', actor('DEVELOPER', { isAssignee: true }))).toEqual([
      'IN_PROGRESS',
    ])
    expect(
      defectTransitionsFor('READY_FOR_RETEST', actor('DEVELOPER', { isAssignee: true })),
    ).toEqual([])
  })

  it('lets testers verify or reopen, and only leads close or decline', () => {
    expect(defectTransitionsFor('READY_FOR_RETEST', actor('TESTER'))).toEqual([
      'VERIFIED',
      'REOPENED',
    ])
    expect(defectTransitionsFor('VERIFIED', actor('TESTER'))).toEqual(['REOPENED'])
    expect(defectTransitionsFor('VERIFIED', actor('QA_LEAD'))).toEqual(['CLOSED', 'REOPENED'])
    expect(defectTransitionsFor('OPEN', actor('VIEWER'))).toEqual([])
  })

  it('requires a reason to reopen or decline', () => {
    expect(defectStatusSchema.safeParse({ status_code: 'REOPENED' }).success).toBe(false)
    expect(defectStatusSchema.safeParse({ status_code: 'WONT_FIX', comment: ' ' }).success).toBe(
      false,
    )
    expect(
      defectStatusSchema.safeParse({ status_code: 'REOPENED', comment: 'Masih terjadi' }).success,
    ).toBe(true)
    expect(defectStatusSchema.safeParse({ status_code: 'FIXED' }).success).toBe(true)
  })
})

describe('bug field restrictions', () => {
  it('gives leads every field, the reporter the description, the assignee the fix version', () => {
    expect(defectEditableFields(actor('QA_LEAD'))).toContain('assigned_to')
    const reporter = defectEditableFields(actor('TESTER', { isReporter: true }))
    expect(reporter).toContain('title')
    expect(reporter).not.toContain('assigned_to')
    expect(defectEditableFields(actor('TESTER'))).toEqual([])
    expect(defectEditableFields(actor('DEVELOPER', { isAssignee: true }))).toEqual([
      'fixed_in_version',
    ])
    expect(defectEditableFields(actor('VIEWER', { isReporter: true }))).toEqual([])
  })
})
