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

const mainBugs = (db: MockDb) => {
  const main = db.projects.find((p) => p.project_code === 'DEMO-KARIR')
  return db.defects.filter((d) => d.projectId === main?.id)
}

describe('reporting bugs (TB-BUG-001/002)', () => {
  it('reports a standalone bug from the bug list', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const next = String(mainBugs(db).length + 1).padStart(4, '0')
    const { router } = renderRoute(`${P}/bugs`, { dataSource })
    await user.click(await screen.findByRole('link', { name: 'Laporkan masalah' }))
    await screen.findByRole('heading', { level: 1, name: 'Laporkan masalah' })

    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Periksa kembali isian yang ditandai.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Judul/), 'Foto profil gagal diunggah di Safari')
    await user.selectOptions(screen.getByLabelText(/^Sumber/), 'Laporan pengguna')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(await screen.findByText(`Masalah BUG-DKR-${next} dibuat.`)).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/bugs\/\d+$/))
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'Foto profil gagal diunggah di Safari',
      }),
    ).toBeInTheDocument()
    expect(screen.getByText('Dibuat dengan status Baru dilaporkan')).toBeInTheDocument()
  })

  it('reports a bug from a failed attempt, prefilled and linked, then returns to testing', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const run = db.runs.find((r) => r.run_code === 'RUN-S2-20261109')
    const rc = db.runCases.find(
      (x) => x.runId === run?.id && !db.executions.some((e) => e.runCaseId === x.id),
    )
    const { router } = renderRoute(`${P}/runs/${run?.id}/cases/${rc?.id}`, { dataSource })

    expect(
      await screen.findByText('Catat hasil uji dulu untuk melaporkan atau menautkan masalah.'),
    ).toBeInTheDocument()
    const result = screen.getByRole('group', { name: 'Hasil uji' })
    await user.click(within(result).getByRole('radio', { name: 'Tidak sesuai' }))
    await user.type(screen.getByLabelText(/^Hasil aktual/), 'Halaman putih setelah klik Kirim')
    await user.click(screen.getByRole('button', { name: 'Simpan hasil' }))
    await screen.findByText('Percobaan #1 tersimpan: Tidak sesuai.')

    await user.click(
      await screen.findByRole('link', { name: 'Laporkan masalah dari percobaan #1' }),
    )
    expect(
      await screen.findByText(/^Masalah ini akan ditautkan ke RUN-S2-20261109/),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Judul/)).toHaveValue('Halaman putih setelah klik Kirim')
    expect(screen.getByLabelText(/^Perilaku aktual/)).toHaveValue(
      'Halaman putih setelah klik Kirim',
    )
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(await screen.findByText(/^Masalah BUG-DKR-\d{4} dibuat\.$/)).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toContain(`/cases/${rc?.id}`))
    const created = db.defects.at(-1)
    expect(created?.executionIds).toHaveLength(1)
    expect(
      await screen.findByText('Halaman putih setelah klik Kirim', { selector: 'span' }),
    ).toBeInTheDocument()
  })

  it('links an existing open bug to the latest attempt', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const attempt = db.executions.find((e) => {
      const rc = db.runCases.find((x) => x.id === e.runCaseId)
      return db.runs.some((r) => r.id === rc?.runId && r.run_code === 'RUN-S2-20261109')
    })
    const rc = db.runCases.find((x) => x.id === attempt?.runCaseId)
    const linkedHere = new Set(
      db.defects
        .filter((d) =>
          d.executionIds.some((id) => db.executions.find((e) => e.id === id)?.runCaseId === rc?.id),
        )
        .map((d) => d.id),
    )
    const target = mainBugs(db).find((d) => d.status_code === 'OPEN' && !linkedHere.has(d.id))
    renderRoute(`${P}/runs/${rc?.runId}/cases/${rc?.id}`, { dataSource })

    await user.click(await screen.findByRole('button', { name: 'Tautkan masalah yang ada' }))
    await user.click(await screen.findByRole('button', { name: `Tautkan ${target?.bug_code}` }))
    expect(
      await screen.findByText(new RegExp(`^Masalah ${target?.bug_code} ditautkan`)),
    ).toBeInTheDocument()
    const latest = db.executions
      .filter((e) => e.runCaseId === rc?.id)
      .sort((a, b) => b.attempt_number - a.attempt_number)[0]
    expect(target?.executionIds).toContain(latest?.id)
  })
})

