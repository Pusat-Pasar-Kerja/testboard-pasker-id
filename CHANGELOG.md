# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan [SemVer](https://semver.org/lang/id/). Setiap entri sesuai dengan satu tag Git.

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
