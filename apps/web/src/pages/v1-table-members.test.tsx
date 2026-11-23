import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

/** People at a table with their own User account (ADR 0018), in the demo data. */
async function setup() {
  const db = createMockDb()
  const dataSource = createMockDataSource({ latencyMs: 0, db, superAdmin: true })
  const project = db.projects.find((p) => p.project_code === 'DEMO-KARIR')!
  const cycle = db.cycles.find((c) => c.projectId === project.id)!
  const tables = await dataSource.listWorkshopTables(project.project_code, cycle.id)
  const table = tables.find((t) => t.name === 'Meja 1')!
  // An Admin lists Pak Budi with his e-mail: he becomes a Penguji account, not activated.
  const saved = await dataSource.updateWorkshopTable(project.project_code, cycle.id, table.id, {
    members: [
      { name: 'Pak Budi', email: 'budi.meja@demo.invalid' },
      { name: 'Bu Sri', email: null },
    ],
  })
  return { db, dataSource, project, cycle, table: saved }
}

describe('people at a table with their own account', () => {
  it('lets a listed person activate their account at the table, once', async () => {
    const user = userEvent.setup()
    const { dataSource, table } = await setup()
    renderRoute(`/meja#${table.access_code}`, { dataSource })

    await user.click(await screen.findByRole('button', { name: 'Aktifkan akun saya' }))
    const dialog = await screen.findByRole('dialog', { name: 'Aktifkan akun saya' })
    // Only a masked e-mail is shown at the table.
    expect(within(dialog).getByText('b***@demo.invalid')).toBeInTheDocument()
    expect(within(dialog).queryByText('budi.meja@demo.invalid')).not.toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/^Kata sandi baru/), 'Rahasia-Budi-9')
    await user.type(within(dialog).getByLabelText(/^Ulangi kata sandi/), 'Rahasia-Budi-9')
    await user.click(within(dialog).getByRole('button', { name: 'Aktifkan akun' }))

    expect(await screen.findByRole('dialog', { name: 'Akun Anda sudah aktif' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Tutup' }))
    // Nobody else is waiting for activation, so the offer disappears.
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Aktifkan akun saya' })).not.toBeInTheDocument(),
    )
  })

  it('shows the new account as "Belum aktif" with an activation link for the Admin', async () => {
    const user = userEvent.setup()
    const { dataSource, project } = await setup()
    renderRoute(`/projects/${project.project_code}/members`, { dataSource })

    const row = (await screen.findByText('Pak Budi')).closest('li') as HTMLElement
    expect(within(row).getByText('Belum aktif')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: /Tautan aktivasi/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Tautan aktivasi untuk Pak Budi' })
    expect(await within(dialog).findByText(/reset-password#/)).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: /Kirim lewat WhatsApp/ })).toHaveAttribute(
      'href',
      expect.stringContaining('https://wa.me/?text='),
    )
  })

  it('lists the table under "Tugas saya" and opens it with the person\'s name chosen', async () => {
    const user = userEvent.setup()
    const db = createMockDb()
    const dataSource = createMockDataSource({ latencyMs: 0, db, superAdmin: false })
    const project = db.projects.find((p) => p.project_code === 'DEMO-KARIR')!
    const cycle = db.cycles.find((c) => c.projectId === project.id)!
    // The demo user is listed at Meja 2 with their own e-mail.
    const tables = await dataSource.listWorkshopTables(project.project_code, cycle.id)
    const meja2 = tables.find((t) => t.name === 'Meja 2')!
    await dataSource.updateWorkshopTable(project.project_code, cycle.id, meja2.id, {
      members: [
        { name: 'Demo Saya', email: db.users.find((u) => u.id === db.currentUserId)!.email },
      ],
    })

    const { router } = renderRoute('/tugas', { dataSource })
    expect(await screen.findByRole('heading', { level: 1, name: 'Tugas saya' })).toBeInTheDocument()
    const card = (await screen.findByText('Meja 2')).closest('li') as HTMLElement
    expect(within(card).getByText(/Sebagai Demo Saya/)).toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'Buka meja ini' }))
    const confirm = await screen.findByRole('alertdialog', { name: /Buka Meja 2/ })
    await user.click(within(confirm).getByRole('button', { name: 'Buka meja ini' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/meja/kerja'))
    const picker = await screen.findByRole('radiogroup')
    expect(within(picker).getByRole('radio', { name: /Demo Saya/ })).toHaveAttribute(
      'aria-checked',
      'true',
    )
  })
})
