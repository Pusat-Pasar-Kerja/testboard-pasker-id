# Prompts untuk AI Coding Agent - TestBoard PASKER ID

Gunakan prompts di bawah **satu per satu**, setelah semua file blueprint disalin ke folder repository lokal (misalnya `docs/blueprint/`). Ini **bukan perintah untuk menjalankan semuanya sekaligus**.

## Prompt 0 - Read and plan (wajib)

```text
Saya akan membangun TestBoard PASKER ID di komputer lokal. Baca semua dokumentasi blueprint (README, AGENTS.md, docs 01-18, database SQL baseline, examples). Jangan langsung implementasi. Pertama: ringkas stack yang dipilih, P0 scope, alur user, risiko schema gap, dan usulan struktur monorepo. Pastikan database produksi MySQL `testboard` yang telah ada tidak diubah/dihubungi. Rencanakan milestone, folder, route, entities, test strategy. Tanyakan hanya keputusan blocking; untuk yang tidak blocking pakai asumsi eksplisit dalam ADR. Bahasa komunikasimu Indonesia. Semua kode TypeScript strict.
```

## Prompt 1 - Scaffold & design system

```text
Implement Milestone 0 dan basis Milestone 1 pada repo lokal: npm workspaces dengan apps/web (React+TS+Vite) dan apps/api (Hono+Node+TS), packages/shared. Buat Vite SPA theme TestBoard PASKER ID sesuai docs/03, responsive 375px+, sidebar, topbar, project switcher, routing, ID/EN i18next, reusable table/forms/status badge. Gunakan MOCK service tanpa MySQL. Buat login placeholder hanya untuk demo yang diberi label DEMO; jangan meyakinkan itu production auth. Bikin scripts lint/typecheck/test/build; jangan deploy dan jangan membuat koneksi produksi. Screens harus punya loading/empty/error states.
```

## Prompt 2 - Complete UI with mock data

```text
Implement sitemap lengkap docs/04 dengan mock data realistis tetapi fiktif: Dashboard, Case Library, Case Detail/Edit, Suites, Cycles, Runs, Execution Workspace, Bug List/Detail, Evidence Center, Import Wizard, Reports, Members, Settings. Status/field harus sesuai docs/02, docs/05 dan docs/10. Sediakan interaksi nyata untuk filter, sort, modal, form, pagination, mock mutation, status transition dan bahasa. UI jangan berubah menjadi static screenshot. Tambahkan route and interaction tests.
```

## Prompt 3 - Local MySQL & real API

```text
Implement backend menggunakan DB lokal MySQL (bukan VPS). Baca SQL baseline yang sudah ada; jangan alter tanpa migration. Gunakan mysql2 prepared statements, transaction, project-scoped authorization. Buat API sesuai docs/06 untuk projects/modules/suites/cases/revisions/cycles/runs/executions/defects. Serialize bigint IDs as strings. Tambahkan seed dummy project/user secara aman hanya pada database development, bukan melalui migrasi produksi. Tambahkan integration tests untuk concurrency attempt_number dan cross-project access.
```

## Prompt 4 - Production-grade auth and RBAC

```text
Implement auth/session yang aman dengan Argon2id dan HttpOnly cookie + CSRF strategy. Schema existing belum punya session table; terlebih dulu buat migration SQL bernomor dan jelaskan perubahan, apply hanya ke database development setelah saya setuju. Implement permission matrix docs/09 di backend untuk semua route, login/logout, project membership dan actor identity dari session, bukan request body. Test guest, viewer, developer, tester, admin, cross-project, revoked member, session expiry. Jangan taruh MySQL secrets di Vite.
```

## Prompt 5 - Test execution & bug lifecycle

```text
Implement freeze snapshot test case saat masuk run, append-only executions, status PA/FA/BL/SK, step results, proper latest status view, bug standalone/link to execution, status history, comments, assignment. Failed requires actual result. Retest creates new attempt and keeps previous FAILED. Buat audit_log dalam transaksi. E2E tests untuk failure -> fixed -> retest pass dan failure -> reopened.
```

## Prompt 6 - Private multi-file evidence

```text
Implement evidence upload end-to-end mengikuti docs/07: multi-upload, paste screenshot, drag/drop, preview gallery/lightbox, process status. Store files outside public webroot, validate signature/MIME/size, scan (use interface + safe dev stub that cannot be enabled in production; production should fail closed if scanner absent), optimize image lossless preserving UI text, video async processing, metadata hashes/sizes/method in file_objects. Return authorized download/preview. Do not store BLOB in MySQL. Include attack tests extension spoofing, cross-project download, 0-byte, oversized, malformed file.
```

## Prompt 7 - Import Excel/CSV/JSON AI

```text
Implement Import Wizard docs/08 with sheet chooser, manual/automatic header row (often row 11), mapping, preview, duplicate handling per project+case_code, import_jobs/rows error capture, CREATE_ONLY/UPDATE/NEW_REVISION, history. Support JSON Schema in examples, preserve original text and source provenance. Add option to import legacy executions separately. Detect Excel embedded images and map by drawing anchor; if ambiguous flag manual review; never rely on filename order. Make reimport idempotent and test with dummy fixtures.
```

## Prompt 8 - Reports, QA and production readiness

```text
Implement dashboard/report/export based on latest status per run, CSV injection safe, localization, audit and settings. Add Playwright acceptance tests in docs/13 and security smoke tests for Apache public path. Prepare reviewed VPS deployment procedure and update.sh that pulls/builds/restarts/healthchecks, but do not execute production deploy. Cloudflare demo remains mock-only without prod MySQL. Produce release checklist and migration plan; no claims production ready until checks pass.
```

## Prompt 9 - Review implementation against specification

```text
Perform a gap analysis of the implemented repository against docs 01-18 and docs/13 acceptance scenarios. Output a table P0/P1: requirement, implementation files, tests, pass/fail, unresolved risks. Identify any accidental production DB usage, exposed credentials, possible Apache exposure and files without scan. Do not modify production. Propose fixes ordered by security then functionality then aesthetics.
```

## Kebiasaan berguna

Setelah setiap prompt, minta AI merangkum file yang berubah dan tes yang dijalankan; commit di branch feature, bukan menghapus source sebelumnya; preview lokal dulu.
