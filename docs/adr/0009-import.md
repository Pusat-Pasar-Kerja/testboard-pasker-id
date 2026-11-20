# ADR 0009 - Impor test case dan migrasi hasil UAT lama (Milestone 6)

- **Status:** Diterima (20 November 2026)
- **Dasar:** blueprint doc 08, doc 17, doc 06 (Import), doc 13 (`TB-IMP-001..007`)
- **Keputusan pemilik proyek:** impor pustaka test case **dan** migrasi hasil UAT lama (status, tanggal, nama penguji sebagai teks, screenshot tertanam) ke sebuah run.

## Alur (job)

`POST /imports` (unggah) -> `PUT /imports/:id/config` (pilih sheet, baris header, pemetaan kolom, opsi; menghasilkan pratinjau) -> `GET /imports/:id/rows` -> `POST /imports/:id/commit` (berjalan di latar, klien memantau status) -> `COMPLETED` / `PARTIAL` / `FAILED`. Job yang belum diterapkan boleh dibatalkan (`DELETE`); yang sudah diterapkan disimpan sebagai riwayat. Hanya ADMIN/QA Lead (`import.manage`).

File sumber disimpan privat di `STORAGE_DIR/imports/<job>/` bersama cache hasil parse (agar workbook besar tidak dibaca ulang) dan dihapus setelah diterapkan atau dibatalkan. Ringkasan hasil disimpan sebagai JSON di `import_jobs.error_summary`; konfigurasi di `column_mapping_json`; per baris di `import_job_rows` (data mentah, hasil pemetaan, status, masalah). Tidak perlu migration.

## Format

| Format | Isi                                                                                                                                                                                                                                                                                                                    |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSV    | Template kanonik (header baris 1), UTF-8 dengan/tanpa BOM (fallback Windows-1252), pemisah `,` `;` atau tab terdeteksi otomatis                                                                                                                                                                                        |
| JSON   | Skema AI v1.0 (`examples/ai_testcases.schema.json`); kolom tambahan tetap disimpan sebagai data mentah                                                                                                                                                                                                                 |
| XLSX   | Pembaca sendiri yang ketat: banyak sheet, sheet tersembunyi ditandai, header dideteksi (baris dengan nama kolom terbanyak, mis. baris 11) atau dipilih manual, metadata di atas header (Dokumen Acuan, Versi) menjadi info suite, sel gabungan diisi ke semua baris, sel tanggal, gambar tertanam lewat anchor drawing |

Batas: 40 MB per file, 300 MB setelah di-unzip, 5.000 baris, 40 sheet, 1.000 gambar. Formula tidak pernah dijalankan (nilai cache saja), makro ditolak, DTD XML ditolak (mencegah entity expansion), setiap bagian ZIP dicek ukurannya sebelum dibuka.

## Pemetaan dan validasi

- Nama kolom lama dipetakan otomatis (`ID UAT`, `Fitur/Proses`, `Prioritas`, `Jenis Pengujian`, `Status`, `Bukti Uji`, `Penguji`, `Tanggal Uji`, ...); pengguna bisa mengubahnya. Kolom yang tidak dipetakan tetap disimpan sebagai data mentah, tidak hilang.
- Sheet legacy tidak punya kolom modul: modul dan nama suite dipilih per sheet (saran kode dari nama sheet, mis. `Pemberi Kerja Individu` -> `PKI`). Modul/suite baru dibuat saat diterapkan.
- Wajib: modul, judul (min. 3 huruf), hasil yang diharapkan. Kode test case dipakai bila valid, kosong = dibuat otomatis `UAT-<MODUL>-NNN`.
- Prioritas/jenis pengujian dinormalisasi; label tak dikenal tetap diterima dengan peringatan (prioritas MUST_HAVE, jenis OTHER).
- Baris tanpa kode, judul, dan hasil diharapkan dianggap baris pemisah/judul bagian dan dilewati.

## Duplikat dan mode (doc 08 G)

- Kode sama dua kali dalam file: baris pertama dipakai, baris berikutnya `DUPLICATE` dengan rujukan ke baris pertama (TB-IMP-004).
- `CREATE_ONLY` (bawaan): kode yang sudah ada dilewati (TB-IMP-005).
- `UPDATE`: hanya nilai yang terisi di file yang menimpa; `NEW_REVISION`: definisi diganti seluruhnya dari file. Keduanya selalu membuat versi + revisi baru (aturan yang sama dengan edit biasa); snapshot run lama tidak pernah berubah. Isi yang identik = `UNCHANGED`, tidak membuat versi baru. Test case diarsipkan = error.
- Kasus baru berstatus DRAFT (TB-IMP-001), kecuali mode migrasi hasil (lihat bawah) yang memakai READY.

## Migrasi hasil UAT lama (doc 08 G mode 2)

- Opsional, butuh nama run. Dibuat satu run baru berstatus `COMPLETED` (data sejarah), test case masuk dengan snapshot, hasil menjadi percobaan #1 `INITIAL`.
- Status: Berhasil/Gagal/Belum/Terhambat/Dilewati Diuji dipetakan; label lain (mis. `Closed/Open/Pending` dari Status Retest) **tidak** diterjemahkan otomatis: pengguna memilih pemetaannya atau baris tersebut masuk run tanpa hasil (doc 08 E). `Belum Diuji` = masuk run tanpa percobaan.
- `Penguji` disimpan di `legacy_tester_name`; **tidak pernah** membuat akun (DoD M6). Tanggal campuran dinormalisasi; tak terbaca = kosong + peringatan.
- Severity/Status Retest/Catatan Retest dari tracker tidak otomatis menjadi bug; tetap tersimpan sebagai data mentah baris impor untuk ditinjau.
- Screenshot tertanam dihubungkan ke baris lewat anchor sel (bukan urutan file), diproses lewat pipeline bukti ADR 0008 (periksa + kompres), lalu ditautkan ke percobaan dan `import_job_row_files`. Gambar di luar baris data (mis. logo di area metadata) = "perlu ditinjau": bisa dipasangkan manual ke baris atau dibiarkan.

## Atomik

Test case, modul, suite, run, dan hasil ditulis dalam **satu transaksi**; kegagalan membatalkan semuanya (TB-IMP-007). Baris bermasalah dilaporkan per baris dan tidak ikut; hasilnya `PARTIAL`. Bila proses berhenti saat menerapkan, job ditandai `FAILED` (`INTERRUPTED`) saat API dinyalakan lagi. Daftar masalah bisa diunduh sebagai CSV yang aman dari formula injection.
