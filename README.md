# TestBoard PASKER ID

Platform web multi-project untuk mendokumentasikan test case, merencanakan siklus UAT, menjalankan pengujian, menyimpan bukti uji, melacak bug, dan menyusun laporan. UI dua bahasa: **Indonesia** dan **English**.

> Status: **Milestone 1 - design system & prototype demo** (`v0.2.0`). Data masih contoh fiktif (mock); belum siap produksi. Spesifikasi lengkap ada di [`docs/blueprint/`](docs/blueprint/README.md).

## Arsitektur

```text
apps/web          React + TypeScript + Vite + Tailwind + i18next  (SPA)
apps/api          Hono + Node.js + TypeScript                     (REST /api/v1)
packages/shared   Enum status, tipe kontrak API, helper bersama
database/         Schema baseline (read-only) + migrations baru
docs/             Blueprint + ADR keputusan
infra/, ops/      Docker DB lokal (opsional), contoh script deploy
```

- Produksi: Apache menyajikan hasil build `apps/web/dist`, API Node berjalan di `127.0.0.1` di balik reverse proxy, database `testboard` (MariaDB 10.4.32) di VPS, file bukti di storage privat di luar webroot.
- Prototype/demo: hanya frontend dengan data mock (`VITE_DEMO_MODE=true`), tanpa koneksi ke database produksi.

## Mulai development (Windows / macOS / Linux)

Prasyarat: Node.js 22.12+ (disarankan 24 LTS, lihat `.nvmrc`), npm, Git.

```bash
npm install
cp apps/api/.env.example apps/api/.env          # opsional, nilai default sudah aman untuk lokal
cp apps/web/.env.example apps/web/.env.local    # opsional; VITE_DEMO_MODE=false untuk memakai API lokal
npm run dev
```

- Web: http://127.0.0.1:5173 (request `/api` di-proxy ke API lokal)
- API: http://127.0.0.1:8787/api/v1/health

| Perintah                                          | Fungsi                                                     |
| ------------------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                                     | Menjalankan API + web sekaligus                            |
| `npm run lint` / `npm run typecheck` / `npm test` | Pemeriksaan kualitas                                       |
| `npm run build`                                   | Build shared, API (`apps/api/dist`), web (`apps/web/dist`) |
| `npm run check`                                   | Semua pemeriksaan di atas + format (dipakai CI)            |

Database lokal (Docker + MariaDB 10.4.32, sama dengan VPS) baru dibutuhkan mulai Milestone 3; lihat [`database/README.md`](database/README.md) dan [ADR 0003](docs/adr/0003-database-engine.md). **Jangan** memakai database VPS untuk development.

## Versioning & branch

- Semua pekerjaan di branch `develop`; `main` hanya untuk rilis yang disetujui.
- **Setiap commit yang di-push diberi tag SemVer**: patch per commit, minor per milestone, `v1.0.0` saat lolos release gate produksi. Detail: [`docs/adr/0001-repo-branch-versioning.md`](docs/adr/0001-repo-branch-versioning.md).

```bash
npm version 0.1.1 --workspaces --include-workspace-root --no-git-tag-version
git commit -am "..."
git tag -a v0.1.1 -m "v0.1.1"
git push origin develop --follow-tags
```

## Keamanan data

Repo ini **publik**. Jangan commit `.env`, kredensial, workbook UAT asli, screenshot bukti nyata, atau data pribadi penguji. Lihat [`AGENTS.md`](AGENTS.md).

## Roadmap

| Milestone | Isi                                                                       | Status             |
| --------- | ------------------------------------------------------------------------- | ------------------ |
| M0        | Repo, tooling, healthcheck API, adaptor mock, format error                | Selesai (`v0.1.0`) |
| M1        | Design system, AppShell, layar prototype dengan data mock, bilingual      | Selesai (`v0.2.0`) |
| M2        | Auth + session (migration), project member, RBAC, test case CRUD + revisi | Berikutnya         |
| M3        | Cycle, run, execution append-only, dashboard latest status                |                    |
| M4        | Bug tracking + workflow status + riwayat                                  |                    |
| M5        | Pipeline evidence multi-file (scan, optimasi, storage privat)             |                    |
| M6        | Import XLSX/CSV/JSON (legacy & AI)                                        |                    |
| M7        | Laporan, hardening, deployment VPS                                        |                    |
