# 08 - Import Test Case (Excel/CSV/JSON/AI)

## A. Sumber konkret (3 workbook pengguna)

1. `Draft Test Case Phase 2 v.2.xlsx`: 14 sheet; sebagian adalah versi/copy alternatif, metadata dokumen per sheet, header UAT umumnya row 11, **0 embedded image** di workbook.
2. `V2_UAT Phase 1 (Pengembangan Karirhub) 30_31 Juli 2026.xlsx`: 4 sheet pengujian; header row 11; ada **103** file embedded media; hasil status dan bukti.
3. `Tracker v2 Phase 1 Karirhub Development.xlsx`: 7 sheet termasuk copy/aduan/rangkuman; kolom tracker (ID UAT, Bukti, Detail Hasil Aktual, Severity, Status Retest, Catatan Retest) dan **157** embedded media. Ada ID UAT berulang pada beberapa sheet.

Jumlah embedded media yang dihitung dari `xl/media/` dua file tersebut: 103 + 157 = **260**. Jumlah file media **tidak selalu sama** dengan jumlah screenshot unik atau jumlah evidence valid; untuk relasi ke baris butuh pembacaan drawing anchors dan inspeksi manual bila meragukan.

Sumber dan pola detail: `docs/17_SOURCE_MAPPING.md`.

## B. Format input

- XLSX: multi-sheet, header row tidak selalu row 1, metadata sebelum header, merged cells, drawing images, mixed date format, hidden rows/columns.
- CSV: UTF-8 dengan BOM optional; header canonical; delimiter selectable bila perlu.
- JSON AI: `schema_version`, `project_code`, `source_kind`, `source_locale`, `suite_name`, `cases[]`. Contoh `examples/ai_testcases_sample.json` dan schema `examples/ai_testcases.schema.json`.

## C. Canonical minimal columns

`case_code`, `module_code`, `suite_name`, `category`, `title`, `requirement_refs`, `priority_code`, `test_type_code`, `actor_label`, `preconditions`, `test_steps_text`, `expected_result`, `source_locale`, `source_document`.

- Wajib pada UI importer MVP: `module_code`, `suite_name`, `title`, `expected_result`; `case_code` otomatis dibuat jika kosong dan rule disepakati.
- Unknown fields masuk raw payload preview, **jangan hilang diam-diam**.
- `source_document` dari template adalah metadata untuk `test_suites.reference_document` dan/atau notes, bukan kolom langsung `test_cases`.

## D. Mapping legacy

| Header lama | Target | Aturan |
|---|---|---|
| `No.` | `test_cases.sequence_number` | Angka urut bukan PK |
| `ID UAT` | `test_cases.case_code` | Unique per project |
| `Kategori` | `test_cases.category` | Preserve original |
| `Fitur/Proses` / `Fitur / Proses` | `test_cases.title` | Teks asli, optional extraction `[FSD-...]` ke `requirement_refs` hanya dengan review |
| `Prioritas` | `test_cases.priority_code` | Must Have -> MUST_HAVE, Should Have -> SHOULD_HAVE, dst |
| `Jenis Pengujian` | `test_cases.test_type_code` | Positif/Negatif/Hak Akses/SLA/Integrasi/Nonfungsional -> normalisasi dengan mapping & warning |
| `Aktor` | `test_cases.actor_label` | Plain text, bukan otomatis akun user |
| `Prasyarat` | `test_cases.preconditions` | Preserve text |
| `Langkah Pengujian` | `test_cases.test_steps_text` | Preserve numbering/newline; optionally split `test_case_steps` |
| `Hasil yang Diharapkan` | `test_cases.expected_result` | Preserve text |
| `Status` / `Status UAT` | `test_executions.result_status` | **Hanya jika mode import legacy execution dinyalakan** |
| `Detail Hasil Aktual / Defect` | `test_executions.actual_result` | Jangan otomatis menjadi satu defect tanpa review |
| `Bukti` / `Bukti Uji` | `file_objects` + link | Kategori evidence, anchor file |
| `Penguji` | `legacy_tester_name` / `tester_id` | Jangan membuat akun login otomatis dari teks nama |
| `Tgl UAT` / `Tanggal Uji` | `test_executions.tested_at` | Format campuran, timezone policy |
| `Severity` | `defects.severity_code` | Bila benar-benar defect, bukan sekadar grade test case |
| `Status Retest` | `defect status/retest history` | Label sumber ambigu; simpan provenance, tampilkan mapping review |
| `Catatan Retest` | `test_executions.notes` / `defect history` | Terpisah dari status eksekusi awal |

