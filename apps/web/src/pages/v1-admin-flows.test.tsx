import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb, type MockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

function setup(
  options: { superAdmin?: boolean; permanentAdmin?: string; mutate?: (db: MockDb) => void } = {},
) {
  const db = createMockDb()
  options.mutate?.(db)
  return {
    db,
    dataSource: createMockDataSource({
      latencyMs: 0,
      db,
      superAdmin: options.superAdmin ?? true,
      permanentAdmin: options.permanentAdmin,
    }),
  }
}

describe('v1 admin console (ADR 0011)', () => {
  it('lets a Super Admin create a project from the projects page and opens it', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = setup({ mutate: (d) => (d.projects = []) })
    const { router } = renderRoute('/projects', { dataSource })

    expect(await screen.findByText('Belum ada proyek')).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Buat proyek' })[0] as HTMLElement)
    const dialog = await screen.findByRole('dialog', { name: 'Buat proyek baru' })
    await user.type(within(dialog).getByLabelText(/^Kode proyek/), 'karirhub')
    await user.type(within(dialog).getByLabelText(/^Nama proyek/), 'Karirhub')
    await user.type(within(dialog).getByLabelText(/^Deskripsi/), 'UAT Fase 1 dan Fase 2')
    await user.click(within(dialog).getByRole('button', { name: 'Buat proyek' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/projects/KARIRHUB/dashboard'))
    expect(await screen.findByText('Proyek KARIRHUB dibuat.')).toBeInTheDocument()
    expect(db.projects[0]).toMatchObject({
      project_code: 'KARIRHUB',
      members: [{ userId: db.currentUserId, role: 'ADMIN' }],
    })
  })

  it('refuses a duplicate project code inline', async () => {
    const user = userEvent.setup()
    const { dataSource } = setup()
    renderRoute('/admin/projects', { dataSource })
    await user.click(await screen.findByRole('button', { name: 'Buat proyek' }))
    const dialog = await screen.findByRole('dialog')
    await user.type(within(dialog).getByLabelText(/^Kode proyek/), 'DEMO-KARIR')
    await user.type(within(dialog).getByLabelText(/^Nama proyek/), 'Lagi')
    await user.click(within(dialog).getByRole('button', { name: 'Buat proyek' }))
    expect(await within(dialog).findByText('Sudah dipakai')).toBeInTheDocument()
  })

  it('archives a project as read-only and shows it on the project pages', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = setup()
    renderRoute('/admin/projects', { dataSource })
    const card = (await screen.findByText('Demo Portal Karier')).closest('li') as HTMLElement
    await user.click(within(card).getByRole('button', { name: 'Arsipkan' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Arsipkan' }),
    )
    expect(await within(card).findByText('Diarsipkan')).toBeInTheDocument()
    expect(db.projects.find((p) => p.project_code === 'DEMO-KARIR')?.archived).toBe(true)

    await user.click(within(card).getByRole('link', { name: 'Buka' }))
    expect(await screen.findByText(/Proyek ini diarsipkan/)).toBeInTheDocument()
  })

  it('saves site settings, validates them and shows the announcement to everyone', async () => {
    const user = userEvent.setup()
    const { dataSource } = setup()
    renderRoute('/admin/settings', { dataSource })
    const hours = await screen.findByLabelText(/^Lama sesi masuk/)
    await user.clear(hours)
    await user.type(hours, '0')
    await user.click(screen.getByRole('button', { name: 'Simpan pengaturan' }))
    expect(await screen.findByText('Periksa kembali isian yang ditandai.')).toBeInTheDocument()

    await user.clear(hours)
    await user.type(hours, '8')
    await user.type(screen.getByLabelText(/^Pengumuman/), 'UAT Fase 2 dimulai Senin.')
    await user.click(screen.getByRole('button', { name: 'Simpan pengaturan' }))
    expect(await screen.findByText('Pengaturan situs disimpan.')).toBeInTheDocument()
    expect(
      await screen.findByText('UAT Fase 2 dimulai Senin.', { selector: 'p' }),
    ).toBeInTheDocument()
    expect(screen.getAllByText(/Diubah .* oleh Demo Admin/).length).toBeGreaterThan(0)
  })

  it('marks the permanent Super Admin and locks its revoke/deactivate buttons', async () => {
    const { db, dataSource } = setup({ permanentAdmin: '1' })
    renderRoute('/admin/users', { dataSource })
    const owner = db.users.find((u) => u.id === '1')
    const badge = await screen.findByText('Super Admin utama')
    const row = badge.closest('li') as HTMLElement
    expect(within(row).getByText(owner?.email as string)).toBeInTheDocument()
    expect(within(row).getByRole('button', { name: 'Cabut Super Admin' })).toBeDisabled()
    expect(within(row).getByRole('button', { name: 'Nonaktifkan' })).toBeDisabled()
  })

  it('lists website-wide activity with the project or "website level"', async () => {
    const user = userEvent.setup()
    const { dataSource } = setup()
    await dataSource.updateSiteSettings({ 'site.support_contact': 'Tim SIPK' })
    renderRoute('/admin/audit', { dataSource })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Log aktivitas situs' }),
    ).toBeInTheDocument()
    expect((await screen.findAllByText('Tingkat situs')).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: 'DEMO-KARIR' }).length).toBeGreaterThan(0)

    await user.selectOptions(screen.getByLabelText('Proyek'), 'site')
    await waitFor(() =>
      expect(screen.queryAllByRole('link', { name: 'DEMO-KARIR' })).toHaveLength(0),
    )
  })

  it('keeps the console and project creation away from everyone else', async () => {
    const { dataSource } = setup({ superAdmin: false })
    renderRoute('/admin/settings', { dataSource })
    expect(
      await screen.findByRole('heading', { level: 1, name: /tidak ditemukan/i }),
    ).toBeInTheDocument()

    const other = setup({ superAdmin: false })
    renderRoute('/projects', { dataSource: other.dataSource })
    await screen.findAllByText('Demo Portal Karier')
    expect(screen.queryByRole('button', { name: 'Buat proyek' })).toBeNull()
    expect(screen.queryByText('Administrasi')).toBeNull()
  })
})
