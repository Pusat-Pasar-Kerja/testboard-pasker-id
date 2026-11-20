# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan [SemVer](https://semver.org/lang/id/). Setiap entri sesuai dengan satu tag Git.

## [0.6.0] - 2026-11-20

**Milestone 5 selesai**: bukti (screenshot, dokumen, log) bisa diunggah, diperiksa, dikompres, dilihat, dan dilampirkan dari UI (mode API dan demo).

### Ditambahkan

- Pengunggah bukti: pilih banyak file, tarik-lepas, atau tempel screenshot dari clipboard (Ctrl+V); progres unggah per file, status pemeriksaan, hasil kompresi ("170 KB → 6,9 KB · hemat 96% · WebP lossless"), alasan penolakan yang jelas, ulangi, hapus, keterangan, dan tautan ke nomor langkah.
- Workspace eksekusi: bukti disimpan bersama hasil uji (simpan ditahan sampai semua file selesai diperiksa), peringatan lembut bila hasil gagal tanpa screenshot, galeri per percobaan, dan "Tambah bukti" ke percobaan sendiri yang sudah tersimpan.
- Bug: bagian Lampiran (lampirkan/lepas sesuai peran); saat melaporkan bug dari hasil gagal, screenshot percobaan itu otomatis ikut (file yang sama, tidak disalin) dan bisa ditambah bukti baru.
- Test case: tab Dokumen acuan untuk QA Lead/Admin.
- Pusat Bukti: semua file proyek dengan filter jenis/status/nama/belum dipakai, ukuran sebelum/sesudah, pengunggah, tempat file dipakai (tautan ke percobaan/bug/test case), pratinjau, unduh, dan hapus untuk file yang belum dipakai.
- Penampil screenshot (lightbox) dengan navigasi panah/Esc; semua pratinjau dan unduhan lewat izin API, tidak ada tautan publik.
- Mode demo mensimulasikan alur yang sama (cek jenis asli, penolakan, proses, hasil kompresi khas).
- Tes: aturan bukti di data demo dan alur UI (unggah saat uji, file palsu ditolak, pakai ulang di bug, Pusat Bukti, viewer).

### Diubah

- Optimasi PNG kini benar-benar lossless (opsi `effort` di sharp diam-diam mengaktifkan kuantisasi palet); tes regresi gambar banyak warna harus identik piksel.
- Thumbnail hanya dibuat bila lebih kecil dari gambar utuh (screenshot UI datar sering lebih kecil utuh dalam WebP lossless).

## [0.5.1] - 2026-11-20

Milestone 5 bagian API: unggah bukti dengan pemeriksaan dan kompresi.

### Ditambahkan

- `POST /projects/:p/files`: unggah banyak file sekaligus (multipart, di-stream ke karantina privat, batas per jenis dan per permintaan), diproses di belakang; `GET /files` (Pusat Bukti: filter jenis/status/nama/belum dipakai, beserta tempat file dipakai), `GET /files/:id`, `/status`, `/preview` (dengan `Range`), `/thumbnail`, `/download` (tercatat di audit), `DELETE /files/:id` untuk unggahan yang belum dipakai.
- Pipeline doc 07: jenis asli dari byte, pemeriksaan virus (default pemeriksaan dasar tanpa konfigurasi, ClamAV opsional; gagal periksa tidak pernah lolos), screenshot dikompres tanpa mengubah piksel (WebP lossless/PNG optimize, JPEG berkualitas tinggi hanya bila jauh lebih kecil), EXIF/GPS dibuang, thumbnail; PDF/DOCX/XLSX diperiksa dari skrip, makro, objek tertanam, dan zip bomb; log harus teks, HAR disensor otomatis (cookie, token, Authorization), gzip bila lebih kecil.
- Lampirkan bukti saat menyimpan hasil uji (`evidence` di `POST /run-cases/:id/executions`), ke percobaan yang sudah ada (`POST/DELETE /executions/:id/files`), ke bug (`evidence` saat membuat bug, `POST/DELETE /defects/:id/files`), dan ke test case (`POST/DELETE /test-cases/:id/files`); file yang sama bisa dipakai di beberapa tempat tanpa disalin. Detail percobaan, bug, dan test case kini memuat daftar file.
- Migration `0006`: jenis pemeriksaan, waktu periksa, dan alasan penolakan per file. Pengaturan `STORAGE_DIR` (wajib di luar folder aplikasi saat production), `SCAN_ENGINE`, `CLAMD_HOST`, `CLAMD_PORT`.
- Upload yang terputus karena restart ditandai gagal, tidak pernah dirilis.
- Tes integrasi TB-FILE-001..006 plus sensor HAR, makro, zip bomb, batas ukuran, hak lampir, pemakaian ulang file, dan pemulihan setelah restart; ADR 0008.

