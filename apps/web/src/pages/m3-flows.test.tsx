import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb, type MockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

const P = '/projects/DEMO-KARIR'

function withDb(mutate?: (db: MockDb) => void, superAdmin = true) {
  const db = createMockDb()
  mutate?.(db)
  return { db, dataSource: createMockDataSource({ latencyMs: 0, db, superAdmin }) }
}

const runOf = (db: MockDb, code: string) => {
  const run = db.runs.find((r) => r.run_code === code)
  if (!run) throw new Error(code)
  return run
}

/** First run case of a run without any attempt yet (optionally assigned to one user). */
function freshCase(db: MockDb, runCode: string, assignedTo?: string) {
  const run = runOf(db, runCode)
  const rc = db.runCases
    .filter((x) => x.runId === run.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .find(
      (x) =>
        !db.executions.some((e) => e.runCaseId === x.id) &&
        (assignedTo === undefined || x.assignedTo === assignedTo),
    )
  if (!rc) throw new Error('no fresh run case')
  return { run, rc }
}

describe('cycles (TB-RUN-001)', () => {
  it('validates and creates a cycle', async () => {
    const user = userEvent.setup()
    renderRoute(`${P}/cycles`)
    await screen.findByRole('heading', { level: 1, name: 'Siklus Uji' })
    expect(await screen.findByText('SIKLUS-1-2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Buat' }))
    expect(await screen.findByText('Periksa kembali isian yang ditandai.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Kode siklus/), 'siklus-2-2026')
    await user.type(screen.getByLabelText(/^Judul/), 'Siklus UAT 2 - 2026')
    await user.click(screen.getByRole('button', { name: 'Buat' }))
    expect(await screen.findByText('Siklus SIKLUS-2-2026 dibuat.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Siklus UAT 2 - 2026' })).toBeInTheDocument()
  })
})

describe('run planning (TB-RUN-001..003)', () => {
  it('creates a run, adds READY cases, assigns them and starts the run', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute(`${P}/runs/new`)
    await screen.findByRole('heading', { level: 1, name: 'Buat run' })

    await user.type(screen.getByLabelText(/^Nama/), 'Regresi Uji M3')
    await user.type(screen.getByLabelText(/^URL lingkungan/), 'bukan-url')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('URL harus diawali http:// atau https://')).toBeInTheDocument()
    await user.clear(screen.getByLabelText(/^URL lingkungan/))
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(await screen.findByText(/^Run RUN-\d{8}-1 dibuat/)).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/runs\/\d+$/))
    expect(await screen.findByText('Run ini belum berisi test case.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tambah test case' }))
    const panel = (await screen.findByRole('heading', { name: 'Tambah test case ke run' })).closest(
      'section',
    ) as HTMLElement
    const boxes = await within(panel).findAllByRole('checkbox')
    // [0] = select all; tick the first two cases.
    await user.click(boxes[1] as HTMLElement)
    await user.click(boxes[2] as HTMLElement)
    await user.click(within(panel).getByRole('button', { name: 'Tambahkan (2)' }))
    expect(await screen.findByText('2 test case ditambahkan.')).toBeInTheDocument()

    await user.click(await screen.findByRole('checkbox', { name: 'Pilih semua test case' }))
    const bar = await screen.findByRole('region', { name: '2 dipilih' })
    await user.selectOptions(within(bar).getByRole('combobox'), 'Demo Penguji 2')
    await user.click(within(bar).getByRole('button', { name: 'Terapkan' }))
    expect(await screen.findByText('2 test case ditugaskan ke Demo Penguji 2.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mulai run' }))
    const dialog = await screen.findByRole('alertdialog', { name: /^Mulai run RUN-/ })
    await user.click(within(dialog).getByRole('button', { name: 'Mulai run' }))
    expect(await screen.findByText('Status run sekarang: Berjalan.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Selesaikan run' })).toBeInTheDocument()
  })

  it('confirms before locking a completed run, after which it can no longer be edited', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const run = runOf(db, 'RUN-S1-20261012')
    renderRoute(`${P}/runs/${run.id}`, { dataSource })
    await user.click(await screen.findByRole('button', { name: 'Kunci run' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Kunci run RUN-S1-20261012?' })
    expect(dialog).toHaveTextContent('tidak bisa dibatalkan')
    await user.click(within(dialog).getByRole('button', { name: 'Kunci run' }))
    expect(await screen.findByText('Status run sekarang: Dikunci.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Ubah' })).toBeNull())
    expect(screen.getByText('Run dikunci dan bersifat final.')).toBeInTheDocument()
  })
})

