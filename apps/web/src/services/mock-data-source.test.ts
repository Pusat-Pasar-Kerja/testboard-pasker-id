import { isOpenDefect, totalOf } from '@testboard/shared'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { ApiClientError } from './api-client'
import { createMockDataSource, paginate } from './mock-data-source'

const ds = () => createMockDataSource({ latencyMs: 0 })
const MAIN = 'DEMO-KARIR'
const OTHER = 'DEMO-LATIH'

describe('mock data is deterministic and fictitious', () => {
  it('generates identical data for the same seed', () => {
    expect(createMockDb()).toEqual(createMockDb())
  })

  it('only contains people labelled Demo and non-routable demo addresses', () => {
    const db = createMockDb()
    for (const user of db.users) {
      expect(user.display_name).toMatch(/^Demo /)
      expect(user.email).toMatch(/@demo\.invalid$/)
    }
  })
})

describe('project scoping (TB-PRJ-001 / TB-RBAC-002 behaviour in demo)', () => {
  it('lists member projects with counts', async () => {
    const projects = await ds().listProjects()
    expect(projects.map((p) => p.project_code)).toEqual([MAIN, OTHER])
    expect(projects[0]?.counts.test_cases).toBeGreaterThan(0)
  })

  it('returns 404 for an unknown project', async () => {
    await expect(ds().getProject('NOPE')).rejects.toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })

  it('never returns another project entity through a project-scoped route', async () => {
    const source = ds()
    const otherCase = (await source.listTestCases(OTHER)).data[0]
    expect(otherCase).toBeDefined()
    const error = await source.getTestCase(MAIN, otherCase?.id ?? '').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiClientError)
    expect(error).toMatchObject({ status: 404 })
  })
})

describe('test case library', () => {
  it('hides archived cases by default and filters by module, type and keyword', async () => {
    const source = ds()
    const all = await source.listTestCases(MAIN, { page_size: 100 })
    expect(all.data.every((c) => c.case_status !== 'ARCHIVED')).toBe(true)

    const auth = await source.listTestCases(MAIN, { module: 'AUTH', page_size: 100 })
    expect(auth.total).toBeGreaterThan(0)
    expect(auth.data.every((c) => c.module?.module_code === 'AUTH')).toBe(true)

    const rbac = await source.listTestCases(MAIN, { type: 'RBAC', page_size: 100 })
    expect(rbac.data.every((c) => c.test_type_code === 'RBAC')).toBe(true)

    const search = await source.listTestCases(MAIN, { q: 'uat-auth-001' })
    expect(search.data.map((c) => c.case_code)).toEqual(['UAT-AUTH-001'])

    const archived = await source.listTestCases(MAIN, { status: 'ARCHIVED' })
    expect(archived.total).toBe(1)
  })

  it('paginates with a capped page size', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    expect(paginate(items, { page: 2, page_size: 25 })).toEqual({
      data: [25, 26, 27, 28, 29],
      page: 2,
      page_size: 25,
      total: 30,
    })
    expect(paginate(items, { page_size: 1000 }).page_size).toBe(100)
    expect(paginate(items, { page: 99, page_size: 10 }).page).toBe(3)
  })
})