## [0.5.0] - 2026-11-20

**Milestone 4 selesai**: alur bug lengkap dari UI (mode API dan demo).

### Ditambahkan

- Laporkan bug dari Daftar Bug (bug mandiri, mis. laporan pengguna) atau langsung dari workspace eksekusi: "Laporkan bug dari percobaan #n" mengisi judul, langkah, perilaku yang diharapkan/aktual, modul, lingkungan, build, dan browser dari hasil uji, menautkan bug ke percobaan itu, lalu kembali ke pengujian.
- "Tautkan bug yang ada" di workspace eksekusi (cari bug terbuka, tautkan ke percobaan terakhir).
- Detail bug: tombol status sesuai peran dan alur ADR 0007 dengan konfirmasi (versi perbaikan saat ditandai diperbaiki, alasan wajib saat dibuka kembali atau tidak diperbaiki), riwayat status dengan nama dan alasan, komentar, lepas tautan percobaan uji, tautan langsung ke workspace eksekusi.
- Form ubah bug dengan kolom terkunci sesuai peran (pelapor mengubah uraian, developer yang ditugaskan mengisi versi perbaikan, QA Lead/Admin semua termasuk penugasan) dan pencegahan saling timpa.
- Filter penugasan di Daftar Bug ("Ditugaskan ke saya", belum ditugaskan, per orang); API `GET /defects?assigned_to=`.
- Mode demo menerapkan aturan bug yang sama dengan API.
- Tes: aturan bug di data demo dan alur UI (lapor mandiri, lapor dari hasil gagal, tautkan, alur status, developer, viewer, komentar).

### Diperbaiki

- Dialog konfirmasi kadang muncul jauh di bawah layar dan halaman melompat: dialog kini dirender di `document.body` dan animasi masuk halaman tidak lagi menahan `transform` setelah selesai.

## [0.4.1] - 2026-11-20

Milestone 4 bagian API.

### Ditambahkan

- Bug: `POST /projects/:p/defects` (kode otomatis `BUG-XXX-0001` di bawah kunci proyek, bisa langsung tertaut ke percobaan uji, boleh tanpa tautan, `Idempotency-Key`), `PATCH /defects/:id` dengan pembatasan kolom per peran dan `expected_updated_at`, `POST /defects/:id/status` sesuai alur ADR 0007 (alasan wajib untuk REOPENED/WONT_FIX, riwayat + audit dalam satu transaksi), komentar (`GET/POST /defects/:id/comments`), riwayat (`GET /defects/:id/history`), tautkan/lepas percobaan uji (`POST /defects/:id/executions`, `DELETE /defects/:id/executions/:executionId`).
- Aturan alur bug dan pembatasan kolom ada di `@testboard/shared` (dipakai API, demo, dan UI); izin baru `defect.comment` dan `defect.link`.
- Tes integrasi TB-BUG-001..004, pembatasan kolom, komentar, tautan, idempotensi, isolasi proyek; ADR 0007.

## [0.4.0] - 2026-11-20

**Milestone 3 selesai**: siklus uji, perencanaan run, dan workspace eksekusi dari UI (mode API dan demo).

### Ditambahkan

