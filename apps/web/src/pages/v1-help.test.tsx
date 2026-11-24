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
    const panel = await screen.findByRole('dialog', { name: 'Anggota proyek' })
    expect(within(panel).getByText(/Pengguna yang bisa membuka proyek ini/)).toBeInTheDocument()
    expect(within(panel).getByRole('link', { name: /Buka panduan lengkap/ })).toHaveAttribute(
      'href',
      '/panduan#peran',
    )
    expect(within(panel).getByRole('button', { name: /Ulangi tur singkat/ })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Anggota proyek' })).not.toBeInTheDocument()
  })

  it('knows which page is open', () => {
    expect(helpKeyOf('/projects/DEMO-KARIR/runs/12/cases/34')).toBe('execution')
    expect(helpKeyOf('/projects/DEMO-KARIR/test-cases/new')).toBe('testCases')
    expect(helpKeyOf('/admin/recovery')).toBe('adminRecovery')
    expect(helpKeyOf('/tugas')).toBe('tasks')
    expect(helpKeyOf('/projects/DEMO-KARIR/fase/3/fitur/7')).toBe('phases')
    expect(helpKeyOf('/projects/DEMO-KARIR/uat/baru')).toBe('uat')
    expect(helpKeyOf('/projects/DEMO-KARIR/bugs')).toBe('bugs')
  })

  it('shows the guide by role inside the app, with the roles table and the glossary', async () => {
    renderRoute('/panduan')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Panduan TestBoard' }),
    ).toBeInTheDocument()
    // Inside the app frame: the project menu link "Tugas saya" is there.
    expect(screen.getAllByRole('link', { name: /Tugas saya/ }).length).toBeGreaterThan(0)
    for (const title of [
      'Untuk Pengguna UAT',
      'Untuk Admin',
      'Bug Reporting',
      'Peran dan hak akses',
      'Kamus istilah',
    ]) {
      expect(screen.getByRole('heading', { level: 2, name: title })).toBeInTheDocument()
    }
    const roles = screen.getByRole('table')
    expect(within(roles).getByRole('rowheader', { name: 'Super Admin' })).toBeInTheDocument()
    // Only three kinds of people (ADR 0019).
    expect(
      within(roles)
        .getAllByRole('rowheader')
        .map((cell) => cell.textContent),
    ).toEqual(['Super Admin', 'Admin', 'Pengguna'])
    expect(screen.getByText('(Test Case)')).toBeInTheDocument()
  })
})
