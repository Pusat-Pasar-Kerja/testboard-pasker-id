import { describe, expect, it } from 'vitest'
import {
  countStatuses,
  executedOf,
  isOpenDefect,
  latestStatus,
  passRate,
  totalOf,
} from '../src/index.js'

describe('latestStatus', () => {
  it('uses the highest attempt number, regardless of input order', () => {
    expect(
      latestStatus([
        { attempt_number: 2, result_status: 'PASSED' },
        { attempt_number: 1, result_status: 'FAILED' },
      ]),
    ).toBe('PASSED')
  })

  it('is NOT_RUN when a run case has no attempts', () => {
    expect(latestStatus([])).toBe('NOT_RUN')
  })
})

describe('run metrics (TB-DASH-001)', () => {
  // Case A: FAILED then PASSED on retest; case B: BLOCKED; case C: never executed.
  const latest = [
    latestStatus([
      { attempt_number: 1, result_status: 'FAILED' },
      { attempt_number: 2, result_status: 'PASSED' },
    ]),
    latestStatus([{ attempt_number: 1, result_status: 'BLOCKED' }]),
    latestStatus([]),
  ]
  const counts = countStatuses(latest)

  it('counts each run case once by its latest attempt', () => {
    expect(totalOf(counts)).toBe(3)
    expect(counts.PASSED).toBe(1)
    expect(counts.FAILED).toBe(0)
    expect(counts.BLOCKED).toBe(1)
    expect(counts.NOT_RUN).toBe(1)
  })

  it('never treats BLOCKED or NOT_RUN as passed', () => {
    expect(executedOf(counts)).toBe(2)
    expect(passRate(counts)).toBe(33.3)
  })

  it('has no pass rate without run cases', () => {
    expect(passRate(countStatuses([]))).toBeNull()
  })
})

describe('isOpenDefect', () => {
  it('treats fixed-but-unverified as still open and verified/closed as done', () => {
    expect(isOpenDefect('FIXED')).toBe(true)
    expect(isOpenDefect('READY_FOR_RETEST')).toBe(true)
    expect(isOpenDefect('VERIFIED')).toBe(false)
    expect(isOpenDefect('CLOSED')).toBe(false)
    expect(isOpenDefect('WONT_FIX')).toBe(false)
  })
})