- Halaman Siklus Uji: daftar siklus (periode, jumlah run yang bisa diklik), buat siklus dengan validasi kode dan urutan tanggal, ubah status siklus.
- Buat/ubah run (nama, kode otomatis atau manual, siklus, lingkungan, build, URL lingkungan) dan filter run per siklus.
- Detail run: tombol status sesuai alur `PLANNED -> ACTIVE -> COMPLETED -> (ACTIVE | LOCKED)` dengan konfirmasi (penguncian diberi peringatan final), tambah test case Siap Uji (cari, pilih semua, tugaskan langsung), pilih banyak baris untuk tugaskan/lepas penugasan atau keluarkan dari run, filter "Tugas saya"/belum ditugaskan/per penguji, tombol "Lanjutkan pengujian" ke case berikutnya yang belum diuji.
- Workspace eksekusi (`runs/:run/cases/:case`): skenario dari snapshot run (peringatan bila test case sudah punya versi lebih baru), hasil per langkah dengan "Tandai semua lulus", empat pilihan hasil besar, hasil aktual wajib saat gagal dan alasan wajib saat terhambat/dilewati, lingkungan uji (terisi dari percobaan terakhir), perbandingan dengan percobaan sebelumnya, riwayat percobaan append-only, bug terkait, navigasi sebelum/berikutnya, "Simpan & lanjut", kunci idempotensi anti klik ganda, peringatan perubahan belum disimpan. Di layar ponsel tampil sebagai tab Skenario / Catat hasil / Riwayat.
- Penjelasan yang jelas saat hasil tidak bisa dicatat (run belum dimulai/selesai/dikunci, case milik penguji lain, peran hanya melihat).
- Mode demo menerapkan aturan yang sama dengan API (transisi status, hanya READY, snapshot, attempt append-only, idempotensi, TESTER hanya case miliknya).
- Tes: aturan run/eksekusi di data demo dan alur UI siklus, perencanaan run, penguncian, eksekusi gagal/lulus/terhambat, hak penguji.

### Diubah

- Tabel responsif mendukung pilihan baris (kotak centang di tabel dan di kartu ponsel).
- Kolom bug terkait di detail run hanya tampil di layar lebar agar judul test case tetap terbaca.

## [0.3.1] - 2026-11-20

Milestone 3 bagian API.

### Ditambahkan

- Siklus uji: `GET/POST /projects/:p/cycles`, `PATCH /cycles/:id` (validasi tanggal, kode unik).
- Run: buat (kode otomatis `RUN-YYYYMMDD-N`), ubah, transisi status `PLANNED -> ACTIVE -> COMPLETED -> (ACTIVE | LOCKED)`, tambah test case READY dengan snapshot beku, keluarkan case yang belum punya hasil, tugaskan penguji massal (hanya anggota ADMIN/QA Lead/Tester aktif).
- Eksekusi: `POST /projects/:p/run-cases/:id/executions` append-only dengan nomor attempt di bawah kunci baris, INITIAL/RETEST, hasil per langkah, wajib hasil aktual (FAILED) / alasan (BLOCKED, SKIPPED), penguji & waktu dari server, TESTER hanya case miliknya, `Idempotency-Key` anti klik ganda. `GET /run-cases/:id` untuk workspace (snapshot, riwayat attempt, bug terkait, navigasi sebelum/berikutnya).
- Tes integrasi TB-RUN-001/002, TB-EXEC-001..004, siklus status, penugasan, idempotensi, isolasi proyek; ADR 0006.

## [0.3.0] - 2026-11-20

**Milestone 2 selesai**: login asli, sesi, Super Admin, hak akses per proyek, serta pengelolaan test case, anggota, modul, dan suite dari UI.

### Ditambahkan

- Web memakai API sungguhan saat `VITE_DEMO_MODE=false`: halaman login (email + kata sandi, pesan galat umum, info lockout), penjaga sesi (diarahkan ke login lalu kembali ke halaman tujuan), logout, bahasa mengikuti profil dan tersimpan ke profil saat diganti.
- Form buat/ubah test case: validasi di browser dengan skema yang sama dengan API, galat per kolom dari server, peringatan perubahan belum disimpan, `expected_version` mencegah saling timpa; aksi Duplikat, Arsipkan (dengan konfirmasi) dan Pulihkan.
- Halaman Tim & Pengaturan: anggota (tambah lewat email, ubah peran, keluarkan dengan konfirmasi), Modul & Suite (lihat dan tambah).
- Halaman Profil (nama, bahasa, ganti kata sandi) dan Kelola Pengguna khusus Super Admin (buat akun dengan kata sandi sementara yang tampil sekali, aktif/nonaktif, beri/cabut Super Admin).
- Tombol hanya tampil untuk peran yang berhak (matriks izin yang sama dengan API); akses langsung lewat URL tetap ditolak API.
- Komponen baru: Button, field form aksesibel (label, petunjuk, galat), dialog konfirmasi (fokus terkunci, Esc), toast; mode demo juga mendukung semua aksi ini secara fiktif.
- Tes web: alur login, buat/ubah/arsip test case, pembatasan VIEWER, peran anggota, akun baru, validasi kata sandi.

