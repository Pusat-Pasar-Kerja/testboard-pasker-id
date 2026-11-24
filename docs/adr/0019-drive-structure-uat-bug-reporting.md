# ADR 0019 - Struktur seperti Google Drive: Fase › Fitur › Skenario, UAT, dan Bug Reporting

- **Status:** Diterima dan diterapkan (v0.22.0, migration `0015`)
- **Pemutus:** Pemilik proyek, 24 November 2026 (wawancara setelah v0.21.0)
- **Terkait:** ADR 0016 (Mode Workshop), ADR 0017 (tiga tingkat peran), ADR 0018 (anggota meja)

## Latar

Pemilik masih bingung dengan menu bernomor 1-2-3-4: "Kok gak nyambung satu sama lain antara Fitur dan Workshop Meja?" Permintaannya: logika seperti Google Drive. Satu proyek besar (mis. Karirhub) berisi **Fase** dan **Bug Reporting**; di dalam Fase ada **Fitur**; di dalam Fitur ada **Skenario** (sampai foto layarnya). Lalu ada bagian **UAT**: pilih Fase, pilih fitur-fiturnya, tambahkan pengguna dan kelompok; di sinilah kelompok, nomor meja, dan tampilan publik diatur. Hanya ada dua jenis orang di proyek: pengelola (Super Admin dan Admin) dan pengguna UAT (bisa ikut UAT 1, UAT 2, dan seterusnya bila ditambahkan).

Jawaban wawancara:

- Skenario **disalin** ke Fase baru (Salin / Pindahkan seperti Drive).
- **Boleh beberapa UAT** per Fase.
- Developer dan Pemantau **dihapus**: "Kan udah ada 3 user itu."
- Bug Reporting adalah fase tersendiri **setelah go-live**, tetapi masalah saat UAT langsung masuk ke sini. **Ada saklar ON/OFF publik.** Masyarakat **bisa melapor** (formulir, saklar sendiri, ditinjau Admin dulu).
- Panel kiri **seperti Google Drive**.

## Keputusan

1. **Skenario disimpan di Fase** (`test_cases.cycle_id`, boleh kosong = "Belum masuk Fase"). Pohon proyek: Fase › Fitur (modul) › Skenario. Folder fitur kosong di sebuah Fase dicatat di `workshop_features` (cycle, module). Daftar skenario bisa disaring per Fase (`cycle=<id>` atau `cycle=none`).
2. **Salin / Pindahkan ke Fase** (aksi massal `copy_to_phase`, `move_to_phase`): salinan mendapat kode baru, membawa foto layar, dan tetap **Siap** bila aslinya Siap (lainnya Draf). Klon biasa tetap menjadi Draf.
3. **UAT = satu test run** milik satu Fase (tidak ada tabel baru untuk UAT). Fitur yang diuji disimpan di `uat_features (run_id, module_id, state)`. Skenario **Siap** dari fitur itu di Fase itu **masuk otomatis** ke UAT yang masih Direncanakan/Berjalan, termasuk yang baru ditandai Siap kemudian. Fitur yang dilepas membawa skenario yang **belum dicoba**; hasil yang sudah ada tidak pernah dihapus. Beberapa UAT per Fase diperbolehkan.
4. **Peserta UAT** memakai `workshop_table_members` dengan `run_id` (kolom baru); `table_id` boleh kosong = belum masuk kelompok. **Kelompok** tetap `workshop_tables` (kartu QR, kode 6 angka) milik satu UAT, ditambah `table_number` (nomor meja, dicetak di kartu). Nama kelompok unik per UAT. Peserta dicocokkan dengan akun (email) atau nama; orang yang sudah ada dipindahkan, tidak pernah ganda.
5. **Hanya tiga jenis orang:** Super Admin dan Admin (peran situs, mengelola semua proyek) serta **Pengguna** (`TESTER` di proyek). `DEVELOPER`/`VIEWER` diubah menjadi `TESTER` oleh migration `0015`. Pengguna **tidak** membuka pustaka skenario (`case.read` hanya untuk pengelola) dan hanya melihat UAT yang ia ikuti: tercatat sebagai peserta, atau ditugaskan sebuah skenario di UAT itu. UAT lain menjawab 404.
6. **Tampilan publik per UAT** (`test_runs.is_public`, `public_fields_json`, `public_intro`), disalin dari pengaturan publik Fase lama. Data masalah tidak lagi ikut di sini.
7. **Bug Reporting per proyek** berdiri sendiri, dengan pengaturan di `project_settings`: `bugs.public` (saklar ON/OFF), `bugs.public_fields` (hanya kolom `bugs.*`), `bugs.public_intro`, `bugs.accept_reports` (formulir lapor publik). Proyek yang Fase publiknya dulu menampilkan daftar masalah otomatis mendapat Bug Reporting publik.
8. **Formulir lapor publik**: hanya bila Bug Reporting publik **dan** formulirnya dibuka. Laporan disimpan sebagai masalah dengan `source_kind = 'PUBLIC'` dan kontak pelapor (`defects.reporter_contact`, hanya untuk Admin). Laporan **tidak tampil publik sebelum ditinjau** (`reviewed_at`). Admin bisa menandai ditinjau, menggabungkan dengan masalah yang sama, atau membuang (hapus, hanya laporan publik yang belum ditinjau). Perlindungan: kolom jebakan tersembunyi (`website`) untuk robot, batas 5 laporan per 10 menit dan 20 per hari per perangkat (IP).
9. **Alamat baru:** `/projects/:code/fase`, `fase/:id`, `fase/:id/fitur/:moduleId`, `fase/tanpa-fase`, `uat`, `uat/baru`, `uat/:id`; publik `/publik/uat/:id` dan `/publik/masalah/:kode`. Tautan lama `/publik/:fase` membuka UAT publik Fase itu; menu lama (`cycles`, `workshop`, `runs`) diarahkan ke halaman barunya. API: `/phases`, `/uats/...`, `/bug-reporting/...`, `/public/uats`, `/public/projects/:code/(bug-reporting|bugs|files|reports)`.

## Akibat

- Satu migration (`0015_drive_structure.sql`) memuat semua perubahan schema dan pengisian data lama, supaya di server cukup sekali menjalankan migrasi. Migration ini bisa dijalankan ulang tanpa efek ganda.
- Rute Mode Workshop lama per Fase (`/cycles/:id/tables`, `/cycles/:id/workshop`, `/public/cycles/...`) dihapus; kartu meja, Mode Mudah, dan "Tugas saya" tetap bekerja seperti di ADR 0016/0018.
- Pemakaian kata di antarmuka: "Lembar uji" menjadi **UAT**, "Fase uji" menjadi **Fase**, "Meja workshop" menjadi **Kelompok** (dengan nomor meja).