describe('bug status workflow (TB-BUG-003/004)', () => {
  it('moves a bug forward with confirmation and needs a reason to reopen', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const bug = mainBugs(db).find((d) => d.status_code === 'OPEN')
    renderRoute(`${P}/bugs/${bug?.id}`, { dataSource })

    await user.click(await screen.findByRole('button', { name: 'Mulai perbaiki' }))
    let dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Mulai perbaiki' }))
    expect(
      await screen.findByText(`Status ${bug?.bug_code} sekarang: Sedang diperbaiki.`),
    ).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Tandai diperbaiki' }))
    dialog = await screen.findByRole('alertdialog')
    await user.type(within(dialog).getByLabelText(/^Diperbaiki di versi/), '1.1.1')
    await user.click(within(dialog).getByRole('button', { name: 'Tandai diperbaiki' }))
    await screen.findByText(`Status ${bug?.bug_code} sekarang: Sudah diperbaiki.`)
    expect(bug?.fixed_in_version).toBe('1.1.1')

    await user.click(await screen.findByRole('button', { name: 'Siap diuji ulang' }))
    dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Siap diuji ulang' }))
    await screen.findByText(`Status ${bug?.bug_code} sekarang: Siap diuji ulang.`)

    await user.click(await screen.findByRole('button', { name: 'Buka kembali' }))
    dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Buka kembali' }))
    expect(await within(dialog).findByText('Wajib diisi')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/^Alasan/), 'Uji ulang #2 masih gagal')
    await user.click(within(dialog).getByRole('button', { name: 'Buka kembali' }))
    await screen.findByText(`Status ${bug?.bug_code} sekarang: Muncul lagi.`)
    expect(await screen.findByText('Uji ulang #2 masih gagal')).toBeInTheDocument()
    expect(bug?.history.map((h) => h.to).slice(-4)).toEqual([
      'IN_PROGRESS',
      'FIXED',
      'READY_FOR_RETEST',
      'REOPENED',
    ])
  })

  it('shows a developer only their own fix steps and locks other fields', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb((d) => {
      d.currentUserId = '5'
    }, false)
    const bug = mainBugs(db).find((d) => d.assignedTo === '5' && d.status_code === 'OPEN')
    if (!bug) throw new Error('no OPEN bug for the developer')
    renderRoute(`${P}/bugs/${bug.id}`, { dataSource })
    expect(await screen.findByRole('button', { name: 'Mulai perbaiki' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tidak akan diperbaiki' })).toBeNull()

    await user.click(screen.getByRole('link', { name: 'Ubah' }))
    expect(
      await screen.findByText('Sebagian kolom terkunci karena peran Anda tidak dapat mengubahnya.'),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^Judul/)).toBeDisabled()
    expect(screen.getByLabelText(/^Diperbaiki di versi/)).toBeEnabled()
  })

  it('lets viewers read only: no actions, no edit, no comment form', async () => {
    const { db, dataSource } = withDb((d) => {
      d.currentUserId = '6'
    }, false)
    const bug = mainBugs(db).find((d) => d.status_code === 'OPEN')
    renderRoute(`${P}/bugs/${bug?.id}`, { dataSource })
    await screen.findByRole('heading', { level: 1, name: bug?.title })
    expect(screen.queryByRole('button', { name: 'Mulai perbaiki' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Ubah' })).toBeNull()
    expect(screen.queryByLabelText(/^Tulis komentar/)).toBeNull()
  })

  it('posts a comment', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const bug = mainBugs(db)[0]
    renderRoute(`${P}/bugs/${bug?.id}`, { dataSource })
    await user.type(await screen.findByLabelText(/^Tulis komentar/), 'Sudah dicek di staging.')
    await user.click(screen.getByRole('button', { name: 'Kirim komentar' }))
    expect(await screen.findByText('Komentar terkirim.')).toBeInTheDocument()
    expect(
      await screen.findByText('Sudah dicek di staging.', { selector: 'p' }),
    ).toBeInTheDocument()
  })
})
