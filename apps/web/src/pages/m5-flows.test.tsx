import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb, type MockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

const P = '/projects/DEMO-KARIR'
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
const png = (name: string) =>
  new File([new Uint8Array([...PNG, ...new Array(6000).fill(3)])], name, { type: 'image/png' })
const settle = () => new Promise((resolve) => setTimeout(resolve, 150))

function withDb(mutate?: (db: MockDb) => void, superAdmin = true) {
  const db = createMockDb()
  mutate?.(db)
  return { db, dataSource: createMockDataSource({ latencyMs: 0, db, superAdmin }) }
}

function freshCase(db: MockDb) {
  const run = db.runs.find((r) => r.run_code === 'RUN-S2-20261109')
  const rc = db.runCases
    .filter((x) => x.runId === run?.id)
    .sort((a, b) => a.sort_order - b.sort_order)
    .find((x) => !db.executions.some((e) => e.runCaseId === x.id))
  if (!run || !rc) throw new Error('no fresh run case')
  return { run, rc }
}

describe('evidence while testing (TB-FILE-001)', () => {
  it('uploads a screenshot, shows the compression, saves it with the failed attempt', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const { run, rc } = freshCase(db)
    renderRoute(`${P}/runs/${run.id}/cases/${rc.id}`, { dataSource })
    await screen.findByRole('heading', { name: 'Catat hasil' })

    const result = screen.getByRole('group', { name: 'Hasil uji' })
    await user.click(within(result).getByRole('radio', { name: 'Tidak sesuai' }))
    expect(
      screen.getByText('Hasil gagal sebaiknya disertai tangkapan layar sebagai bukti.'),
    ).toBeInTheDocument()

    await user.upload(screen.getByLabelText('Pilih file'), png('login-gagal.png'))
    expect(await screen.findByText(/tanpa mengurangi ketajaman/)).toBeInTheDocument()
    expect(
      screen.queryByText('Hasil gagal sebaiknya disertai tangkapan layar sebagai bukti.'),
    ).toBeNull()
    await user.type(
      screen.getByLabelText('Keterangan untuk login-gagal.png'),
      'Tombol tidak merespons',
    )
    await user.selectOptions(screen.getByLabelText('Langkah untuk login-gagal.png'), 'Langkah 2')
    await user.type(screen.getByLabelText(/^Hasil aktual/), 'Halaman tetap diam')
    await user.click(screen.getByRole('button', { name: 'Simpan hasil' }))

    expect(await screen.findByText('Percobaan #1 tersimpan: Tidak sesuai.')).toBeInTheDocument()
    const saved = db.executions.find((e) => e.runCaseId === rc.id)
    expect(saved?.files).toEqual([
      { fileId: expect.any(String), caption: 'Tombol tidak merespons', step_number: 2 },
    ])
    expect(
      (await screen.findAllByRole('button', { name: 'Lihat login-gagal.png' })).length,
    ).toBeGreaterThan(0)
  })

  it('explains why a disguised file is rejected', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const { run, rc } = freshCase(db)
    renderRoute(`${P}/runs/${run.id}/cases/${rc.id}`, { dataSource })
    await screen.findByRole('heading', { name: 'Catat hasil' })
    await user.upload(
      screen.getByLabelText('Pilih file'),
      new File(['bukan gambar'], 'palsu.png', { type: 'image/png' }),
    )
    expect(await screen.findByText('Ditolak: Isi file tidak sesuai jenisnya')).toBeInTheDocument()
  })
})

describe('evidence on bugs and in the Evidence Center', () => {
  /** A failed attempt with one READY screenshot, created through the data source. */
  async function failedAttemptWithScreenshot() {
    const env = withDb()
    const { run, rc } = freshCase(env.db)
    const upload = await env.dataSource.uploadFile('DEMO-KARIR', png('bukti.png'))
    await settle()
    const fileId = upload.files[0]?.id ?? ''
    const attempt = await env.dataSource.createExecution(
      'DEMO-KARIR',
      rc.id,
      {
        result_status: 'FAILED',
        actual_result: 'Data tidak tersimpan',
        evidence: [{ file_id: fileId, caption: 'Pesan galat' }],
      },
      'key-evidence',
    )
    return { ...env, run, rc, fileId, attempt }
  }

  it('reuses the attempt screenshot on a new bug without copying it', async () => {
    const user = userEvent.setup()
    const { db, dataSource, rc, fileId, attempt } = await failedAttemptWithScreenshot()
    renderRoute(`${P}/bugs/new?runCase=${rc.id}&execution=${attempt.id}`, { dataSource })
    const reuse = await screen.findByRole('checkbox', { name: /Pesan galat/ })
    expect(reuse).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Simpan' }))
    await screen.findByText(/^Masalah BUG-DKR-\d{4} dibuat\.$/)
    expect(db.defects.at(-1)?.files).toEqual([
      { fileId, caption: 'Pesan galat', step_number: null },
    ])
    expect(db.files.filter((f) => f.id === fileId)).toHaveLength(1)
  })

  it('lists files with where they are used, protects used files and deletes unused ones', async () => {
    const user = userEvent.setup()
    const { dataSource, run, rc } = await failedAttemptWithScreenshot()
    await dataSource.uploadFile('DEMO-KARIR', png('tidak-dipakai.png'))
    await settle()
    renderRoute(`${P}/evidence`, { dataSource })

    const used = (await screen.findByText('bukti.png')).closest('li') as HTMLElement
    expect(within(used).getByRole('link', { name: /RUN-S2-20261109/ })).toHaveAttribute(
      'href',
      `${P}/runs/${run.id}/cases/${rc.id}`,
    )
    expect(within(used).queryByRole('button', { name: /^Hapus bukti\.png/ })).toBeNull()

    await user.click(within(used).getByRole('button', { name: 'Lihat bukti.png' }))
    const viewer = await screen.findByRole('dialog')
    expect(within(viewer).getByRole('link', { name: 'Unduh' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    const unused = screen.getByText('tidak-dipakai.png').closest('li') as HTMLElement
    await user.click(within(unused).getByRole('button', { name: 'Hapus tidak-dipakai.png?' }))
    const confirm = await screen.findByRole('alertdialog')
    await user.click(within(confirm).getByRole('button', { name: 'Keluarkan' }))
    expect(await screen.findByText('File dihapus.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByText('tidak-dipakai.png')).toBeNull())
  })

  it('lets viewers browse evidence but not upload', async () => {
    const { dataSource } = withDb((d) => {
      d.currentUserId = '6'
    }, false)
    renderRoute(`${P}/evidence`, { dataSource })
    await screen.findByRole('heading', { level: 1, name: 'Foto & bukti' })
    expect(screen.queryByRole('heading', { name: 'Unggah file' })).toBeNull()
    expect(screen.queryByLabelText('Pilih file')).toBeNull()
  })
})
