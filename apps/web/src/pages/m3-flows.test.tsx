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

describe('Fase folders (TB-RUN-001, ADR 0019)', () => {
  it('validates and creates a Fase', async () => {
    const user = userEvent.setup()
    renderRoute(`${P}/fase`)
    await screen.findByRole('heading', { level: 1, name: 'Fase' })
    expect(await screen.findByText('SIKLUS-1-2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Fase baru' }))
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Buat Fase' }))
    expect(
      await within(dialog).findByText('Periksa kembali isian yang ditandai.'),
    ).toBeInTheDocument()

    await user.type(within(dialog).getByLabelText(/^Nama Fase/), 'Siklus UAT 2 - 2026')
    await user.type(within(dialog).getByLabelText(/^Kode singkat/), 'siklus-2-2026')
    await user.click(within(dialog).getByRole('button', { name: 'Buat Fase' }))
    expect(await screen.findByText('Fase Siklus UAT 2 - 2026 dibuat.')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Siklus UAT 2 - 2026' })).toBeInTheDocument()
  })
})

describe('UAT planning (TB-RUN-001..003, ADR 0019)', () => {
  it('creates a UAT from a Fase, adds its people and starts it', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const { router } = renderRoute(`${P}/uat/baru`, { dataSource })
    await screen.findByRole('heading', { level: 1, name: 'UAT baru' })

    await user.click(screen.getByRole('button', { name: 'Buat UAT' }))
    expect(await screen.findByText('Pilih Fase dulu.')).toBeInTheDocument()

    await user.click(screen.getByRole('radio', { name: /Siklus UAT 1 - 2026/ }))
    // Every feature with Ready scenarios is ticked; their scenarios come along.
    expect(await screen.findByRole('checkbox', { name: /Lowongan Kerja/ })).toBeChecked()
    expect(screen.getByText(/skenario Siap akan masuk ke UAT ini/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Nama UAT/), 'UAT Regresi M3')
    await user.click(screen.getByRole('button', { name: 'Buat UAT' }))

    expect(
      await screen.findByText('UAT UAT Regresi M3 dibuat. Sekarang tambahkan peserta.'),
    ).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/uat\/\d+$/))
    const created = db.runs.find((r) => r.name === 'UAT Regresi M3')!
    expect(db.runCases.filter((rc) => rc.runId === created.id).length).toBeGreaterThan(0)

    await user.type(await screen.findByLabelText(/^Nama dan e-mail/), 'Bu Sri{enter}Pak Budi')
    await user.click(screen.getByRole('button', { name: 'Tambahkan' }))
    expect(await screen.findByText('2 peserta ditambahkan.')).toBeInTheDocument()
    expect(await screen.findByText('Bu Sri')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Mulai UAT' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Mulai UAT' })
    await user.click(within(dialog).getByRole('button', { name: 'Mulai UAT' }))
    expect(await screen.findByText('UAT Regresi M3 sedang berjalan.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Selesaikan UAT' })).toBeInTheDocument()
  })

  it('confirms before locking a completed run, after which it can no longer be edited', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const run = runOf(db, 'RUN-S1-20261012')
    renderRoute(`${P}/runs/${run.id}`, { dataSource })
    await user.click(await screen.findByRole('button', { name: 'Kunci UAT' }))
    const dialog = await screen.findByRole('alertdialog', {
      name: 'Kunci UAT RUN-S1-20261012?',
    })
    expect(dialog).toHaveTextContent('tidak bisa dibatalkan')
    await user.click(within(dialog).getByRole('button', { name: 'Kunci UAT' }))
    expect(await screen.findByText('Status UAT sekarang: Dikunci.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Ubah' })).toBeNull())
    expect(screen.getByText('UAT dikunci dan bersifat final.')).toBeInTheDocument()
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
    await user.click(within(result).getByRole('radio', { name: 'Tidak sesuai' }))
    await user.click(screen.getByRole('button', { name: 'Simpan hasil' }))
    expect(await screen.findByText('Wajib diisi')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Hasil aktual/), 'Tombol kirim tidak merespons')
    await user.click(screen.getByRole('button', { name: 'Simpan hasil' }))
    expect(await screen.findByText('Percobaan #1 tersimpan: Tidak sesuai.')).toBeInTheDocument()

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
    // The step icons are explained once, in words (owner, 2026-11-24).
    expect(screen.getByText('Tandai tiap langkah (tidak wajib):')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tandai semua langkah sesuai' }))
    const result = screen.getByRole('group', { name: 'Hasil uji' })
    await user.click(within(result).getByRole('radio', { name: 'Sesuai' }))
    await user.click(screen.getByRole('button', { name: 'Simpan & lanjut' }))

    expect(await screen.findByText('Percobaan #1 tersimpan: Sesuai.')).toBeInTheDocument()
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
    await user.click(within(result).getByRole('radio', { name: 'Tidak bisa dicoba' }))
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
      await screen.findByText(/^Skenario uji ini ditugaskan ke Demo Penguji 2/),
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
      await screen.findByText('UAT sudah selesai. Minta Admin membuka lagi UAT untuk uji ulang.'),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Simpan hasil' })).toBeNull()
  })
})
