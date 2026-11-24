import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

const P = '/projects/DEMO-KARIR'

// Walkthrough per role (owner, 2026-11-24: "user above all agar MUDAH").
describe('UX walkthrough: each person starts in the right place, lists stay calm', () => {
  it('starts a Pengguna on "Tugas saya" and an Admin on the projects', async () => {
    const pengguna = renderRoute('/', {
      dataSource: createMockDataSource({ latencyMs: 0, superAdmin: false }),
    })
    await screen.findByRole('heading', { level: 1, name: 'Tugas saya' })
    expect(pengguna.router.state.location.pathname).toBe('/tugas')
    pengguna.unmount()

    const admin = renderRoute('/')
    await screen.findByRole('heading', { level: 1, name: 'Proyek' })
    expect(admin.router.state.location.pathname).toBe('/projects')
  })

  it('keeps the rarely used bug filters behind "Saring lebih lanjut"', async () => {
    const user = userEvent.setup()
    renderRoute(`${P}/bugs`)
    const more = await screen.findByRole('button', { name: /Saring lebih lanjut/ })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    // Search and the status chips stay in view.
    expect(screen.getByRole('searchbox', { name: 'Kata kunci' })).toBeInTheDocument()
    expect(screen.queryByRole('combobox', { name: 'Tingkat dampak' })).toBeNull()

    await user.click(more)
    expect(screen.getByRole('combobox', { name: 'Tingkat dampak' })).toBeInTheDocument()
  })

  it('opens the extra filters by itself while one of them is in use', async () => {
    renderRoute(`${P}/bugs?severity=CRITICAL`)
    const more = await screen.findByRole('button', { name: /Saring lebih lanjut/ })
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(within(more).getByText('1')).toBeInTheDocument()
  })
})