## E. Mapping status dasar

| Indonesia lama | Canonical | English |
|---|---|---|
| Belum Diuji | `NOT_RUN` | Not tested |
| Berhasil Diuji | `PASSED` | Passed |
| Gagal Diuji | `FAILED` | Failed |
| Sedang Diuji (fitur baru) | `IN_PROGRESS` | In progress |
| Blocked (fitur baru) | `BLOCKED` | Blocked |
| Dilewati (fitur baru) | `SKIPPED` | Skipped |

**Peringatan:** `Closed/Open/Pending` pada **Status Retest** bukan sinonim langsung `PASSED/FAILED/NOT_RUN`. Pada beberapa tracker status dan catatan bisa berbeda maknanya. Tampilkan agar user memilih mapping; bila ragu impor sebagai metadata legacy di `import_job_rows.raw_payload_json`, bukan ubah otomatis.

## F. Pemrosesan workbook dengan gambar tertanam

1. ZIP-level `xl/media/*` untuk enumerate; baca hubungan `drawing*.xml` / `.rels` dan anchor row/column.
2. Tautkan gambar ke source sheet dan cell anchor; setelah header diketahui, hubungkan ke baris data yang benar.
3. Jika gambar tidak punya baris valid atau banyak gambar satu area, tampilkan `Needs review` dan pilih manual.
4. Simpan file melalui pipeline upload (scan + optimization) lalu relasi ke `import_job_row_files` memakai `source_anchor`.
5. Untuk import execution lama, setelah commit link ke `execution_files` sesuai row/case.
6. Jangan mencocokkan gambar ke test case hanya berdasarkan urutan ZIP/media filename.
7. Formula/merged cells harus dibaca dengan hati-hati; satu cell dapat merepresentasikan banyak baris visual.

## G. Dedup & import strategy

- Identitas: `(project_id, case_code)`; pada sheet same case code berulang treat sebagai **duplicate/import row**, bukan otomatis create test case baru.
- `source_hash` isi normalized fingerprint untuk idempotency re-import; buat hash secara server-side.
- Mode `CREATE_ONLY`: skip code existing dan laporkan.
- Mode `UPDATE`: overwrite field yang dipilih dan buat revision jika case pernah digunakan.
- Mode `NEW_REVISION`: revise case version; jangan rewrite snapshots run lama.
- Ada dua mode ingest: **(1) Case Library**, default; **(2) Historical UAT Migration**, memerlukan pemilihan cycle/run + konfirmasi.
- Untuk workbook Phase 2 yang berisi versi alternatif, **jangan otomatis mengimpor semua 14 sheet sebagai case baru**. Pilih sheet baseline yang telah disetujui pengguna.
- Spreadsheet 1 dapat berisi source doc metadata di baris 4-8; tidak dibaca sebagai test case.

## H. Preview UX

Table preview: row #, sheet, case code, title, status, errors/warnings, duplicate target, evidence count; tab `Valid`, `Need review`, `Duplicate`, `Invalid`.

Buttons: Back, Download Errors, Confirm Import; setelah commit tampil total rows/valid/inserted/skipped/error dan link ke hasil.

## I. Security

- Jangan mengeksekusi formula spreadsheet atau `=HYPERLINK(...)` saat import; treat as data.
- Lindungi ekspor CSV dari formula injection dengan cell escaping/prefix sesuai kebijakan; jangan mengeksekusi macro XLSM.
- Impor file pengguna harus size/row limit, parser timeout dan memory limit, validasi virus/zip bomb.
- Jangan mengekspor data pribadi penguji dalam sample publik atau Cloudflare demo.

## J. Penerimaan

- 1) Import template canonical tanpa manual mapping.
- 2) Import XLSX Phase 2 dapat memilih sheet, header row 11, tanpa mengimpor metadata sebagai cases.
- 3) Tracker ID UAT yang berulang tidak membuat case ganda.
- 4) Gambar pada workbook diterima di preview dan dapat direlasikan ke row asal (automated jika anchor jelas, manual review jika tidak).
- 5) Error per baris tercatat dalam `import_job_rows`.
- 6) Re-import file yang sama dengan CREATE_ONLY menghasilkan skip, bukan duplikat.
