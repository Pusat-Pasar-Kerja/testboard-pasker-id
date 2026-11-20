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
