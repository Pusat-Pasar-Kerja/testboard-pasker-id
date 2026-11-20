# ADR 0006 - Run, eksekusi, dan retest (Milestone 3)

- **Status:** Diterima (20 November 2026)
- **Dasar:** blueprint doc 02 bagian 3, doc 13 (`TB-RUN-*`, `TB-EXEC-*`, `TB-DASH-001`)

## Siklus hidup run

`PLANNED -> ACTIVE -> COMPLETED`; `COMPLETED` boleh dibuka lagi ke `ACTIVE` (untuk retest) atau dikunci `LOCKED` (final, disetujui). Hasil uji hanya bisa dicatat saat run `ACTIVE`. Run `COMPLETED` hanya bisa diubah metadata & penugasannya; run `LOCKED` tidak bisa diubah sama sekali.

## Snapshot

Saat test case dimasukkan ke run, definisinya dibekukan di `test_run_cases.case_snapshot_json` (judul, prasyarat, langkah, hasil yang diharapkan, versi). Workspace eksekusi selalu menampilkan snapshot itu, sehingga perubahan test case setelahnya tidak mengubah makna hasil lama. Hanya case berstatus **READY** yang bisa dimasukkan.

## Eksekusi (attempt)

- Setiap simpan = baris baru `test_executions` (append-only). Attempt 1 = `INITIAL`, berikutnya `RETEST` (atau `RERUN`). Hasil lama tidak pernah ditimpa.
- Nomor attempt dihitung server di dalam transaksi dengan **kunci baris run case** (`SELECT ... FOR UPDATE` hanya pada `test_run_cases`, bukan JOIN, agar tester lain di run yang sama tidak ikut menunggu). Unique key `(run_case_id, attempt_number)` menjadi pengaman terakhir.
- Penguji dan waktu uji diambil dari sesi dan jam server, tidak pernah dari body request.
- `FAILED` wajib hasil aktual; `BLOCKED`/`SKIPPED` wajib alasan (`notes`). Bug tidak dibuat otomatis (DEC-07); pembuatan/penautan bug ada di Milestone 4.
- TESTER hanya boleh mengeksekusi case yang ditugaskan kepadanya; ADMIN/QA Lead/Super Admin boleh semua.
- `Idempotency-Key` (header) mencegah klik ganda membuat dua attempt: request ulang dengan kunci sama dalam 10 menit mengembalikan hasil pertama (disimpan di memori proses API).

## Hasil per langkah

`test_execution_steps` mereferensikan `test_case_steps`. Karena langkah test case disimpan sebagai teks (ADR 0005), baris `test_case_steps` dibuat **saat dibutuhkan** sebagai jangkar per nomor langkah (`ON DUPLICATE KEY` pada `(test_case_id, step_number)`). Arti tiap langkah untuk riwayat dibaca dari **snapshot run**, bukan dari baris jangkar, sehingga edit langkah di kemudian hari tidak mengubah riwayat dan tidak terhalang foreign key. Tidak perlu migration baru.

## Statistik

Dasbor dan ringkasan run tetap memakai status **attempt terakhir** per run case (`v_run_case_latest_status`): retest tidak dihitung ganda, dan `BLOCKED`/`SKIPPED`/`NOT_RUN` tidak pernah dihitung lulus.
