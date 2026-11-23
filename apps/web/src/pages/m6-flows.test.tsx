import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { createMockDb, type MockDb } from '../mocks/seed'
import { createMockDataSource } from '../services/mock-data-source'
import { renderRoute } from '../test/render'

const P = '/projects/DEMO-KARIR'
const HEADER =
  'case_code,module_code,suite_name,category,title,requirement_refs,priority_code,test_type_code,actor_label,preconditions,test_steps_text,expected_result,source_locale,source_document,result_status,tester_name'

function withDb(mutate?: (db: MockDb) => void, superAdmin = true) {
  const db = createMockDb()
  mutate?.(db)
  return { db, dataSource: createMockDataSource({ latencyMs: 0, db, superAdmin }) }
}

const csvFile = (rows: string[]) =>
  new File([[HEADER, ...rows].join('\n')], 'kasus-baru.csv', { type: 'text/csv' })

describe('import wizard (TB-IMP-001)', () => {
  it('uploads a CSV, previews it, applies it and links to the result', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    const { router } = renderRoute(`${P}/imports`, { dataSource })
    await screen.findByRole('heading', { level: 1, name: 'Impor dari Excel' })

    await user.upload(
      screen.getByLabelText('Pilih file'),
      csvFile([
        'WIZ-001,WIZ,Wizard,,Isi formulir pendaftaran,,Must Have,Positif,,,1. Isi,Data tersimpan,id,,,',
        'WIZ-002,WIZ,Wizard,,Kirim tanpa isi,,,Negatif,,,1. Kirim,,id,,,',
      ]),
    )
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/imports\/\d+$/))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'kasus-baru.csv' }),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Periksa' }))
    const preview = (await screen.findByRole('heading', { name: 'Pratinjau' })).closest(
      'section',
    ) as HTMLElement
    expect(within(preview).getByText('Akan dibuat').nextSibling).toHaveTextContent('1')
    expect(within(preview).getByText('Tidak valid').nextSibling).toHaveTextContent('1')
    expect(await screen.findByText(/Hasil yang diharapkan: wajib diisi/)).toBeInTheDocument()

    await user.click(within(preview).getByRole('button', { name: 'Terapkan impor' }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByRole('button', { name: 'Terapkan impor' }))
    expect(
      await screen.findByText('Impor selesai sebagian: baris bermasalah tidak ikut.'),
    ).toBeInTheDocument()
    expect(screen.getByText(/^1 dibuat/)).toBeInTheDocument()
    expect(db.cases.find((c) => c.case_code === 'WIZ-001')).toMatchObject({ case_status: 'DRAFT' })
    expect(db.cases.find((c) => c.case_code === 'WIZ-002')).toBeUndefined()
    expect(screen.getByRole('link', { name: 'Lihat skenario uji' })).toHaveAttribute(
      'href',
      `${P}/test-cases`,
    )
  })

  it('migrates old results into a run when asked', async () => {
    const user = userEvent.setup()
    const { db, dataSource } = withDb()
    renderRoute(`${P}/imports`, { dataSource })
    await user.upload(
      await screen.findByLabelText('Pilih file'),
      csvFile([
        'OLD-001,OLD,,,Login lama,,,,,,,Masuk,id,,Berhasil Diuji,Penguji Lama',
        'OLD-002,OLD,,,Logout lama,,,,,,,Keluar,id,,Closed,Penguji Lama',
      ]),
    )
    await user.click(await screen.findByRole('checkbox', { name: /Pindahkan juga hasil UAT lama/ }))
    await user.clear(screen.getByLabelText(/^Nama lembar uji/))
    await user.type(screen.getByLabelText(/^Nama lembar uji/), 'Migrasi UAT lama')
    await user.click(screen.getByRole('button', { name: 'Periksa' }))

    const closed = await screen.findByLabelText(/Status "Closed"/)
    expect(closed).toHaveValue('')
    expect(screen.getByLabelText(/Status "Berhasil Diuji"/)).toHaveValue('PASSED')

    await user.click(screen.getByRole('button', { name: 'Terapkan impor' }))
    await user.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Terapkan impor',
      }),
    )
    expect(await screen.findByText(/Lembar uji RUN-\d{8}-\d+: 1 hasil uji/)).toBeInTheDocument()
    const run = db.runs.find((r) => r.name === 'Migrasi UAT lama')
    expect(run?.status_code).toBe('COMPLETED')
    expect(screen.getByRole('link', { name: 'Buka lembar uji' })).toHaveAttribute(
      'href',
      `${P}/runs/${run?.id}`,
    )
  })

  it('explains that Excel needs the server in the demo, and that only leads can import', async () => {
    const user = userEvent.setup()
    const { dataSource } = withDb()
    const view = renderRoute(`${P}/imports`, { dataSource })
    await user.upload(await screen.findByLabelText('Pilih file'), new File(['PK'], 'uat.xlsx'))
    expect(
      await screen.findByText('Impor Excel butuh server; di mode demo gunakan CSV atau JSON.'),
    ).toBeInTheDocument()
    view.unmount()

    const tester = withDb((db) => {
      db.currentUserId = '3'
    }, false)
    renderRoute(`${P}/imports`, { dataSource: tester.dataSource })
    expect(await screen.findByText('Impor hanya bisa dilakukan oleh Admin.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Pilih file')).toBeNull()
  })
})
