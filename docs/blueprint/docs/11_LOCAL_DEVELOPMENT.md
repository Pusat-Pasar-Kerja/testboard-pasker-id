# 11 - Panduan Pengembangan Lokal (Windows / macOS / Linux)

**Tujuan:** develop di laptop tanpa mengganggu MySQL `testboard` di VPS yang sudah digunakan. Package ini berisi spesifikasi dan template; **belum membuat aplikasi yang bisa dijalankan**.

## Setup awal

Install: Git, Node.js LTS yang masih didukung, VS Code/Cursor/Codex atau editor pilihan, DBeaver, MySQL 8.x lokal atau Docker Desktop. Pastikan `git --version`, `node --version`, `npm --version` sukses.

### Clone repo sendiri ketika sudah tersedia

```bash
git clone https://github.com/Pusat-Pasar-Kerja/testboard-pasker-id.git
cd testboard-pasker-id
```

Ganti URL dengan URL repo nyata. Untuk private repository gunakan autentikasi SSH/PAT aman; **tidak perlu menyambungkan GitHub ke ChatGPT**.

## Struktur kerja yang disarankan

```text
testboard-pasker-id/
  apps/
    web/                  # React TS Vite SPA
      src/
      .env.example
    api/                  # Hono Node TS API
      src/
      .env.example
  packages/
    shared/               # Shared enums, Zod validation, TS types
  database/
    migrations/           # New migrations ONLY, versioned and reviewed
  docs/                   # Blueprint documents
  infra/                  # docker/ops scripts
  AGENTS.md
  package.json            # npm workspaces if using monorepo
  package-lock.json
  .gitignore
```

### Stack yang direkomendasikan

- Web: React, TypeScript, Vite, React Router, TanStack Query, Tailwind CSS, accessible UI primitives, Lucide.
- API: Hono + `@hono/node-server`, TypeScript, Zod validation, `mysql2/promise` untuk query terparameterisasi; servis API **tidak** berada di browser.
- Media processing: Sharp untuk gambar; FFmpeg untuk video; private local storage; AV scan sebelum release.
- E2E: Playwright; unit/integration tests via test runner pilihan.

## Local database (pilih satu)

### Opsi A - Docker Compose untuk MySQL lokal

1. Copy `config/docker.env.example` -> `config/docker.env`, isi password lokal dummy yang kuat.
2. Di root paket blueprint ini (atau copy file config/database ke repo lokal sesuai path relatif), jalankan:

```bash
docker compose --env-file config/docker.env -f config/docker-compose.dev.yml up -d
```

3. Container MySQL menggunakan port **127.0.0.1:3307** di laptop, database **`testboard` lokal**. SQL baseline dari paket akan di-import **saat container fresh pertama dibuat**.
4. Dalam DBeaver buat koneksi baru ke `127.0.0.1:3307`, username `testboard_dev`, password lokal yang diset. **Ini bukan MySQL VPS.**
5. Jika butuh reset lokal: berhati-hati dengan `docker compose down -v` karena **menghapus volume lokal**. Jangan gunakan perintah tersebut untuk server produksi.

### Opsi B - MySQL lokal sudah terpasang

Buat DB `testboard` **di mesin lokal** lalu jalankan `database/schema_baseline_reference.sql` di database lokal yang masih kosong. Jika memakai akun DBA dengan akses, buat akun dev hanya untuk database itu.

## API local env

Copy `config/api.env.example` menjadi `apps/api/.env` (ubah lokasi bila framework membutuhkannya). Contoh:

```dotenv
NODE_ENV=development
API_HOST=127.0.0.1
API_PORT=8787
DB_HOST=127.0.0.1
DB_PORT=3307
DB_NAME=testboard
DB_USER=testboard_dev
DB_PASSWORD=ISI_PASSWORD_DEV_LOKAL
```

- `127.0.0.1` di laptop = laptop lokal. **Bukan** `[IP-VPS-DISENSOR]`.
- `.env` harus di-ignore Git, tidak dikopi ke folder publik.

## Web local env

Copy `config/web.env.example` menjadi `apps/web/.env.local`, misalnya:

```dotenv
VITE_APP_NAME=TestBoard PASKER ID
VITE_API_BASE_URL=http://127.0.0.1:8787/api/v1
VITE_DEMO_MODE=false
```

**`VITE_*` akan masuk ke JavaScript browser**: jangan pernah menaruh password, token DB, private keys di variabel berawalan `VITE_`.

## Urutan implementasi di komputer lokal

1. Paste blueprint ini dalam repo di folder `docs/blueprint/` atau sertakan readme dan `AGENTS.md`.
2. Mintalah AI coding agent menginisialisasi monorepo frontend/backend; belum terhubung ke production.
3. Implement demo UI dengan mocked API dulu dan UI bilingual.
4. Implement API + MySQL lokal, CRUD case/run/bug.
5. Implement auth + RBAC + migration sessions, sesuai persetujuan skema baru.
6. Implement file processing ke private local folder dan import Excel.
7. Jalankan unit/integration/E2E; audit keamanan dasar.
8. Commit dan push ke branch feature; PR sebelum merge ke `main`.
9. Setelah production release siap, deploy ke VPS lewat prosedur yang dikontrol.

## Suggested dev commands (setelah aplikasi diinisialisasi)

```bash
npm install
npm run dev
npm run test
npm run build
```

Perintah di atas **target standard scripts yang perlu dibuat developer**, belum tersedia di paket blueprint.

## Cloudflare demo

Prototype awal boleh menggunakan Vite/React dengan adapter data dummy. Jangan hubungkan langsung ke MySQL produksi, jangan mengandalkan Cloudflare untuk persistence final; lihat `docs/12_VPS_CLOUDFLARE_DEPLOYMENT.md`.

## Troubleshooting umum

- `ECONNREFUSED 127.0.0.1:3307`: MySQL lokal belum jalan / port salah.
- `Access denied`: credential dev/container tidak sesuai.
- `404` pada refresh route React: fallback SPA belum dikonfigurasi.
- `VITE_*` leak: hapus secret, rotate, rebuild; jangan hanya delete dari repo.
- Docker volume sudah ada tapi schema belum muncul: `docker-entrypoint-initdb.d` hanya berjalan saat initial bootstrap volume; jangan reset tanpa sadar.
