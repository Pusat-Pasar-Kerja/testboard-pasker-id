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
4. **Gabung test case duplikat**: pilih 2 atau lebih test case (aksi massal "Gabungkan"), lalu pilih yang dipertahankan. Yang lain diarsipkan dengan `merged_into_id` menunjuk ke yang dipertahankan (versi + revisi "Merged into ..." + log). Test case yang dipertahankan tidak diubah. Hasil run lama tetap utuh. Detail test case menampilkan "Sudah digabung ke ..." atau "Gabungan dari ...". Mengaktifkan lagi test case yang digabung menghapus tautannya.
5. **Cari yang mirip** (`Test Case > Cari yang mirip`): pasangan kemungkinan duplikat, diurutkan dari yang paling mirip. Skor = 60% kemiripan kata judul + 30% kemiripan kata hasil yang diharapkan + 10% bila ada rujukan dalam kurung yang sama (mis. `[FSD-LPL-001/002]` menjadi FSD-LPL-001 dan FSD-LPL-002). **Kode tidak dipakai**, karena sheet Fase 2 memakai kode yang sama untuk isi yang berbeda. Hasil ditampilkan per pasangan, tidak dirangkai menjadi kelompok besar (satu rujukan seperti FSD-LPL-003 muncul di banyak test case yang berbeda). Ambang 45%, maksimal 200 pasangan. "Bukan duplikat" disembunyikan di tab browser itu saja.

6. **Impor Bug** (migration `0010`: `import_jobs.import_target`): di halaman Impor pilih "Bug", lalu alurnya sama dengan impor test case (unggah, pilih sheet dan kolom, periksa, terapkan).
   - Kolom dikenali otomatis: "ID UAT" = kode test case (untuk menautkan ke hasil uji), "ID" = kode bug, "Fitur / Proses" = judul, "Detail Hasil Aktual / Defect" = detail, Severity, Prioritas, Status / Status UAT, Status Retest, Notes (menjadi komentar), Penguji (teks, bukan akun), Tgl, Bukti (screenshot).
   - **Peta nilai** yang bisa diubah: status di file ke status bug, atau "Lewati". Bawaannya: Gagal Diuji = Terbuka; Berhasil, Belum, Terhambat, dan Dilewati Diuji = dilewati; Done = Ditutup; Not Done = Terbuka; Info = Ditutup; sel kosong = dilewati untuk sheet UAT dan Terbuka untuk laporan pengguna. Severity (Critical/High/Medium/Minor/Info) dan prioritas juga dipetakan.
   - Per sheet: modul (dibuat bila belum ada) dan sumber (UAT / laporan pengguna). Per impor: siklus, dan opsi menautkan bug ke hasil uji terakhir test case-nya di siklus itu (hasil gagal diutamakan).
   - Screenshot tertanam mengikuti baris tempatnya berada dan masuk lewat pipeline bukti, lalu dilampirkan ke bug.
   - Bug yang kodenya sudah ada (mis. aduan yang pernah diimpor) tidak dibuat ulang. Status awal dicatat di riwayat ("Diimpor dari ..."), kategori dan status retest ditambahkan ke detail, dan asal baris disimpan di `source_reference`.

## Konsekuensi

- Endpoint baru: `POST /projects/:p/defects/bulk` dan `POST /projects/:p/test-cases/bulk`, jawaban `{ updated, unchanged, skipped: [{ id, code, reason }] }`. Filter baru `GET /defects?cycle=<id|none>`. `POST /projects/:p/test-cases/merge` (`target_id`, `source_ids`, khusus lead) dan `GET /projects/:p/test-cases/similar?module=`.
- Migration `0009` hanya menambah kolom NULL; `0010` menambah 1 kolom dengan nilai bawaan. Tidak ada data lama yang berubah.
- `POST /projects/:p/imports?target=DEFECTS` membuat job impor bug; `PUT .../config` lalu menerima pengaturan bug (`defectImportConfigSchema`).
