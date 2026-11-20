import sharp from 'sharp'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { execute, insertedId, selectOne } from '../src/db/tx.js'
import {
  docx,
  eicar,
  harWithSecrets,
  jpegWithGps,
  pdf,
  uiPixels,
  uiPng,
} from './support/fixtures.js'
import { addMember, Client, createHarness, createProject, createUser } from './support/harness.js'

const h = createHarness()
const failingScan = createHarness({
  scanner: { scan: async () => ({ status: 'ERROR', engine: 'CLAMAV' }) },
})
afterAll(async () => {
  await Promise.all([h.files.idle(), failingScan.files.idle()])
  await Promise.all([h.pool.end(), failingScan.pool.end()])
})

let project: { id: string; code: string }
let lead: Client
let tester: Client
let otherTester: Client
let developer: Client
let viewer: Client
let testerId: string
let developerId: string
const P = () => `/projects/${project.code}`

async function make(role: 'QA_LEAD' | 'TESTER' | 'DEVELOPER' | 'VIEWER', harness = h) {
  const user = await createUser(harness.pool, { name: role })
  await addMember(harness.pool, project.id, user.id, role)
  const client = new Client(harness)
  await client.login(user.email)
  return { user, client }
}

/** Upload, wait for processing, return the final file DTOs. */
async function uploadDone(
  client: Client,
  files: { name: string; data: Buffer | string }[],
  harness = h,
) {
  const res = await client.upload(`${P()}/files`, files)
  expect(res.status).toBe(202)
  await harness.files.idle()
  const done = []
  for (const file of res.json.files as { id: string }[]) {
    done.push((await client.get(`${P()}/files/${file.id}/status`)).json)
  }
  return { response: res.json, files: done }
}

async function activeRunCase() {
  const testCase = await lead.post(`${P()}/test-cases`, {
    module_code: 'AUTH',
    title: `Bukti ${Math.random().toString(36).slice(2, 7)}`,
    test_steps_text: '1. Buka\n2. Simpan',
    expected_result: 'Tersimpan',
    case_status: 'READY',
  })
  const run = await lead.post(`${P()}/runs`, { name: 'Run bukti' })
  await lead.post(`${P()}/runs/${run.json.id}/cases`, {
    test_case_ids: [testCase.json.id],
    assigned_to: testerId,
  })
  await lead.post(`${P()}/runs/${run.json.id}/status`, { status_code: 'ACTIVE' })
  const detail = await lead.get(`${P()}/runs/${run.json.id}`)
  return {
    runId: run.json.id as string,
    runCaseId: detail.json.run_cases[0].run_case_id as string,
    caseId: testCase.json.id as string,
  }
}

beforeAll(async () => {
  project = await createProject(h.pool)
  lead = (await make('QA_LEAD')).client
  const t = await make('TESTER')
  tester = t.client
  testerId = t.user.id
  otherTester = (await make('TESTER')).client
  const d = await make('DEVELOPER')
  developer = d.client
  developerId = d.user.id
  viewer = (await make('VIEWER')).client
})

