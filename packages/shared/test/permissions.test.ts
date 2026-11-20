import { describe, expect, it } from 'vitest'
import {
  MEMBER_ROLES,
  PERMISSIONS,
  roleCan,
  testCaseCreateSchema,
  testCaseUpdateSchema,
} from '../src/index.js'

describe('permission matrix (doc 09)', () => {
  it('lets every member read, but only leads change test case definitions', () => {
    for (const role of MEMBER_ROLES) expect(roleCan(role, 'case.read')).toBe(true)
    expect(MEMBER_ROLES.filter((r) => roleCan(r, 'case.write'))).toEqual(['ADMIN', 'QA_LEAD'])
  })

  it('keeps member management and project settings with ADMIN only', () => {
    expect(PERMISSIONS['member.manage']).toEqual(['ADMIN'])
    expect(PERMISSIONS['project.update']).toEqual(['ADMIN'])
  })

  it('never lets VIEWER write anything', () => {
    const writes = Object.keys(PERMISSIONS).filter((p) => !/\.read$/.test(p))
    for (const permission of writes) {
      expect(roleCan('VIEWER', permission as keyof typeof PERMISSIONS), permission).toBe(false)
    }
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
