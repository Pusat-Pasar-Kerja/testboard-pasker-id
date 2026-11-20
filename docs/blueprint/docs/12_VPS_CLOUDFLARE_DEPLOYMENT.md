# 12 - Deployment: Local -> GitHub -> VPS (Production); Cloudflare hanya demo

## Environment

| Environment | Frontend | API | Database | Bukti UAT |
|---|---|---|---|---|
| Local dev | Vite dev server | Hono Node local | MySQL local `testboard` | Folder lokal privat |
| Prototype presentation | Cloudflare static/Workers | Mock API/data dummy | Tidak terhubung ke prod | Dummy only |
| VPS production | Apache menyajikan Vite `dist` | Node/Hono service local + reverse proxy | MySQL `testboard` pada VPS | Private VPS storage |

## Path sesuai struktur yang pengguna pilih

- Repo checkout independen: `/opt/lampp/htdocs/paskerid/public/testboard/`.
- Script update: `/opt/lampp/htdocs/paskerid/public/testboard/update.sh`.
- Output Vite dalam checkout: `apps/web/dist/` setelah `npm run build`.
- API: service Node terpisah (loopback only, mis. `127.0.0.1:8787`), bukan file langsung dieksekusi Apache.
- Private evidence: usulan `/var/lib/testboard/storage/`.

**PENTING:** Repo di `public` berisiko dapat terekspos dari webroot aplikasi induk. **Jangan go-live** sampai konfigurasi Apache secara eksplisit menolak request ke source, `.git`, `.env`, backend, database, dan hanya menyajikan asset hasil build. Mengarahkan vhost baru ke `dist` saja **tidak cukup** jika vhost aplikasi induk masih dapat mengakses path repo. Alternatif teraman tetap repo di luar webroot dengan hanya `dist` di dalam public; lokasi dapat diubah kemudian tanpa mengubah GitHub.

## Alur release yang disarankan

1. Kode dikembangkan dan diuji di laptop.
2. Push branch feature -> code review -> merge `main`.
3. Backup DB dan konfigurasi produksi; uji migration di staging.
4. `update.sh` versi final menjalankan git fetch/pull ke commit yang disetujui, `npm ci`, build frontend/backend, migrasi (setelah approval), atomic switch assets, restart service, healthcheck.
5. Smoke test `/testboard/` + API + DB + authorization + evidence.
6. Simpan rollback plan: app release sebelumnya dan DB backup/migration down plan.

## Contoh `update.sh` hanya untuk tahap Git pull (sudah digunakan pengguna)

```bash
#!/bin/bash
set -e
cd /opt/lampp/htdocs/paskerid/public/testboard
git pull --ff-only origin main
```

Untuk React/Node, script di atas hanya menarik file. **Belum melakukan build**, restart backend, atau rollback. Contoh ops opsional ada di `ops/update.sh.example` (jangan jalankan sebelum adaptasi dan review).

## Prasyarat server

- Node.js LTS versi yang kompatibel dengan paket, npm, git.
- Apache (LAMPP) mendukung proxy ke Node API, HTTPS, routing SPA, path base Vite.
- MySQL lokal VPS `testboard`, username runtime `testboard_app` hanya CRUD, host `127.0.0.1:3306`.
- Supervisor: `systemd` service `testboard-api` yang berjalan sebagai **non-root user**.
- Storage privat dengan permission minimal, AV scan dan media worker.
- Deployment service account non-root; CI/CD opsional setelah manual update tervalidasi.

## Path / origin URL

- Jika berada di subpath `https://.../testboard/`, atur Vite `base: '/testboard/'` dan React Router basename `/testboard`; Apache fallback SPA kecuali API/assets.
- URL subpath adalah usulan; **belum terkonfirmasi routing Apache existing**.
- Jika memakai subdomain tersendiri, Vite `base: '/'` dan vhost berbeda lebih mudah untuk SPA routing; butuh pengaturan DNS dan sertifikat.

## Apache production safety test (sesuaikan alamat final)

```bash
curl -I https://CONTOH-DOMAIN/testboard/
curl -I https://CONTOH-DOMAIN/testboard/.git/HEAD
curl -I https://CONTOH-DOMAIN/testboard/.env
curl -I https://CONTOH-DOMAIN/testboard/apps/api/src/index.ts
curl -I https://CONTOH-DOMAIN/testboard/database/schema_baseline_reference.sql
```

**Kriteria:** root frontend sukses, sedangkan semua path source/secret harus **403/404** (bukan 200), termasuk URL dengan encoding/dotfile bypass. Jika satu saja bisa diunduh, jangan go-live.

## Smoke test setelah deploy

- `/testboard/` tampil; refresh deep-link normal; assets no 404.
- Login dan API health berjalan via HTTPS; API tidak bisa diakses langsung dari internet lewat port internal.
- DB host VPS benar, bukan port dev 3307.
- File upload tersimpan di folder privat, bukan `public/testboard/uploads`.
- Role VIEWER tak bisa create/edit, user project lain tidak bisa mengambil data.
- Rollback aplikasi diuji.

## Cloudflare prototype

- Boleh deploy hanya `apps/web` dengan `VITE_DEMO_MODE=true`; `MockRepository`/mock service mensimulasikan data UAT dan bug.
- Demo tidak boleh mengandung data Excel personal/real bug screenshots kecuali telah dianonimkan dan memang disetujui.
- Jangan menyimpan atau membocorkan kredensial MySQL dalam Workers/Vite.
- Prototype bersifat presentasional, bukan sumber kebenaran data.

## Documentation references

- Vite base URL: https://vite.dev/guide/build.html#public-base-path
- Hono Node.js: https://hono.dev/docs/getting-started/nodejs
- Cloudflare Workers + Hono: https://developers.cloudflare.com/workers/framework-guides/web-apps/more-web-frameworks/hono/
- OWASP File Upload: https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html
