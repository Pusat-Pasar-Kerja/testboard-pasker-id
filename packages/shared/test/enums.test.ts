import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  DEFECT_PRIORITIES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  EXECUTION_KINDS,
  EXECUTION_STATUSES,
  FILE_PROCESSING_STATUSES,
  FILE_SCAN_STATUSES,
  LOCALES,
  MEMBER_ROLES,
  TEST_CASE_PRIORITIES,
  TEST_CASE_STATUSES,
  TEST_TYPES,
  isOneOf,
  toIdString,
} from '../src/index.js'

// The blueprint's canonical code list; enums must never silently drift from it.
const blueprint = JSON.parse(
  readFileSync(
    new URL('../../../docs/blueprint/examples/status_codes.json', import.meta.url),
    'utf8',
  ),
) as Record<string, string[]>

describe('enums match blueprint status_codes.json', () => {
  it.each([
    ['test_case_status', TEST_CASE_STATUSES],
    ['execution_status', EXECUTION_STATUSES],
    ['execution_kind', EXECUTION_KINDS],
    ['defect_status', DEFECT_STATUSES],
    ['defect_severity', DEFECT_SEVERITIES],
    ['defect_priority', DEFECT_PRIORITIES],
    ['test_case_priority', TEST_CASE_PRIORITIES],
    ['test_type', TEST_TYPES],
    ['member_role', MEMBER_ROLES],
    ['file_processing', FILE_PROCESSING_STATUSES],
    ['file_scan', FILE_SCAN_STATUSES],
    ['source_locale', LOCALES],
  ] as const)('%s', (key, values) => {
    expect([...values]).toEqual(blueprint[key])
  })
})

describe('isOneOf', () => {
  it('accepts whitelisted codes and rejects others', () => {
    const isExec = isOneOf(EXECUTION_STATUSES)
    expect(isExec('PASSED')).toBe(true)
    expect(isExec('passed')).toBe(false)
    expect(isExec(1)).toBe(false)
  })
})

describe('toIdString', () => {
  it('serialises bigint ids without precision loss', () => {
    expect(toIdString(18446744073709551615n)).toBe('18446744073709551615')
    expect(toIdString(42)).toBe('42')
    expect(toIdString('7')).toBe('7')
  })

  it('rejects unsafe or malformed ids', () => {
    expect(() => toIdString(2 ** 60)).toThrow(TypeError)
    expect(() => toIdString(-1)).toThrow(TypeError)
    expect(() => toIdString('12a')).toThrow(TypeError)
  })
})
