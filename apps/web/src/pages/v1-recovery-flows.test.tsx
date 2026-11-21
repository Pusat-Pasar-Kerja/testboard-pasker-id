import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { I18nextProvider } from 'react-i18next'
import { describe, expect, it } from 'vitest'
import { ValidityBar } from '../components/recovery/ValidityBar'
import { createI18n } from '../i18n'
import { createMockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

function setup(options: { permanentAdmin?: string } = {}) {
  const db = createMockDb()
  return {
    db,
    dataSource: createMockDataSource({
      latencyMs: 0,
      db,
      superAdmin: true,
      permanentAdmin: options.permanentAdmin,
    }),
  }
}

describe('account recovery (ADR 0012)', () => {
  it('sends a "forgot password" request from the login page to the Super Admins', async () => {
    const user = userEvent.setup()
    const { dataSource } = setup()
    const { router } = renderRoute('/login', { dataSource })

    await user.click(await screen.findByRole('link', { name: 'Lupa kata sandi?' }))
    expect(router.state.location.pathname).toBe('/recover')
    await user.click(await screen.findByRole('button', { name: 'Kirim ke Administrator' }))
    expect(await screen.findAllByText('Wajib diisi')).toHaveLength(2)

    await user.type(screen.getByLabelText(/^Email akun/), 'qa.lead@demo.invalid')
    await user.type(screen.getByLabelText(/^Nama/), 'Demo QA Lead')
    await user.type(screen.getByLabelText(/^Kontak/), 'WA kantor')
    await user.click(screen.getByRole('button', { name: 'Kirim ke Administrator' }))
    expect(await screen.findByText('Permintaan terkirim')).toBeInTheDocument()

    const open = await dataSource.listRecoveryRequests('OPEN')
    expect(open.find((r) => r.email === 'qa.lead@demo.invalid')).toMatchObject({
      kind: 'FORGOT_PASSWORD',
      user: { display_name: 'Demo QA Lead' },
    })
  })

  it('asks for a contact when the e-mail itself is forgotten', async () => {
    const user = userEvent.setup()
    const { dataSource } = setup()
    renderRoute('/recover?type=email', { dataSource })
    expect(await screen.findByRole('tab', { name: 'Lupa email', selected: true })).toBeVisible()
    expect(screen.queryByLabelText(/^Email akun/)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Nama/), 'Orang Contoh')
    await user.click(screen.getByRole('button', { name: 'Kirim ke Administrator' }))
    expect(await screen.findByText('Wajib diisi')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/^Kontak/), 'email lain: contoh@demo.invalid')
    await user.click(screen.getByRole('button', { name: 'Kirim ke Administrator' }))
    expect(await screen.findByText('Permintaan terkirim')).toBeInTheDocument()
  })

  it('lets a Super Admin issue one time-limited link and replace it explicitly', async () => {
    const user = userEvent.setup()
    const { dataSource } = setup()
    renderRoute('/admin/recovery', { dataSource })

    const nav = await screen.findByRole('link', { name: /Pemulihan akun/ })
    expect(await within(nav).findByText('2')).toBeInTheDocument()

    const card = (await screen.findByText('penguji2@demo.invalid', { selector: 'dd' })).closest(
      'li',
    ) as HTMLElement
    await user.click(within(card).getByRole('button', { name: 'Buat tautan reset' }))
    const dialog = await screen.findByRole('dialog', { name: /Buat tautan reset untuk/ })
    expect(within(dialog).getByText(/berlaku 24 jam/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Buat tautan' }))

    const issued = await screen.findByRole('dialog', { name: 'Tautan reset siap dikirim' })
    const url = (within(issued).getByLabelText(/^Tautan untuk/) as HTMLInputElement).value
    expect(url).toMatch(/\/reset-password#[\w-]{40,}$/)
    const bar = within(issued).getByRole('progressbar')
    expect(Number(bar.getAttribute('aria-valuenow'))).toBeGreaterThanOrEqual(99)
    expect(within(issued).getByText(/Berlaku 23 jam 59 menit lagi|Berlaku 1 hari 0 jam lagi/))
    await user.click(within(issued).getByRole('button', { name: 'Selesai' }))

    // The account now has one active link; a second one is only possible by replacing it.
    await waitFor(async () => expect((await dataSource.listResetLinks()).length).toBe(1))
    await user.click(await within(card).findByRole('button', { name: 'Buat tautan baru' }))
    const again = await screen.findByRole('dialog', { name: /Buat tautan reset untuk/ })
    expect(within(again).getByText(/sudah punya tautan aktif/)).toBeInTheDocument()
    await user.click(within(again).getByRole('button', { name: 'Cabut & buat tautan baru' }))
    const second = await screen.findByRole('dialog', { name: 'Tautan reset siap dikirim' })
    const secondUrl = (within(second).getByLabelText(/^Tautan untuk/) as HTMLInputElement).value
    expect(secondUrl).not.toBe(url)
    expect(await dataSource.listResetLinks()).toHaveLength(1)
    await expect(dataSource.checkResetLink(url.split('#')[1] as string)).rejects.toMatchObject({
      details: [{ message: 'REVOKED' }],
    })
  })

  it('sets a new password once with the link, showing the account and remaining time', async () => {
    const user = userEvent.setup()
    const { dataSource } = setup()
    const { token } = await dataSource.issueResetLink('3')
    const { router } = renderRoute(`/reset-password#${token}`, { dataSource })

    expect(await screen.findByText('penguji1@demo.invalid')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Sisa masa berlaku tautan' })).toBeVisible()
    // The token is removed from the address bar.
    await waitFor(() => expect(router.state.location.hash).toBe(''))

    await user.type(screen.getByLabelText(/^Kata sandi baru/), 'pendek')
    await user.type(screen.getByLabelText(/^Ulangi kata sandi baru/), 'pendek')
    await user.click(screen.getByRole('button', { name: 'Simpan kata sandi baru' }))
    expect(await screen.findByText('Terlalu pendek (minimal 8 karakter)')).toBeInTheDocument()

    await user.clear(screen.getByLabelText(/^Kata sandi baru/))
    await user.clear(screen.getByLabelText(/^Ulangi kata sandi baru/))
    await user.type(screen.getByLabelText(/^Kata sandi baru/), 'Kalimat-Panjang-Aman-2026')
    await user.type(screen.getByLabelText(/^Ulangi kata sandi baru/), 'Kalimat-Panjang-Aman-2026')
    await user.click(screen.getByRole('button', { name: 'Simpan kata sandi baru' }))
    expect(await screen.findByText('Kata sandi baru tersimpan')).toBeInTheDocument()

    await expect(dataSource.checkResetLink(token)).rejects.toMatchObject({
      details: [{ message: 'USED' }],
    })
  })

  it('explains an unknown link and offers a new request', async () => {
    const { dataSource } = setup()
    renderRoute('/reset-password#bukan-tautan-yang-benar-sama-sekali', { dataSource })
    expect(
      await screen.findByText('Tautan ini tidak dikenal atau tidak lengkap.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Hubungi Administrator' })).toBeInTheDocument()
  })

  it('keeps the owner account out of website resets and shows the validity setting', async () => {
    const { db, dataSource } = setup({ permanentAdmin: '1' })
    renderRoute('/admin/users', { dataSource })
    const owner = (
      await screen.findByText('admin@demo.invalid', { selector: 'li > div > p' })
    ).closest('li') as HTMLElement
    expect(within(owner).getByRole('button', { name: 'Tautan reset' })).toBeDisabled()
    await expect(dataSource.issueResetLink(db.currentUserId)).rejects.toMatchObject({
      status: 403,
    })

    renderRoute('/admin/settings', { dataSource })
    expect(await screen.findByLabelText(/^Masa berlaku tautan reset/)).toHaveValue(24)
  })
})

describe('ValidityBar', () => {
  it('shows the remaining time, the end time and a proportional bar', () => {
    const now = Date.now()
    render(
      <I18nextProvider i18n={createI18n('id')}>
        <ValidityBar
          issuedAt={new Date(now - 30 * 60_000).toISOString()}
          expiresAt={new Date(now + 90 * 60_000 + 30_000).toISOString()}
        />
      </I18nextProvider>,
    )
    expect(screen.getByText('Berlaku 1 jam 30 menit lagi')).toBeInTheDocument()
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '75')
  })
})
