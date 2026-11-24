import { describe, expect, it } from 'vitest'
import {
  MEMBER_ROLES,
  PERMISSIONS,
  roleCan,
  testCaseCreateSchema,
  testCaseUpdateSchema,
} from '../src/index.js'

describe('permission matrix (doc 09)', () => {
  it('keeps the scenario library with the managers; a Pengguna works inside a UAT (ADR 0019)', () => {
    expect(MEMBER_ROLES.filter((r) => roleCan(r, 'case.read'))).toEqual(['ADMIN', 'QA_LEAD'])
    expect(MEMBER_ROLES.filter((r) => roleCan(r, 'case.write'))).toEqual(['ADMIN', 'QA_LEAD'])
    expect(roleCan('TESTER', 'execution.run')).toBe(true)
    expect(roleCan('TESTER', 'defect.create')).toBe(true)
  })

  it('keeps member management and project settings with ADMIN only', () => {
    expect(PERMISSIONS['member.manage']).toEqual(['ADMIN'])
    expect(PERMISSIONS['project.update']).toEqual(['ADMIN'])
  })

  it('lets only managers download reports or read the activity log', () => {
    expect(MEMBER_ROLES.filter((r) => roleCan(r, 'report.export'))).toEqual(['ADMIN', 'QA_LEAD'])
    expect(MEMBER_ROLES.filter((r) => roleCan(r, 'audit.read'))).toEqual(['ADMIN', 'QA_LEAD'])
  })
})

describe('test case schemas', () => {
  it('upper-cases codes (DB collation is case-insensitive) and applies defaults', () => {
    const parsed = testCaseCreateSchema.parse({
      case_code: 'uat-auth-001',
      module_code: 'auth',
      title: 'Masuk',
      expected_result: 'Dasbor',
    })
    expect(parsed).toMatchObject({
      case_code: 'UAT-AUTH-001',
      module_code: 'AUTH',
      case_status: 'DRAFT',
      priority_code: 'MUST_HAVE',
      source_locale: 'id',
    })
  })

  it('rejects an update that changes nothing', () => {
    expect(testCaseUpdateSchema.safeParse({ change_reason: 'x' }).success).toBe(false)
    expect(testCaseUpdateSchema.safeParse({ title: 'Judul baru' }).success).toBe(true)
  })
})