### Diubah

- Logika langkah uji bernomor dipindah ke `@testboard/shared` (dipakai API dan demo).

## [0.2.3] - 2026-11-20

### Ditambahkan

- API baca (read-only) untuk layar yang sudah ada di UI: `GET /projects/:p/runs`, `/runs/:id` (judul dari snapshot run, jumlah percobaan, bug terkait), `/defects` (filter `open`/status/severity/prioritas, cari, paginasi), `/defects/:id` (eksekusi terkait, riwayat status, komentar), `/reports/summary` (dasbor dari status terbaru per test case). Aksi tulis run/eksekusi tetap di Milestone 3, alur bug di Milestone 4.
- Tes integrasi: retest dihitung sekali (TB-DASH-001), snapshot run, filter bug terbuka, isolasi antar proyek.

## [0.2.2] - 2026-11-20

Milestone 2 bagian backend (API). Integrasi UI login & form test case menyusul (target `v0.3.0`).

### Ditambahkan

- Migration 0001-0005 disetujui dan **diterapkan ke database lokal** lewat runner baru `npm run db:migrate` (checksum, menolak file yang berubah). VPS belum.
- `npm run dev` otomatis menyalakan database lokal bila sudah di-setup.
- Auth: `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`, `PATCH /profile`, `POST /profile/change-password` - Argon2id, sesi server-side (hash token), cookie HttpOnly/SameSite, CSRF terikat sesi + cek origin, lockout percobaan login, audit LOGIN/LOGOUT.
- RBAC: matriks izin bersama (`@testboard/shared`), akses proyek (non-anggota = 404), Super Admin global.
- API proyek, anggota, modul, suite, test case (list/filter/search/paginasi, detail, buat dengan kode otomatis, edit = versi + revisi, `expected_version`, arsip, clone, riwayat revisi), admin pengguna & pengaturan website. Semua perubahan dicatat di `audit_logs` dalam transaksi yang sama.
- `npm run admin:create-super -w @testboard/api` (Super Admin pertama, untuk server) dan `npm run db:seed` (data demo fiktif + akun lokal).
- Tes integrasi (database `testboard_test` yang dibangun ulang setiap run): TB-AUTH-001..004, TB-RBAC-001..003, TB-CASE-001..004, CSRF, lockout, Super Admin; tes unit matriks izin & skema.
- ADR 0005 (desain auth, sesi, CSRF, RBAC, test case).

## [0.2.1] - 2026-11-20

### Ditambahkan

- Database lokal **tanpa Docker**: `npm run db:init|db:start|db:stop|db:status` menjalankan instance MariaDB 10.4.32 terpisah dari binary XAMPP (data di `.local-db/` drive D, port 3307), dengan `sql_mode` dan collation persis seperti VPS, user dev CRUD-only, dan schema baseline terimpor.
- API terhubung ke database: pool mysql2 (sesi UTC, BIGINT sebagai string, `sql_mode` sesi sama dengan server), `/api/v1/health` melaporkan status database (503 `degraded` bila mati).
- Tes integrasi database lokal (`npm run test:integration -w @testboard/api`): versi & pengaturan sama dengan VPS, UTC per koneksi, BIGINT aman, 27 tabel + view, user aplikasi tanpa hak DDL.
- Usulan migration Milestone 2 (belum diterapkan): `schema_migrations`, `user_sessions`, `user_system_roles` (Super Admin), `system_settings`, `auth_login_attempts` - sintaks sudah divalidasi di database sementara.
- ADR 0004: Super Admin global, DB lokal tanpa Docker, pengaturan DB VPS, brand lembut, konfirmasi kompresi wajib pada setiap upload.