describe('runs and dashboard use latest status only (TB-DASH-001)', () => {
  it('counts every run case exactly once even when it has retests', async () => {
    const source = ds()
    const runs = await source.listRuns(MAIN)
    for (const summary of runs) {
      const run = await source.getRun(MAIN, summary.id)
      expect(totalOf(run.counts)).toBe(run.run_cases.length)
      const attempts = run.run_cases.reduce((sum, rc) => sum + rc.attempts, 0)
      expect(attempts).toBeGreaterThanOrEqual(totalOf(run.counts) - run.counts.NOT_RUN)
    }
  })

  it('keeps the earlier FAILED attempt but reports the retest result as latest', async () => {
    const db = createMockDb()
    const retest = db.executions.find((e) => e.attempt_number === 2 && e.result_status === 'PASSED')
    expect(retest).toBeDefined()
    const first = db.executions.find(
      (e) => e.runCaseId === retest?.runCaseId && e.attempt_number === 1,
    )
    expect(first?.result_status).toBe('FAILED')

    const runCase = db.runCases.find((rc) => rc.id === retest?.runCaseId)
    const project = db.projects.find((p) =>
      db.runs.some((r) => r.id === runCase?.runId && r.projectId === p.id),
    )
    const run = await createMockDataSource({ latencyMs: 0, db }).getRun(
      project?.project_code ?? '',
      runCase?.runId ?? '',
    )
    const row = run.run_cases.find((r) => r.run_case_id === runCase?.id)
    expect(row?.latest_status).toBe('PASSED')
    expect(row?.attempts).toBe(2)
  })

  it('aggregates the dashboard from all runs or a single selected run', async () => {
    const source = ds()
    const all = await source.getDashboard(MAIN)
    expect(all.total_run_cases).toBe(all.runs.reduce((sum, r) => sum + r.total_cases, 0))
    expect(totalOf(all.counts)).toBe(all.total_run_cases)

    const one = all.runs[0]
    const scoped = await source.getDashboard(MAIN, { run_id: one?.id })
    expect(scoped.total_run_cases).toBe(one?.total_cases)
    expect(scoped.counts).toEqual(one?.counts)
  })
})

describe('defects', () => {
  it('filters open defects and sorts by most recently updated', async () => {
    const page = await ds().listDefects(MAIN, { status: 'open', page_size: 100 })
    expect(page.total).toBeGreaterThan(0)
    expect(page.data.every((d) => isOpenDefect(d.status_code))).toBe(true)
    const updated = page.data.map((d) => d.updated_at)
    expect(updated).toEqual([...updated].sort().reverse())
  })

  it('links UAT defects to executions and allows standalone user-report bugs (TB-BUG-002)', async () => {
    const source = ds()
    const list = (await source.listDefects(MAIN, { page_size: 100 })).data
    const details = await Promise.all(list.map((d) => source.getDefect(MAIN, d.id)))
    const standalone = details.filter((d) => d.source_kind === 'USER_REPORT')
    expect(standalone.length).toBeGreaterThan(0)
    expect(standalone.every((d) => d.linked_executions.length === 0)).toBe(true)
    const fromUat = details.filter((d) => d.source_kind === 'UAT')
    expect(fromUat.every((d) => d.linked_executions.length >= 1)).toBe(true)
    expect(details.every((d) => d.history[0]?.from_status === null)).toBe(true)
  })
})