describe('upload pipeline (doc 07)', () => {
  it('stores 3 screenshots + 1 PDF and attaches them to a failed attempt (TB-FILE-001)', async () => {
    const png = await uiPng()
    const { files } = await uploadDone(tester, [
      { name: 'login-1.png', data: png },
      { name: 'login-2.png', data: png },
      { name: 'login-3.jpg', data: await jpegWithGps() },
      { name: 'catatan.pdf', data: pdf() },
    ])
    expect(files.map((f) => [f.processing_status, f.scan_status, f.scan_engine])).toEqual(
      Array(4).fill(['READY', 'CLEAN', 'BASIC']),
    )
    const { runCaseId } = await activeRunCase()
    const saved = await tester.post(`${P()}/run-cases/${runCaseId}/executions`, {
      result_status: 'FAILED',
      actual_result: 'Tombol simpan tidak merespons',
      evidence: files.map((f, i) => ({
        file_id: f.id,
        caption: `Bukti ${i + 1}`,
        step_number: i === 0 ? 2 : null,
      })),
    })
    expect(saved.status).toBe(201)
    expect(saved.json.files).toHaveLength(4)
    expect(saved.json.files[0]).toMatchObject({ caption: 'Bukti 1', step_number: 2 })
  })

  it('compresses a UI screenshot losslessly: smaller, pixel-identical (TB-FILE-002)', async () => {
    const original = await uiPng()
    const { files } = await uploadDone(tester, [{ name: 'layar.png', data: original }])
    const file = files[0]
    expect(['WEBP_LOSSLESS', 'PNG_OPTIMIZE']).toContain(file.compression_method)
    expect(file.stored_size_bytes).toBeLessThan(file.original_size_bytes / 2)
    expect([file.width_px, file.height_px]).toEqual([900, 560])
    expect(file.has_thumbnail).toBe(true)

    const download = await tester.raw(`${P()}/files/${file.id}/download`)
    expect(download.status).toBe(200)
    expect(download.headers.get('content-disposition')).toMatch(
      /^attachment; filename="layar\.(webp|png)"/,
    )
    const decoded = await sharp(download.bytes).removeAlpha().raw().toBuffer()
    expect(decoded.equals(uiPixels())).toBe(true)

    const thumb = await tester.raw(`${P()}/files/${file.id}/thumbnail`)
    expect(thumb.headers.get('content-type')).toBe('image/webp')
    expect((await sharp(thumb.bytes).metadata()).width).toBeLessThanOrEqual(480)
  })

  it('removes EXIF/GPS from photos', async () => {
    const input = await jpegWithGps()
    expect((await sharp(input).metadata()).exif).toBeDefined()
    const { files } = await uploadDone(tester, [{ name: 'foto.jpg', data: input }])
    const stored = (await tester.raw(`${P()}/files/${files[0].id}/download`)).bytes
    expect((await sharp(stored).metadata()).exif).toBeUndefined()
    expect(stored.includes('Lokasi-Rahasia-Penguji')).toBe(false)
  })

  it('keeps an already-compressed PDF unchanged and says why (TB-FILE-003)', async () => {
    const input = pdf()
    const { files } = await uploadDone(tester, [{ name: 'laporan.pdf', data: input }])
    expect(files[0]).toMatchObject({
      processing_status: 'READY',
      compression_method: 'NONE',
      compression_note: 'ALREADY_COMPRESSED',
      stored_size_bytes: input.length,
    })
    const preview = await tester.raw(`${P()}/files/${files[0].id}/preview`)
    expect(preview.bytes.equals(input)).toBe(true)
    expect(preview.headers.get('content-disposition')).toMatch(/^inline/)
    expect(preview.headers.get('content-security-policy')).toContain('sandbox')
    const partial = await tester.raw(`${P()}/files/${files[0].id}/preview`, { Range: 'bytes=0-7' })
    expect(partial.status).toBe(206)
    expect(partial.bytes.toString('latin1')).toBe('%PDF-1.4')
  })

  it('rejects a disguised file and never serves or attaches it (TB-FILE-004)', async () => {
    const { files } = await uploadDone(tester, [{ name: 'gambar.png', data: '<?php echo 1; ?>' }])
    expect(files[0]).toMatchObject({
      processing_status: 'REJECTED',
      failure_reason: 'SIGNATURE_MISMATCH',
    })
    expect((await tester.raw(`${P()}/files/${files[0].id}/download`)).status).toBe(409)
    const bug = await tester.post(`${P()}/defects`, {
      title: 'Bug dengan file palsu',
      evidence: [{ file_id: files[0].id }],
    })
    expect(bug.status).toBe(422)
  })

  it('refuses risky types, empty files, macros, active PDFs and zip bombs', async () => {
    const { response, files } = await uploadDone(tester, [
      { name: 'setup.exe', data: 'MZ' },
      { name: 'kosong.txt', data: '' },
      { name: 'makro.docx', data: docx([{ name: 'word/vbaProject.bin', data: 'x' }]) },
      { name: 'aktif.pdf', data: pdf('/OpenAction << /S /JavaScript /JS (app.alert(1)) >> ') },
      {
        name: 'bom.docx',
        data: docx([{ name: 'word/media/big.xml', data: 'a', declared: 300 * 1024 * 1024 }]),
      },
      { name: 'dokumen.docx', data: docx() },
      { name: 'virus.txt', data: eicar() },
    ])
    expect(response.rejected).toEqual([
      { original_filename: 'setup.exe', failure_reason: 'TYPE_NOT_ALLOWED' },
    ])
    expect(files.map((f) => [f.original_filename, f.processing_status, f.failure_reason])).toEqual([
      ['kosong.txt', 'REJECTED', 'EMPTY'],
      ['makro.docx', 'REJECTED', 'ACTIVE_CONTENT'],
      ['aktif.pdf', 'REJECTED', 'ACTIVE_CONTENT'],
      ['bom.docx', 'REJECTED', 'ARCHIVE_BOMB'],
      ['dokumen.docx', 'READY', null],
      ['virus.txt', 'REJECTED', 'INFECTED'],
    ])
    expect(files.at(-1).scan_status).toBe('INFECTED')
  })

  it('never releases a file when the scan fails (TB-FILE-005)', async () => {
    const member = await createUser(failingScan.pool)
    await addMember(failingScan.pool, project.id, member.id, 'TESTER')
    const client = new Client(failingScan)
    await client.login(member.email)
    const { files } = await uploadDone(
      client,
      [{ name: 'layar.png', data: await uiPng() }],
      failingScan,
    )
    expect(files[0]).toMatchObject({
      processing_status: 'FAILED',
      scan_status: 'ERROR',
      failure_reason: 'SCAN_ERROR',
    })
    expect((await client.raw(`${P()}/files/${files[0].id}/preview`)).status).toBe(409)
  })

  it('hides files from other projects and blocks viewers from uploading (TB-FILE-006)', async () => {
    const { files } = await uploadDone(tester, [{ name: 'rahasia.png', data: await uiPng() }])
    const other = await createProject(h.pool)
    const outsider = await createUser(h.pool)
    await addMember(h.pool, other.id, outsider.id, 'ADMIN')
    const client = new Client(h)
    await client.login(outsider.email)
    expect((await client.raw(`${P()}/files/${files[0].id}/download`)).status).toBe(404)
    expect((await client.raw(`/projects/${other.code}/files/${files[0].id}/download`)).status).toBe(
      404,
    )
    expect(
      (await viewer.upload(`${P()}/files`, [{ name: 'a.png', data: await uiPng() }])).status,
    ).toBe(403)
    expect((await viewer.raw(`${P()}/files/${files[0].id}/download`)).status).toBe(200)
  })

  it('redacts secrets from HAR logs and stores logs gzip-compressed', async () => {
    const input = harWithSecrets()
    const { files } = await uploadDone(tester, [{ name: 'jaringan.har', data: input }])
    expect(files[0]).toMatchObject({ processing_status: 'READY', compression_method: 'GZIP' })
    expect(files[0].compression_note).toContain('HAR_REDACTED')
    expect(files[0].stored_size_bytes).toBeLessThan(files[0].original_size_bytes)
    const preview = await tester.raw(`${P()}/files/${files[0].id}/preview`)
    expect(preview.headers.get('content-type')).toBe('text/plain; charset=utf-8')
    const text = preview.bytes.toString('utf8')
    expect(text).toContain('[DISENSOR]')
    for (const secret of [
      'SESSION-SECRET-123',
      'TOKEN-SECRET-456',
      'QUERY-SECRET-789',
      'CSRF-SECRET-000',
    ]) {
      expect(text).not.toContain(secret)
    }
    expect(text).toContain('staging.demo.invalid')
  })

  it('limits files per request and per type size', async () => {
    const many = Array.from({ length: 11 }, (_, i) => ({ name: `f${i}.txt`, data: 'log' }))
    expect((await tester.upload(`${P()}/files`, many)).status).toBe(413)
    const big = Buffer.alloc(16 * 1024 * 1024, 0x41)
    const { files } = await uploadDone(tester, [{ name: 'besar.png', data: big }])
    expect(files[0]).toMatchObject({ processing_status: 'REJECTED', failure_reason: 'TOO_LARGE' })
  })
})

