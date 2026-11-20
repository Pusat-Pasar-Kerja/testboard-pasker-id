# Prototype demo di Cloudflare Pages (mock data saja)

Prototype presentasi = **hanya frontend** dengan data contoh fiktif. Tidak ada API, tidak ada database, tidak ada kredensial. (Blueprint doc 12: Cloudflare hanya demo; produksi di VPS.)

> Belum pernah di-deploy oleh AI agent. Deploy hanya dilakukan atas perintah pemilik proyek.

## Build

```bash
npm ci
VITE_DEMO_MODE=true VITE_BASE_PATH=/ npm run build -w @testboard/web
```

Hasil: `apps/web/dist/`. Pada Windows PowerShell, set variabel dengan `$env:VITE_DEMO_MODE='true'` sebelum `npm run build`.

## Pengaturan Cloudflare Pages

| Pengaturan             | Nilai                                                                             |
| ---------------------- | --------------------------------------------------------------------------------- |
| Build command          | `npm ci && npm run build -w @testboard/shared && npm run build -w @testboard/web` |
| Build output directory | `apps/web/dist`                                                                   |
| Environment variables  | `VITE_DEMO_MODE=true`, `VITE_BASE_PATH=/`, `NODE_VERSION=24`                      |

- Routing SPA: Cloudflare Pages otomatis menyajikan `index.html` untuk rute yang tidak dikenal selama tidak ada `404.html`, jadi refresh pada `/projects/DEMO-KARIR/bugs` tetap jalan.
- **Jangan** menambahkan variabel `VITE_*` berisi rahasia; semua nilai `VITE_*` ikut ke browser.
- Data demo berasal dari `apps/web/src/mocks/seed.ts` (fiktif, berlabel "Demo"). Jangan mengganti dengan data UAT asli.
