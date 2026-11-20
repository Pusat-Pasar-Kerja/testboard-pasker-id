# 06 - API Contract (draft untuk implementasi)

## Konvensi

- Base API: `/api/v1`; backend Hono + Node.js (production VPS), transport HTTPS via reverse proxy Apache.
- Semua request/response JSON, kecuali upload/download dan export.
- Akses berdasarkan cookie session httpOnly atau desain token server-side sesuai hasil security design; tidak menyimpan auth token pada localStorage.
- `Authorization` ditegakkan pada **setiap** endpoint; `projectCode` tidak menjadi bukti bahwa user anggota project.
- `id` BIGINT direpresentasikan sebagai **string** di JSON.
- Pagination: `?page=1&page_size=25` (maksimum 100); sort allowlist; filter explicit.
- Status HTTP: 200/201/202/204 sukses, 400/422 validasi, 401 unauthenticated, 403 unauthorized, 404 not found/hidden resource, 409 conflict, 413 too large, 415 invalid MIME, 429 rate limit, 500 internal error.
- Error format seragam:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Data yang dimasukkan tidak valid.",
    "details": [{"field":"expected_result","message":"Wajib diisi"}],
    "request_id": "req-example"
  }
}
```

- Untuk create/import/upload, gunakan idempotency key (header atau request token) agar double click tidak menduplikasi data.
- API mengembalikan `created_at` dan `updated_at` ISO 8601 UTC; frontend format ID/EN sesuai user setting.

## Auth/Profile (memerlukan implementasi sesi aman; schema gap)

| Method | Endpoint | Tujuan |
|---|---|---|
| POST | `/auth/login` | Login email/password, rate limit |
| POST | `/auth/logout` | Invalidate session |
| GET | `/auth/me` | Identity + role per project |
| PATCH | `/profile` | Display name & locale |
| POST | `/profile/change-password` | Current password verified |

## Projects / membership / module

| Method | Endpoint | Tujuan |
|---|---|---|
| GET | `/projects` | Daftar project anggota |
| POST | `/projects` | Create (system admin/admin policy) |
| GET/PATCH | `/projects/:projectId` | Detail/update |
| GET/POST | `/projects/:projectId/members` | Daftar/add member |
| PATCH/DELETE | `/projects/:projectId/members/:userId` | Ganti role/remove |
| GET/POST | `/projects/:projectId/modules` | Daftar/create module |
| PATCH | `/projects/:projectId/modules/:moduleId` | Ubah module |
| GET/PATCH | `/projects/:projectId/settings` | Baca/ubah setting |

## Test suite / cases / revisions

| Method | Endpoint | Tujuan |
|---|---|---|
| GET/POST | `/projects/:p/suites` | List/create suite |
| GET/PATCH | `/projects/:p/suites/:id` | Detail/update suite |
| GET/POST | `/projects/:p/test-cases` | Search/create case |
| GET/PATCH | `/projects/:p/test-cases/:id` | Detail/edit, increment revision |
| POST | `/projects/:p/test-cases/:id/clone` | Duplicate dengan case_code baru |
| POST | `/projects/:p/test-cases/:id/archive` | Archive soft delete |
| GET | `/projects/:p/test-cases/:id/revisions` | Revisions |
| PUT | `/projects/:p/test-cases/:id/translations/:locale` | Isi terjemahan manual |

### Contoh create case

```json
{
  "case_code": "UAT-LOGIN-001",
  "module_code": "AUTH",
  "suite_id": "12",
  "category": "Autentikasi",
  "title": "Pengguna berhasil login dengan akun aktif",
  "priority_code": "MUST_HAVE",
  "test_type_code": "POSITIVE",
  "actor_label": "Tester",
  "preconditions": "Akun uji sudah tersedia",
  "test_steps_text": "1. Buka halaman login\n2. Isi kredensial yang valid\n3. Klik Masuk",
  "expected_result": "Pengguna masuk ke dashboard sesuai role",
  "source_locale": "id",
  "case_status": "DRAFT"
}
```

## Cycles, Runs & Executions

| Method | Endpoint | Tujuan |
|---|---|---|
| GET/POST | `/projects/:p/cycles` | List/create cycle |
| PATCH | `/projects/:p/cycles/:id` | Edit cycle |
| GET/POST | `/projects/:p/runs` | List/create run |
| GET/PATCH | `/projects/:p/runs/:id` | Detail/edit run |
| POST | `/projects/:p/runs/:id/cases` | Add cases; freeze case_snapshot_json |
| PATCH | `/projects/:p/runs/:id/cases/:runCaseId` | Assign tester |
| GET | `/projects/:p/runs/:id/cases` | List latest status via view |
| POST | `/projects/:p/run-cases/:runCaseId/executions` | Create new attempt |
| GET | `/projects/:p/run-cases/:runCaseId/executions` | History attempts |
| POST | `/projects/:p/runs/:id/complete` | Complete/lock according policy |

### Contoh POST execution

```json
{
  "execution_kind":"INITIAL",
  "result_status":"FAILED",
  "actual_result":"Tombol Simpan tidak merespons setelah valid submit",
  "notes":"Browser Chrome pada staging",
  "browser_name":"Chrome",
  "device_name":"Desktop",
  "step_results":[{"step_number":1,"result_status":"PASSED"},{"step_number":2,"result_status":"FAILED","actual_result":"Tidak ada respons"}],
  "evidence_file_ids":["104", "105"],
  "create_defect":false
}
```

Server menghitung `attempt_number`, `tested_at`, `tester_id` dan memverifikasi bahwa semua file ada di project yang sama dan sudah `READY` + `CLEAN`. Jangan percaya `tester_id` yang dikirim user.

## Defects

| Method | Endpoint | Tujuan |
|---|---|---|
| GET/POST | `/projects/:p/defects` | Filter/create bug; standalone allowed |
| GET/PATCH | `/projects/:p/defects/:id` | Detail/update; field restrictions |
| POST | `/projects/:p/defects/:id/status` | Transition + history in transaction |
| POST/GET | `/projects/:p/defects/:id/comments` | Post/list comments |
| GET | `/projects/:p/defects/:id/history` | Timeline |
| POST/DELETE | `/projects/:p/defects/:id/executions` | Link/unlink executions |

## Files (multi-upload)

| Method | Endpoint | Tujuan |
|---|---|---|
| POST | `/projects/:p/files` | Multipart upload (single or multiple), create PROCESSING |
| GET | `/projects/:p/files/:fileId/status` | PROCESSING/READY/FAILED + scan status |
| GET | `/projects/:p/files/:fileId/preview` | Authenticated image/video preview, range support |
| GET | `/projects/:p/files/:fileId/download` | Authorized download, Content-Disposition |
| DELETE | `/projects/:p/files/:fileId` | Soft delete/unlink under policy |
| POST | `/projects/:p/executions/:id/files` | Attach existing READY files |
| POST | `/projects/:p/defects/:id/files` | Attach existing READY files |
| POST | `/projects/:p/test-cases/:id/files` | Attach existing READY files |

### Contoh response file processing

```json
{
  "id":"77",
  "processing_status":"READY",
  "scan_status":"CLEAN",
  "evidence_type":"SCREENSHOT",
  "original_filename":"screenshot_01.png",
  "original_size_bytes":2480000,
  "stored_size_bytes":921450,
  "compression_method":"PNG_OPTIMIZE",
  "compression_note":null
}
```

## Import & exports

| Method | Endpoint | Tujuan |
|---|---|---|
| POST | `/projects/:p/imports` | Upload file import, create job |
| GET | `/projects/:p/imports/:jobId` | Status job + summary |
| POST | `/projects/:p/imports/:jobId/parse` | Pilih sheet/header dan parse |
| PATCH | `/projects/:p/imports/:jobId/mapping` | Mapping kolom |
| GET | `/projects/:p/imports/:jobId/preview` | Row-by-row validation preview |
| POST | `/projects/:p/imports/:jobId/commit` | Commit mode CREATE_ONLY/UPDATE/NEW_REVISION |
| GET | `/projects/:p/imports/:jobId/errors.csv` | Row errors CSV |
| GET | `/projects/:p/reports/summary` | Dashboard aggregates |
| GET | `/projects/:p/reports/export` | CSV/XLSX, filter scoped |

## Nonfunctional API rules

- Prepared statements MySQL; transaction untuk multi-row writes.
- No raw SQL filtering string interpolation.
- Query limit + indexes; avoid N+1 query per row.
- Download file obey authorization and log audit metadata (not binary).
- Support `X-Request-ID` correlation; do not log password/token or raw evidence.
- Route paths above adalah **desain kontrak**, bukan endpoint yang telah diimplementasikan.