describe('attaching evidence', () => {
  it('lets the tester add to their own attempt; others are refused', async () => {
    const { runCaseId } = await activeRunCase()
    const saved = await tester.post(`${P()}/run-cases/${runCaseId}/executions`, {
      result_status: 'PASSED',
    })
    const { files } = await uploadDone(tester, [{ name: 'tambahan.png', data: await uiPng() }])
    const url = `${P()}/executions/${saved.json.id}/files`
    expect((await otherTester.post(url, { files: [{ file_id: files[0].id }] })).status).toBe(403)
    const added = await tester.post(url, {
      files: [{ file_id: files[0].id, caption: 'Setelah simpan' }],
    })
    expect(added.status).toBe(201)
    expect(added.json[0]).toMatchObject({ id: files[0].id, caption: 'Setelah simpan' })
    expect((await tester.delete(`${url}/${files[0].id}`)).status).toBe(403)
    expect((await lead.delete(`${url}/${files[0].id}`)).status).toBe(204)
  })

  it('reuses attempt evidence on a bug without copying, and limits developers', async () => {
    const { files } = await uploadDone(tester, [{ name: 'bug.png', data: await uiPng() }])
    const bug = await tester.post(`${P()}/defects`, {
      title: 'Halaman putih setelah simpan',
      evidence: [{ file_id: files[0].id, caption: 'Layar putih' }],
    })
    expect(bug.status).toBe(201)
    expect(bug.json.files[0]).toMatchObject({ id: files[0].id, caption: 'Layar putih' })

    const { files: more } = await uploadDone(developer, [
      { name: 'perbaikan.png', data: await uiPng() },
    ])
    const url = `${P()}/defects/${bug.json.id}/files`
    expect((await developer.post(url, { files: [{ file_id: more[0].id }] })).status).toBe(403)
    await lead.patch(`${P()}/defects/${bug.json.id}`, { assigned_to: developerId })
    expect((await developer.post(url, { files: [{ file_id: more[0].id }] })).status).toBe(201)

    const usage = await lead.get(`${P()}/files/${files[0].id}`)
    expect(usage.json.usages.map((u: { kind: string }) => u.kind)).toEqual(['DEFECT'])
  })

  it('attaches reference files to a test case (leads only)', async () => {
    const { caseId } = await activeRunCase()
    const { files } = await uploadDone(lead, [{ name: 'spesifikasi.pdf', data: pdf() }])
    const url = `${P()}/test-cases/${caseId}/files`
    expect((await tester.post(url, { files: [{ file_id: files[0].id }] })).status).toBe(403)
    expect((await lead.post(url, { files: [{ file_id: files[0].id }] })).status).toBe(201)
    expect((await lead.get(`${P()}/test-cases/${caseId}`)).json.files[0].id).toBe(files[0].id)
  })

  it('removes only unattached uploads and lists evidence with usages', async () => {
    const { files } = await uploadDone(tester, [
      { name: 'batal.png', data: await uiPng() },
      { name: 'dipakai.png', data: await uiPng() },
    ])
    const bug = await tester.post(`${P()}/defects`, {
      title: 'Bug dengan bukti',
      evidence: [{ file_id: files[1].id }],
    })
    expect((await otherTester.delete(`${P()}/files/${files[0].id}`)).status).toBe(403)
    expect((await tester.delete(`${P()}/files/${files[0].id}`)).status).toBe(204)
    expect((await tester.delete(`${P()}/files/${files[1].id}`)).status).toBe(409)

    const list = await viewer.get(`${P()}/files?q=dipakai`)
    expect(list.json.data[0].usages).toEqual([
      { kind: 'DEFECT', label: bug.json.bug_code, path: `bugs/${bug.json.id}` },
    ])
    const audit = await selectOne<{ n: number }>(
      h.pool,
      "SELECT COUNT(*) AS n FROM audit_logs WHERE entity_type = 'file' AND action_code = 'DOWNLOAD' AND project_id = ?",
      [project.id],
    )
    expect(Number(audit?.n)).toBeGreaterThan(0)
  })

  it('fails uploads interrupted by a restart instead of releasing them', async () => {
    const result = await execute(
      h.pool,
      `INSERT INTO file_objects (project_id, storage_backend, bucket_name, object_key, original_filename,
         original_mime, stored_mime, evidence_type, original_size_bytes, processing_status, scan_status)
       VALUES (?, 'PRIVATE_LOCAL', 'testboard', ?, 'putus.png', 'image/png', 'image/png', 'SCREENSHOT', 10,
               'PROCESSING', 'PENDING')`,
      [
        project.id,
        `${project.id}/2026/11/00000000-0000-4000-8000-${Date.now().toString().padStart(12, '0').slice(-12)}.part`,
      ],
    )
    await h.files.idle()
    expect(await h.files.recover()).toBeGreaterThanOrEqual(1)
    const status = await tester.get(`${P()}/files/${insertedId(result)}/status`)
    expect(status.json).toMatchObject({
      processing_status: 'FAILED',
      failure_reason: 'INTERRUPTED',
      scan_status: 'ERROR',
    })
  })
})
