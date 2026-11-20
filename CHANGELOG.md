# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan [SemVer](https://semver.org/lang/id/). Setiap entri sesuai dengan satu tag Git.

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
