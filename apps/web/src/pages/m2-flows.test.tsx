import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb } from '../mocks/seed'
import { ApiClientError } from '../services/api-client'
import type { DataSource } from '../services/data-source'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

const P = '/projects/DEMO-KARIR'

/** A real-API-like data source: starts signed out and only accepts one password. */
function httpLike(): DataSource {
  const base = createMockDataSource({ latencyMs: 0 })
  let signedIn = false
  return {
    ...base,
    kind: 'http',
    getCurrentUser: () => (signedIn ? base.getCurrentUser() : Promise.resolve(null)),
    login: async (_email, password) => {
      if (password !== 'benar-sekali-12') {
        throw new ApiClientError(401, 'UNAUTHENTICATED', 'Invalid email or password.', 'req-1')
      }
      signedIn = true
      return (await base.getCurrentUser()) as NonNullable<
        Awaited<ReturnType<DataSource['getCurrentUser']>>
      >
    },
  }
}

describe('sign-in (real API mode)', () => {
  it('sends anonymous visitors to /login and returns them after a successful sign-in', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute(`${P}/test-cases`, { dataSource: httpLike() })

    expect(await screen.findByRole('heading', { name: 'Masuk ke TestBoard' })).toBeInTheDocument()
    expect(router.state.location.pathname).toBe('/login')

    await user.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(screen.getAllByText('Wajib diisi')).toHaveLength(2)

    await user.type(screen.getByLabelText(/^Email/), 'admin@demo.invalid')
    await user.type(screen.getByLabelText(/^Kata sandi/), 'salah')
    await user.click(screen.getByRole('button', { name: 'Masuk' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email atau kata sandi salah.')

    await user.type(screen.getByLabelText(/^Kata sandi/), 'benar-sekali-12')
    await user.click(screen.getByRole('button', { name: 'Masuk' }))
    await waitFor(() => expect(router.state.location.pathname).toBe(`${P}/test-cases`))
  })
})

describe('test case create / edit / archive (mock mode)', () => {
  it('validates required fields, then creates a case with a generated code', async () => {
    const user = userEvent.setup()
    const { router } = renderRoute(`${P}/test-cases/new`)
    await screen.findByRole('heading', { level: 1, name: 'Buat test case' })

    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    expect(await screen.findByText('Periksa kembali isian yang ditandai.')).toBeInTheDocument()

    await user.type(screen.getByLabelText(/^Judul/), 'Pengguna mengunggah foto profil')
    await user.selectOptions(screen.getByLabelText(/^Modul/), 'PROFIL')
    await user.type(screen.getByLabelText(/^Hasil yang diharapkan/), 'Foto tampil di profil')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    expect(await screen.findByText('Test case UAT-PROFIL-007 dibuat.')).toBeInTheDocument()
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/test-cases\/\d+$/))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Pengguna mengunggah foto profil' }),
    ).toBeInTheDocument()
  })

  it('edits a case into a new version and archives it after confirmation', async () => {
    const user = userEvent.setup()
    const db = createMockDb()
    const target = db.cases.find((c) => c.case_code === 'UAT-AUTH-002')
    const versionBefore = target?.current_version ?? 1
    renderRoute(`${P}/test-cases/${target?.id}/edit`, {
      dataSource: createMockDataSource({ latencyMs: 0, db }),
    })
    const expected = await screen.findByLabelText(/^Hasil yang diharapkan/)
    await user.clear(expected)
    await user.type(expected, 'Pesan galat umum tampil')
    await user.type(screen.getByLabelText(/^Alasan perubahan/), 'Review UAT')
    await user.click(screen.getByRole('button', { name: 'Simpan' }))

    const version = versionBefore + 1
    expect(await screen.findByText(`Perubahan disimpan (versi ${version}).`)).toBeInTheDocument()

    await user.click(await screen.findByRole('button', { name: 'Arsipkan' }))
    const dialog = screen.getByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Arsipkan' }))
    expect(await screen.findByText('UAT-AUTH-002 diarsipkan.')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Pulihkan' })).toBeInTheDocument()
  })

  it('hides write actions from a VIEWER', async () => {
    const db = createMockDb()
    db.currentUserId = '6' // Demo Pemantau = VIEWER
    renderRoute(`${P}/test-cases`, {
      dataSource: createMockDataSource({ latencyMs: 0, db, superAdmin: false }),
    })
    await screen.findByRole('table')
    expect(screen.queryByRole('link', { name: 'Buat test case' })).not.toBeInTheDocument()
  })
})

describe('team, profile and user administration', () => {
  it('changes a member role', async () => {
    const user = userEvent.setup()
    renderRoute(`${P}/members`)
    const select = await screen.findByLabelText('Peran Demo Penguji 2')
    await user.selectOptions(select, 'QA_LEAD')
    expect(await screen.findByText('Peran Demo Penguji 2 sekarang QA Lead.')).toBeInTheDocument()
  })

  it('creates an account and shows the temporary password once', async () => {
    const user = userEvent.setup()
    renderRoute('/admin/users')
    await user.type(await screen.findByLabelText(/^Email/), 'baru@demo.invalid')
    await user.type(screen.getByLabelText(/^Nama/), 'Pengguna Baru')
    await user.click(screen.getByRole('button', { name: 'Buat akun' }))
    expect(
      await screen.findByText('Kata sandi sementara untuk baru@demo.invalid'),
    ).toBeInTheDocument()
    expect(screen.getByText('Pengguna Baru')).toBeInTheDocument()
  })

  it('blocks the user admin page for non Super Admins', async () => {
    renderRoute('/admin/users', {
      dataSource: createMockDataSource({ latencyMs: 0, superAdmin: false }),
    })
    expect(await screen.findByText('Data tidak ditemukan di proyek ini.')).toBeInTheDocument()
  })

  it('checks the new password confirmation before calling the API', async () => {
    const user = userEvent.setup()
    renderRoute('/profile')
    await user.type(await screen.findByLabelText(/^Kata sandi saat ini/), 'lama-sekali-123')
    await user.type(screen.getByLabelText(/^Kata sandi baru/), 'kata-sandi-baru-yang-panjang')
    await user.type(screen.getByLabelText(/^Ulangi kata sandi baru/), 'beda')
    await user.click(screen.getByRole('button', { name: 'Ganti kata sandi' }))
    expect(
      await screen.findByText('Konfirmasi tidak sama dengan kata sandi baru.'),
    ).toBeInTheDocument()
  })
})
