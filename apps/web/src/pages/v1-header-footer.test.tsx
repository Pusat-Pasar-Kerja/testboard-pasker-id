import { screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { renderRoute } from '../test/render'

const P = '/projects/DEMO-KARIR'

describe('one header and one footer on every page (owner, 2026-11-24)', () => {
  it('keeps the top bar to one row of icons, with the language inside Aksesibilitas', async () => {
    renderRoute(`${P}/dashboard`)
    await screen.findByRole('heading', { level: 1, name: 'Beranda proyek' })
    // The top bar comes first; page titles also use <header>.
    const header = screen.getAllByRole('banner')[0] as HTMLElement

    expect(within(header).getByRole('button', { name: 'Aksesibilitas' })).toBeInTheDocument()
    expect(within(header).getByRole('button', { name: 'Bantuan' })).toBeInTheDocument()
    // The gear icon (the account menu has the same link inside).
    expect(within(header).getAllByRole('link', { name: /^Administrasi/ })[0]).toHaveAttribute(
      'data-tour',
      'admin',
    )
    expect(within(header).getByLabelText('Proyek')).toBeInTheDocument()
    // No separate ID/EN switch in the top bar any more.
    expect(within(header).queryByRole('button', { name: /English|EN/ })).toBeNull()
    expect(within(header).queryByRole('radio')).toBeNull()
  })

  it('names the project tools without the old numbers in the left panel', async () => {
    renderRoute(`${P}/dashboard`)
    await screen.findByRole('heading', { level: 1, name: 'Beranda proyek' })
    const panel = screen.getByRole('navigation', { name: 'Navigasi utama' })

    expect(within(panel).getByText('Kelola proyek')).toBeInTheDocument()
    expect(within(panel).queryByText(/^\d\.\s/)).toBeNull()
    expect(within(panel).getByRole('link', { name: 'Pengaturan proyek' })).toBeInTheDocument()
  })

  it('shows the same footer on the public pages and in the application', async () => {
    const linksOf = (footer: HTMLElement) =>
      within(footer)
        .getAllByRole('link')
        .map((link) => link.textContent)

    const publicPage = renderRoute('/publik')
    const publicFooter = await screen.findByRole('contentinfo')
    const publicLinks = linksOf(publicFooter)
    expect(publicLinks).toEqual(expect.arrayContaining(['Beranda publik', 'Panduan']))
    publicPage.unmount()

    renderRoute(`${P}/dashboard`)
    await screen.findByRole('heading', { level: 1, name: 'Beranda proyek' })
    const appFooter = screen.getByRole('contentinfo')
    expect(linksOf(appFooter)).toEqual(publicLinks)
    expect(within(appFooter).getByText(/Pusat Pasar Kerja/)).toBeInTheDocument()
  })
})