### Diubah

- Tampilan lebih lembut: biru `#4361D6` (kontras AA), kanvas dan garis lebih kalem, bayangan tipis; logo ikut warna baru.
- Animasi halus: transisi halaman, tab, drawer, menu, tooltip, dan bar grafik dengan kurva perlambatan lembut; otomatis nonaktif bila OS memakai "kurangi gerakan".

## [0.2.0] - 2026-11-20

Milestone 1 selesai: design system & prototype demo yang bisa diklik (data contoh fiktif).

### Ditambahkan

- AppShell responsif: sidebar (desktop), drawer navigasi dengan focus trap dan Esc (ponsel/tablet), topbar dengan pemilih proyek, pencarian test case, ganti bahasa, menu pengguna demo, tautan "lewati ke konten".
- Routing sesuai sitemap doc 04 (React Router), filter tersimpan di URL sehingga refresh dan deep link tetap.
- Layar: Proyek, Dasbor, daftar & detail Test Case (tab Ringkasan/Dipakai di run/Revisi/Bukti), daftar & detail Run, daftar & detail Bug (riwayat status, eksekusi terkait, komentar), login DEMO tanpa kolom kata sandi, halaman "segera hadir" untuk fitur milestone berikutnya, 404.
- Dasbor dihitung dari status terbaru per test case dalam run (retest tidak dihitung ganda); bar status bersegmen dan grafik bug per severity mengikuti panduan dataviz (urutan hijau/kuning/merah aman buta warna, label + ikon, tooltip, tautan ke daftar terfilter).
- Komponen: badge status/severity/prioritas dengan ikon + label ID/EN, tabel responsif (kartu di ponsel), filter, paginasi, tab aksesibel, state loading/kosong/galat dengan kode referensi.
- `@testboard/shared`: DTO kontrak API dan helper metrik (status terbaru, tingkat lulus, bug terbuka).
- Data demo fiktif deterministik (2 proyek, 39 test case, 4 run, retest, 14 bug) melalui adaptor `DataSource`; adaptor HTTP sudah memakai endpoint kontrak doc 06 untuk Milestone 2-3.
- Panduan deploy demo Cloudflare Pages (`docs/deploy/cloudflare-demo.md`), belum di-deploy.
- Tes: paritas kunci ID/EN, invarian data mock (isolasi antar proyek, retest), render halaman via router.

## [0.1.1] - 2026-11-20

### Diubah

- Database lokal: Docker `mariadb:10.4.32`, sama persis dengan VPS (sebelumnya MySQL 8.4). Batasan MariaDB 10.4 dan risiko EOL dicatat di ADR 0003.
- Brand: logo TestBoard baru mengikuti tata bahasa logo hub Kemnaker (Karirhub, Skillhub, Maganghub): simbol centang + titik, wordmark Inter "**Test**Board", endorsement "oleh PASKER ID". Warna utama UI menjadi biru-indigo `#3347E0`. Font Inter dibundel lokal. Spesifikasi di `docs/brand/README.md`.

## [0.1.0] - 2026-11-20

### Ditambahkan

- Milestone 0 (fondasi): monorepo npm workspaces (`packages/shared`, `apps/api`, `apps/web`), TypeScript strict, ESLint, Prettier, CI GitHub Actions.
- `@testboard/shared`: enum status/kode sesuai schema baseline, tipe kontrak API, helper ID BIGINT-sebagai-string.
- `@testboard/api`: Hono + Node, `GET /api/v1/health`, request id (`X-Request-Id`), secure headers, format error seragam, validasi env (API produksi wajib loopback).
- `@testboard/web`: React + Vite + Tailwind (token design system), i18n ID/EN tanpa reload, adaptor data mock/http, halaman fondasi dengan status API.
- Dokumen blueprint di `docs/blueprint/` (IP VPS disensor), schema baseline read-only, docker-compose MySQL lokal opsional, ADR 0001-0002.
