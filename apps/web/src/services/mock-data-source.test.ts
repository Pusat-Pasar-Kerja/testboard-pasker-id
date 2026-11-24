import { isOpenDefect, suggestMapping, totalOf } from '@testboard/shared'
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

  it('only records while ACTIVE and only for people of the UAT (and their group)', async () => {
    const { db, source, runOf, freshCase } = setup()
    const completed = db.runCases.find(
      (x) => x.runId === db.runs.find((r) => r.status_code === 'COMPLETED')?.id,
    )
    await expect(
      source.createExecution(MAIN, completed?.id ?? '', { result_status: 'PASSED' }, 'k-3'),
    ).rejects.toMatchObject({ status: 409 })

    // A Pengguna of the UAT without a group answers any of its scenarios (ADR 0019).
    db.currentUserId = '3'
    const others = freshCase('RUN-S2-20261109', '4')
    const saved = await source.createExecution(MAIN, others.id, { result_status: 'PASSED' }, 'k-4')
    expect(saved.tester?.id).toBe('3')

    // In a group, only the scenarios of the group's features.
    const run = runOf('RUN-S2-20261109')
    const meja3 = db.tables.find((t) => t.runId === run.id && t.name === 'Meja 3')!
    const seat = db.participants.find((p) => p.runId === run.id && p.userId === '3')!
    seat.tableId = meja3.id
    const outside = db.runCases.find(
      (rc) =>
        rc.runId === run.id &&
        rc.assignedTo !== '3' &&
        !meja3.moduleIds.includes(db.cases.find((c) => c.id === rc.caseId)?.moduleId ?? ''),
    )!
    await expect(
      source.createExecution(MAIN, outside.id, { result_status: 'PASSED' }, 'k-5'),
    ).rejects.toMatchObject({ status: 403 })

    // Someone who does not take part in the UAT may not answer at all.
    db.currentUserId = '5'
    const fresh = freshCase('RUN-S2-20261109')
    await expect(
      source.createExecution(MAIN, fresh.id, { result_status: 'PASSED' }, 'k-6'),
    ).rejects.toMatchObject({ status: 403 })
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

describe('bug workflow (Milestone 4, same rules as the API)', () => {
  const setup = (currentUserId = '1', superAdmin = true) => {
    const db = createMockDb()
    db.currentUserId = currentUserId
    const source = createMockDataSource({ latencyMs: 0, db, superAdmin })
    const main = db.projects.find((p) => p.project_code === MAIN)
    const bugOf = (status: string) => {
      const bug = db.defects.find((d) => d.projectId === main?.id && d.status_code === status)
      if (!bug) throw new Error(status)
      return bug
    }
    return { db, source, main, bugOf }
  }

  it('numbers new bugs after the existing ones and records the OPEN entry (TB-BUG-002)', async () => {
    const { db, source, main } = setup()
    const before = db.defects.filter((d) => d.projectId === main?.id).length
    const bug = await source.createDefect(MAIN, { title: 'Laporan pengguna baru' }, 'key-1')
    expect(bug.bug_code).toBe(`BUG-DKR-${String(before + 1).padStart(4, '0')}`)
    expect(bug.history).toEqual([expect.objectContaining({ from_status: null, to_status: 'OPEN' })])
    const again = await source.createDefect(MAIN, { title: 'Laporan pengguna baru' }, 'key-1')
    expect(again.id).toBe(bug.id)
  })

  it('links a new bug to the failed attempt it came from (TB-BUG-001)', async () => {
    const { db, source } = setup()
    const failed = db.executions.find((e) => e.result_status === 'FAILED')
    const bug = await source.createDefect(
      MAIN,
      { title: 'Gagal simpan', execution_ids: [failed?.id ?? ''] },
      'key-2',
    )
    expect(bug.linked_executions[0]?.execution_id).toBe(failed?.id)
    const workspace = await source.getRunCase(MAIN, failed?.runCaseId ?? '')
    expect(workspace.linked_defects.map((d) => d.id)).toContain(bug.id)
  })

  it('rejects invalid transitions, missing reasons and the wrong role (TB-BUG-003/004)', async () => {
    const { db, source, main, bugOf } = setup()
    const open = bugOf('OPEN')
    await expect(
      source.changeDefectStatus(MAIN, open.id, { status_code: 'CLOSED' }),
    ).rejects.toMatchObject({ status: 409 })
    const retest = db.defects.find((d) => d.projectId === main?.id && d.id !== open.id)
    if (!retest) throw new Error('no second bug')
    retest.status_code = 'READY_FOR_RETEST'
    await expect(
      source.changeDefectStatus(MAIN, retest.id, { status_code: 'REOPENED' }),
    ).rejects.toMatchObject({ status: 422 })
    const reopened = await source.changeDefectStatus(MAIN, retest.id, {
      status_code: 'REOPENED',
      comment: 'Uji ulang masih gagal',
    })
    expect(reopened.history.at(-1)).toMatchObject({
      to_status: 'REOPENED',
      change_comment: 'Uji ulang masih gagal',
    })

    const dev = setup('5', false)
    const notMine = dev.db.defects.find((d) => d.status_code === 'OPEN' && d.assignedTo !== '5')
    if (notMine) {
      await expect(
        dev.source.changeDefectStatus(MAIN, notMine.id, { status_code: 'IN_PROGRESS' }),
      ).rejects.toMatchObject({ status: 403 })
    }
  })

  it('applies field restrictions', async () => {
    const { db, source } = setup('3', false)
    const others = db.defects.find((d) => d.reportedBy !== '3')
    await expect(
      source.updateDefect(MAIN, others?.id ?? '', { title: 'Bukan pelapor' }),
    ).rejects.toMatchObject({ status: 403 })
    const mine = await source.createDefect(MAIN, { title: 'Bug milik penguji' }, 'key-3')
    const edited = await source.updateDefect(MAIN, mine.id, { title: 'Judul lebih jelas' })
    expect(edited.title).toBe('Judul lebih jelas')
    await expect(source.updateDefect(MAIN, mine.id, { assigned_to: '5' })).rejects.toMatchObject({
      status: 403,
    })
  })
})

describe('evidence (Milestone 5, simulated pipeline in the demo)', () => {
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const png = (name = 'layar.png', size = 4000) =>
    new File([new Uint8Array([...PNG, ...new Array(size).fill(7)])], name, { type: 'image/png' })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

  it('checks the real type, then finishes processing as READY + CLEAN with compression', async () => {
    const source = ds()
    const { files } = await source.uploadFile(MAIN, png())
    expect(files[0]?.processing_status).toBe('PROCESSING')
    await settle()
    const done = await source.getFileStatus(MAIN, files[0]?.id ?? '')
    expect(done).toMatchObject({
      processing_status: 'READY',
      scan_status: 'CLEAN',
      scan_engine: 'BASIC',
      compression_method: 'WEBP_LOSSLESS',
    })
    expect(done.stored_size_bytes).toBeLessThan(done.original_size_bytes)

    const fake = await source.uploadFile(
      MAIN,
      new File(['<?php echo 1; ?>'], 'bukan-gambar.png', { type: 'image/png' }),
    )
    expect(fake.files[0]).toMatchObject({
      processing_status: 'REJECTED',
      failure_reason: 'SIGNATURE_MISMATCH',
    })
    const exe = await source.uploadFile(MAIN, new File(['MZ'], 'setup.exe'))
    expect(exe.rejected).toEqual([
      { original_filename: 'setup.exe', failure_reason: 'TYPE_NOT_ALLOWED' },
    ])
  })

  it('attaches READY files only, tracks where they are used and protects used files', async () => {
    const db = createMockDb()
    const source = createMockDataSource({ latencyMs: 0, db })
    const { files } = await source.uploadFile(MAIN, png())
    const id = files[0]?.id ?? ''
    const bug = db.defects[0]
    await expect(
      source.attachDefectFiles(MAIN, bug?.id ?? '', [{ file_id: id }]),
    ).rejects.toMatchObject({ status: 422 })
    await settle()
    const detail = await source.attachDefectFiles(MAIN, bug?.id ?? '', [
      { file_id: id, caption: 'Layar putih' },
    ])
    expect(detail.files[0]).toMatchObject({ id, caption: 'Layar putih' })
    const listed = await source.listFiles(MAIN, {})
    expect(listed.data.find((f) => f.id === id)?.usages).toEqual([
      { kind: 'DEFECT', label: bug?.bug_code, path: `bugs/${bug?.id}` },
    ])
    await expect(source.deleteFile(MAIN, id)).rejects.toMatchObject({ status: 409 })
  })

  it('does not let a legacy Pemantau (VIEWER) row upload', async () => {
    const db = createMockDb()
    db.currentUserId = '6'
    // VIEWER rows became Pengguna (migration 0015); an old row keeps its old rights.
    const member = db.projects[0]!.members.find((m) => m.userId === '6')!
    member.role = 'VIEWER'
    const source = createMockDataSource({ latencyMs: 0, db, superAdmin: false })
    await expect(source.uploadFile(MAIN, png())).rejects.toMatchObject({ status: 403 })
  })
})

describe('import (Milestone 6, demo: CSV/JSON with the shared planner)', () => {
  const HEADER =
    'case_code,module_code,suite_name,category,title,requirement_refs,priority_code,test_type_code,actor_label,preconditions,test_steps_text,expected_result,source_locale,source_document,result_status,tester_name,tested_at'
  const csv = (rows: string[]) =>
    new File([[HEADER, ...rows].join('\n')], 'impor.csv', { type: 'text/csv' })
  const settle = () => new Promise((resolve) => setTimeout(resolve, 120))
  const mappingOf = (header: string[]) => suggestMapping(header)

  it('previews, applies and refuses to duplicate on re-import (TB-IMP-001/005)', async () => {
    const db = createMockDb()
    const source = createMockDataSource({ latencyMs: 0, db })
    const file = csv([
      'IMP-001,IMPOR,Suite Impor,,Unggah file dengan benar,,,,,,1. Unggah,File tersimpan,id,,,,',
      'IMP-002,IMPOR,Suite Impor,,Tolak file terlalu besar,,,,,,1. Unggah,Pesan galat,id,,,,',
      'IMP-002,IMPOR,Suite Impor,,Salinan,,,,,,,Pesan galat,id,,,,',
    ])
    const job = await source.uploadImport(MAIN, file)
    const sheet = job.sheets[0]
    const config = {
      sheets: [{ name: 'CSV', header_row: 1, mapping: mappingOf(sheet?.header_cells ?? []) }],
    }
    const preview = await source.configureImport(MAIN, job.id, config)
    expect(preview.preview?.counts).toMatchObject({ create: 2, duplicate: 1 })
    await source.commitImport(MAIN, job.id)
    await settle()
    const done = await source.getImport(MAIN, job.id)
    expect(done).toMatchObject({
      status_code: 'COMPLETED',
      result: { created_cases: 2, skipped_rows: 1 },
    })
    expect(db.cases.find((c) => c.case_code === 'IMP-001')?.case_status).toBe('DRAFT')

    const again = await source.uploadImport(MAIN, file)
    const second = await source.configureImport(MAIN, again.id, config)
    expect(second.preview?.counts).toMatchObject({ create: 0, duplicate: 3 })
  })

  it('migrates results into a completed run with tester names as text only', async () => {
    const db = createMockDb()
    const source = createMockDataSource({ latencyMs: 0, db })
    const job = await source.uploadImport(
      MAIN,
      csv([
        'MIG-001,MIG,,,Login lama,,,,,,,Masuk,id,,Berhasil Diuji,Penguji Lama,30/07/2026',
        'MIG-002,MIG,,,Logout lama,,,,,,,Keluar,id,,Closed,Penguji Lama,31/07/2026',
      ]),
    )
    const users = db.users.length
    await source.configureImport(MAIN, job.id, {
      sheets: [
        { name: 'CSV', header_row: 1, mapping: mappingOf(job.sheets[0]?.header_cells ?? []) },
      ],
      include_results: true,
      run: { name: 'Migrasi demo' },
    })
    await source.commitImport(MAIN, job.id)
    await settle()
    const done = await source.getImport(MAIN, job.id)
    expect(done.result).toMatchObject({ created_cases: 2, executions: 1 })
    const run = db.runs.find((r) => r.id === done.result?.run?.id)
    expect(run?.status_code).toBe('COMPLETED')
    expect(run?.starts_at).toMatch(/^2026-07-30/)
    expect(run?.ends_at).toMatch(/^2026-07-31/)
    const exec = db.executions.find(
      (e) => db.runCases.find((rc) => rc.id === e.runCaseId)?.runId === run?.id,
    )
    expect(exec).toMatchObject({ result_status: 'PASSED', legacyTester: 'Penguji Lama' })
    expect(db.users.length).toBe(users)
  })

  it('explains that Excel import needs the server in the demo', async () => {
    const source = ds()
    await expect(source.uploadImport(MAIN, new File(['PK'], 'uat.xlsx'))).rejects.toMatchObject({
      status: 422,
      details: [{ field: 'file', message: 'DEMO_XLSX' }],
    })
  })
})
