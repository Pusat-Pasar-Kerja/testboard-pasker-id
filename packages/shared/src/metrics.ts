import type { StatusCounts } from './dto.js'
import {
  DEFECT_SEVERITIES,
  EXECUTION_STATUSES,
  type DefectSeverity,
  type DefectStatus,
  type ExecutionStatus,
} from './enums.js'

/**
 * Analytics rules (docs/blueprint/docs/01_PRODUCT_VISION_PRD.md "Prinsip analitik"):
 * - one run case counts once, by its LATEST attempt (3 attempts != 3 test cases);
 * - pass-rate denominator = all run cases; NOT_RUN, BLOCKED and SKIPPED are never "passed".
 */

export function emptyStatusCounts(): StatusCounts {
  return Object.fromEntries(EXECUTION_STATUSES.map((s) => [s, 0])) as StatusCounts
}

export function countStatuses(latestStatuses: readonly ExecutionStatus[]): StatusCounts {
  const counts = emptyStatusCounts()
  for (const status of latestStatuses) counts[status] += 1
  return counts
}

/** Latest status of one run case from its attempts; no attempts means NOT_RUN. */
export function latestStatus(
  attempts: readonly { attempt_number: number; result_status: ExecutionStatus }[],
): ExecutionStatus {
  let latest: (typeof attempts)[number] | undefined
  for (const attempt of attempts) {
    if (!latest || attempt.attempt_number > latest.attempt_number) latest = attempt
  }
  return latest?.result_status ?? 'NOT_RUN'
}

export function totalOf(counts: StatusCounts): number {
  return EXECUTION_STATUSES.reduce((sum, s) => sum + counts[s], 0)
}

/** Run cases with a concluded result (anything except NOT_RUN and IN_PROGRESS). */
export function executedOf(counts: StatusCounts): number {
  return counts.PASSED + counts.FAILED + counts.BLOCKED + counts.SKIPPED
}

/** Pass rate in percent (0-100, one decimal) over ALL run cases; null when there are none. */
export function passRate(counts: StatusCounts): number | null {
  const total = totalOf(counts)
  if (total === 0) return null
  return Math.round((counts.PASSED / total) * 1000) / 10
}

/** Defect statuses that still need work or verification. */
export const OPEN_DEFECT_STATUSES: readonly DefectStatus[] = [
  'OPEN',
  'IN_PROGRESS',
  'FIXED',
  'READY_FOR_RETEST',
  'REOPENED',
]

export function isOpenDefect(status: DefectStatus): boolean {
  return OPEN_DEFECT_STATUSES.includes(status)
}

export function emptySeverityCounts(): Record<DefectSeverity, number> {
  return Object.fromEntries(DEFECT_SEVERITIES.map((s) => [s, 0])) as Record<DefectSeverity, number>
}
