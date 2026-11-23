import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { helpKeyOf } from '../components/help/tour-state'
import { renderRoute } from '../test/render'

/** Help everywhere (owner, 2026-11-24): page help, the guide by role, plain words. */
describe('help on every page', () => {
  it('explains the open page in a side panel and links to the right part of the guide', async () => {
    const user = userEvent.setup()
    renderRoute('/projects/DEMO-KARIR/members')
    await user.click(await screen.findByRole('button', { name: 'Bantuan' }))
    const panel = await screen.findByRole('dialog', { name: 'Anggota & tugas' })
    expect(within(panel).getByText(/Penguji, Developer, atau Pemantau/)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /Buka panduan lengkap/ })).toHaveAttribute(
      'href',
      '/panduan#peran',
    )
    expect(within(panel).getByRole('button', { name: /Ulangi tur singkat/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Anggota & tugas' })).not.toBeInTheDocument()
  })

  it('knows which page is open', () => {
    expect(helpKeyOf('/projects/DEMO-KARIR/runs/12/cases/34')).toBe('execution')
    expect(helpKeyOf('/projects/DEMO-KARIR/test-cases/new')).toBe('testCases')
    expect(helpKeyOf('/admin/recovery')).toBe('adminRecovery')
    expect(helpKeyOf('/tugas')).toBe('tasks')
  })

  it('shows the guide by role inside the app, with the roles table and the glossary', async () => {
    renderRoute('/panduan')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panduan TestBoard' }),
    ).toBeInTheDocument()
    // Inside the app frame: the project menu link "Tugas saya" is there.
    expect(screen.getAllByRole('link', { name: /Tugas saya/ }).length).toBeGreaterThan(0)
    for (const title of ['Untuk Penguji', 'Untuk Admin', 'Peran dan hak akses', 'Kamus istilah']) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    const roles = screen.getByRole('table')
    expect(within(roles).getByRole('rowheader', { name: 'Super Admin' })).toBeInTheDocument()
    expect(
      within(roles).getByRole('rowheader', { name: 'Pengguna - Pemantau' }),
    ).toBeInTheDocument()
    expect(screen.getByText('(Test Case)')).toBeInTheDocument()
  })
})
