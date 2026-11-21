# ADR 0013 - Alat kelola data: siklus pada bug, aksi massal, gabung test case, impor bug

- **Status:** Diterima (perubahan v1, tahap 4), diterapkan bertahap
- **Pemutus:** Pemilik proyek, 21 November 2026
- **Terkait:** ADR 0006 (run), ADR 0007 (alur bug), ADR 0009 (impor)

## Latar

Data UAT Karirhub ada di tiga workbook: hasil UAT Fase 1 (30-31 Juli 2026), Tracker bug Fase 1 (termasuk "Aduan user"), dan draf test case Fase 2. Draf Fase 2 punya sheet yang terlihat (versi ringkas v.2) dan sheet tersembunyi "... 3" (versi lengkap, 2-3 kali lebih banyak). Kedua versi memakai **kode yang sama untuk test case yang berbeda** (mis. `UAT-LPL-001` di dua sheet isinya lain), jadi tidak bisa digabung berdasarkan kode. Pemilik meminta keduanya masuk, dengan fitur gabung, pilih banyak, dan apa pun yang memudahkan pengelolaan di sistem.

## Keputusan

1. **Siklus (fase) pada bug** (migration `0009`): `defects.cycle_id`, sama seperti run. Bisa dipilih di formulir bug, difilter di Daftar Bug, dan diubah massal. Bug yang dilaporkan dari hasil uji tanpa memilih siklus otomatis mengikuti siklus run-nya.
2. **Aksi massal** (pilih banyak dengan kotak centang, pilihan tetap ada saat pindah halaman, hilang saat filter berubah):
   - _Daftar Bug_: status (mengikuti alur status per bug), severity, prioritas, modul, siklus, penanggung jawab. Selain lead, peran lain hanya bisa mengubah status.
   - _Test Case_: tandai Siap / jadikan Draf, pindah modul, ubah prioritas, tambahkan ke run, arsipkan (dengan konfirmasi).
   - Setiap item diproses dengan aturan yang sama seperti ubah satu per satu: hak per peran, alur status, versi dan revisi baru untuk test case, dan catatan di log aktivitas. Item yang ditolak aturan **dilewati dan dilaporkan** beserta alasannya; item lain tetap disimpan. Maksimal 200 item per aksi.
3. Kolom untuk bug hasil impor (migration `0009`): `legacy_reporter_name` (nama pelapor dari file, teks saja, tidak pernah membuat akun), `reported_at` (tanggal asli), `source_reference` (asal baris). Ditampilkan di detail bug bila ada.
4. `test_cases.merged_into_id` (migration `0009`) disiapkan untuk fitur gabung test case (bagian berikutnya tahap ini).

## Konsekuensi

- Endpoint baru: `POST /projects/:p/defects/bulk` dan `POST /projects/:p/test-cases/bulk`, jawaban `{ updated, unchanged, skipped: [{ id, code, reason }] }`. Filter baru `GET /defects?cycle=<id|none>`.
- Migration `0009` hanya menambah kolom NULL; tidak ada data lama yang berubah.
