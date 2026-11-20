import { describe, expect, it } from 'vitest'
import { canTransitionRun, executionCreateSchema, RUN_STATUSES } from '../src/index.js'

describe('run lifecycle', () => {
  it('allows only the documented transitions', () => {
    const allowed = RUN_STATUSES.flatMap((from) =>
      RUN_STATUSES.filter((to) => canTransitionRun(from, to)).map((to) => `${from}->${to}`),
    )
    expect(allowed).toEqual([
      'PLANNED->ACTIVE',
      'ACTIVE->COMPLETED',
      'COMPLETED->ACTIVE',
      'COMPLETED->LOCKED',
    ])
  })
})

describe('execution schema (doc 02)', () => {
  const fieldOf = (input: unknown) => {
    const result = executionCreateSchema.safeParse(input)
    return result.success ? null : result.error.issues.map((i) => i.path.join('.'))
  }

  it('requires the actual result for FAILED and a reason for BLOCKED/SKIPPED', () => {
    expect(fieldOf({ result_status: 'FAILED' })).toEqual(['actual_result'])
    expect(fieldOf({ result_status: 'FAILED', actual_result: '   ' })).toEqual(['actual_result'])
    expect(fieldOf({ result_status: 'BLOCKED' })).toEqual(['notes'])
    expect(fieldOf({ result_status: 'SKIPPED', notes: 'Ditunda' })).toBeNull()
    expect(fieldOf({ result_status: 'PASSED' })).toBeNull()
  })

  it('never accepts NOT_RUN as a recorded attempt and rejects duplicate step numbers', () => {
    expect(fieldOf({ result_status: 'NOT_RUN' })).not.toBeNull()
    expect(
      fieldOf({
        result_status: 'PASSED',
        step_results: [
          { step_number: 1, result_status: 'PASSED' },
          { step_number: 1, result_status: 'FAILED' },
        ],
      }),
    ).toEqual(['step_results'])
  })
})