describe('runs and executions (Milestone 3, same rules as the API)', () => {
  const setup = () => {
    const db = createMockDb()
    const source = createMockDataSource({ latencyMs: 0, db })
    const runOf = (runCode: string) => {
      const run = db.runs.find((r) => r.run_code === runCode)
      if (!run) throw new Error(runCode)
      return run
    }
    const freshCase = (runCode: string, assignedTo?: string) => {
      const run = runOf(runCode)
      const rc = db.runCases.find(
        (x) =>
          x.runId === run.id &&
          !db.executions.some((e) => e.runCaseId === x.id) &&
          (assignedTo === undefined || x.assignedTo === assignedTo),
      )
      if (!rc) throw new Error('no fresh run case')
      return rc
    }
    return { db, source, runOf, freshCase }
  }

  it('creates a PLANNED run with a generated code and enforces the lifecycle', async () => {
    const { source } = setup()
    const run = await source.createRun(MAIN, { name: 'Regresi M3' })
    expect(run.status_code).toBe('PLANNED')
    expect(run.run_code).toMatch(/^RUN-\d{8}-1$/)
    await expect(source.changeRunStatus(MAIN, run.id, 'COMPLETED')).rejects.toMatchObject({
      status: 409,
    })
    const active = await source.changeRunStatus(MAIN, run.id, 'ACTIVE')
    expect(active.starts_at).not.toBeNull()
  })

  it('adds only READY cases and freezes a snapshot', async () => {
    const { db, source } = setup()
    const run = await source.createRun(MAIN, { name: 'Snapshot' })
    const draft = db.cases.find((c) => c.case_status === 'DRAFT')
    const ready = db.cases.find(
      (c) => c.case_status === 'READY' && c.projectId === draft?.projectId,
    )
    const result = await source.addRunCases(MAIN, run.id, {
      test_case_ids: [ready?.id ?? '', draft?.id ?? '', ready?.id ?? ''],
    })
    expect(result.added).toBe(1)
    expect(result.skipped).toEqual([{ test_case_id: draft?.id, reason: 'NOT_READY' }])
    const again = await source.addRunCases(MAIN, run.id, { test_case_ids: [ready?.id ?? ''] })
    expect(again.skipped[0]?.reason).toBe('ALREADY_IN_RUN')

    const rc = db.runCases.find((x) => x.runId === run.id)
    if (ready) ready.title = 'Diubah setelah masuk run'
    const detail = await source.getRunCase(MAIN, rc?.id ?? '')
    expect(detail.snapshot.title).not.toBe('Diubah setelah masuk run')
  })

  it('records append-only attempts, requires an actual result for FAILED and replays a repeated key', async () => {
    const { source, freshCase } = setup()
    const rc = freshCase('RUN-S2-20261109')
    await expect(
      source.createExecution(MAIN, rc.id, { result_status: 'FAILED' }, 'k-0'),
    ).rejects.toMatchObject({ status: 422 })

    const first = await source.createExecution(
      MAIN,
      rc.id,
      { result_status: 'FAILED', actual_result: 'Tombol tidak merespons' },
      'k-1',
    )
    const replay = await source.createExecution(
      MAIN,
      rc.id,
      { result_status: 'FAILED', actual_result: 'Tombol tidak merespons' },
      'k-1',
    )
    expect(replay.id).toBe(first.id)
    const retest = await source.createExecution(MAIN, rc.id, { result_status: 'PASSED' }, 'k-2')
    expect([first.attempt_number, retest.attempt_number]).toEqual([1, 2])
    expect([first.execution_kind, retest.execution_kind]).toEqual(['INITIAL', 'RETEST'])

    const detail = await source.getRunCase(MAIN, rc.id)
    expect(detail.latest_status).toBe('PASSED')
    expect(detail.attempts.map((a) => a.result_status)).toEqual(['PASSED', 'FAILED'])
  })

  it('only records while ACTIVE and only for the assigned tester', async () => {
    const { db, source, freshCase } = setup()
    const completed = db.runCases.find(
      (x) => x.runId === db.runs.find((r) => r.status_code === 'COMPLETED')?.id,
    )
    await expect(
      source.createExecution(MAIN, completed?.id ?? '', { result_status: 'PASSED' }, 'k-3'),
    ).rejects.toMatchObject({ status: 409 })

    db.currentUserId = '3'
    const others = freshCase('RUN-S2-20261109', '4')
    await expect(
      source.createExecution(MAIN, others.id, { result_status: 'PASSED' }, 'k-4'),
    ).rejects.toMatchObject({ status: 403 })
    const mine = freshCase('RUN-S2-20261109', '3')
    const saved = await source.createExecution(MAIN, mine.id, { result_status: 'PASSED' }, 'k-5')
    expect(saved.tester?.id).toBe('3')
  })

  it('refuses to remove a run case that already has results', async () => {
    const { db, source, runOf } = setup()
    const run = runOf('RUN-S2-20261109')
    const tested = db.runCases.find(
      (x) => x.runId === run.id && db.executions.some((e) => e.runCaseId === x.id),
    )
    const error = await source.removeRunCase(MAIN, run.id, tested?.id ?? '').catch((e) => e)
    expect(error).toBeInstanceOf(ApiClientError)
    expect((error as ApiClientError).status).toBe(409)
  })
})