describe('execution workspace (TB-EXEC-001..004)', () => {
  it('requires a result and an actual result for FAILED, then appends attempt #1', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const { run, rc } = freshCase(db, 'RUN-S2-20261109')
    renderRoute(`${P}/runs/${run.id}/cases/${rc.id}`, { dataSource })
    await screen.findByRole('heading', { name: 'Catat hasil' })

    await user.click(screen.getByRole('button', { name: 'Simpan hasil' }))
    expect(await screen.findByText('Pilih hasil uji terlebih dahulu.')).toBeInTheDocument()

    const result = screen.getByRole('group', { name: 'Hasil uji' })
    await user.click(within(result).getByRole('radio', { name: 'Gagal Diuji' }))
    await user.click(screen.getByRole('button', { name: 'Simpan hasil' }))
    expect(await screen.findByText('Wajib diisi')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Hasil aktual/), 'Tombol kirim tidak merespons')
    await user.click(screen.getByRole('button', { name: 'Simpan hasil' }))
    expect(await screen.findByText('Percobaan #1 tersimpan: Gagal Diuji.')).toBeInTheDocument()

    const history = await screen.findByRole('heading', { name: 'Riwayat percobaan' })
    const section = history.closest('section') as HTMLElement
    expect(await within(section).findByText('Percobaan #1')).toBeInTheDocument()
    const saved = db.executions.filter((e) => e.runCaseId === rc.id)
    expect(saved).toHaveLength(1)
    expect(saved[0]).toMatchObject({ result_status: 'FAILED', testerId: '1' })
  })

  it('records per-step results and moves to the next case with "Simpan & lanjut"', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const { run, rc } = freshCase(db, 'RUN-S2-20261109')
    const { router } = renderRoute(`${P}/runs/${run.id}/cases/${rc.id}`, { dataSource })
    await screen.findByRole('heading', { name: 'Catat hasil' })

    await user.click(screen.getByRole('button', { name: 'Tandai semua lulus' }))
    const result = screen.getByRole('group', { name: 'Hasil uji' })
    await user.click(within(result).getByRole('radio', { name: 'Berhasil Diuji' }))
    await user.click(screen.getByRole('button', { name: 'Simpan & lanjut' }))

    expect(await screen.findByText('Percobaan #1 tersimpan: Berhasil Diuji.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).not.toContain(`/cases/${rc.id}`))
    const saved = db.executions.find((e) => e.runCaseId === rc.id)
    expect(saved?.step_results?.every((s) => s.result_status === 'PASSED')).toBe(true)
    expect(saved?.step_results?.length).toBeGreaterThan(0)
  })

  it('needs a reason for BLOCKED', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const { run, rc } = freshCase(db, 'RUN-S2-20261109')
    renderRoute(`${P}/runs/${run.id}/cases/${rc.id}`, { dataSource })
    const result = await screen.findByRole('group', { name: 'Hasil uji' })
    await user.click(within(result).getByRole('radio', { name: 'Terhambat' }))
    expect(screen.getByLabelText(/^Alasan/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Simpan hasil' }))
    expect(await screen.findByText('Wajib diisi')).toBeInTheDocument()
  })

  it('lets a tester record only their own assigned cases', async () => {
    const { db, dataSource } = withDb((d) => {
      d.currentUserId = '3'
    }, false)
    const other = freshCase(db, 'RUN-S2-20261109', '4')
    const view = renderRoute(`${P}/runs/${other.run.id}/cases/${other.rc.id}`, { dataSource })
    expect(
      await screen.findByText(/^Test case ini ditugaskan ke Demo Penguji 2/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan hasil' })).toBeNull()
    view.unmount()

    const mine = freshCase(db, 'RUN-S2-20261109', '3')
    renderRoute(`${P}/runs/${mine.run.id}/cases/${mine.rc.id}`, { dataSource })
    expect(await screen.findByRole('button', { name: 'Simpan hasil' })).toBeInTheDocument()
  })

  it('shows why results cannot be recorded on a completed run', async () => {
    const { db, dataSource } = withDb()
    const run = runOf(db, 'RUN-S1-20261012')
    const rc = db.runCases.find((x) => x.runId === run.id)
    renderRoute(`${P}/runs/${run.id}/cases/${rc?.id}`, { dataSource })
    expect(
      await screen.findByText('Run sudah selesai. Minta QA Lead membuka lagi run untuk uji ulang.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan hasil' })).toBeNull()
  })
})
