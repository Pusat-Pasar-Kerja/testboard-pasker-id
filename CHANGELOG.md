# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/) dan [SemVer](https://semver.org/lang/id/). Setiap entri sesuai dengan satu tag Git.

## [0.1.0] - 2026-11-20

### Ditambahkan

- Milestone 0 (fondasi): monorepo npm workspaces (`packages/shared`, `apps/api`, `apps/web`), TypeScript strict, ESLint, Prettier, CI GitHub Actions.
- `@testboard/shared`: enum status/kode sesuai schema baseline, tipe kontrak API, helper ID BIGINT-sebagai-string.
- `@testboard/api`: Hono + Node, `GET /api/v1/health`, request id (`X-Request-Id`), secure headers, format error seragam, validasi env (API produksi wajib loopback).
- `@testboard/web`: React + Vite + Tailwind (token design system), i18n ID/EN tanpa reload, adaptor data mock/http, halaman fondasi dengan status API.
- Dokumen blueprint di `docs/blueprint/` (IP VPS disensor), schema baseline read-only, docker-compose MySQL lokal opsional, ADR 0001-0002.
