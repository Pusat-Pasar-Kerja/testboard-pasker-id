# AGENTS.md - Aturan untuk AI coding agent di repo ini

Baca dulu `docs/blueprint/AGENTS.md`, `docs/blueprint/README.md`, `docs/blueprint/docs/01-18`, dan `docs/adr/`.

## Aturan repo (tambahan atas blueprint)

1. **Repo publik.** Jangan pernah commit: file `.env`, kredensial, workbook UAT asli (`*.xlsx` selain template dummy), screenshot bukti nyata, nama/email penguji, IP VPS.
2. **Branch `develop`** untuk semua pekerjaan. Jangan push ke `main` tanpa perintah eksplisit pemilik proyek (VPS menarik `main` ke webroot publik).
3. **Setiap commit + push wajib diberi tag SemVer** (lihat `docs/adr/0001-repo-branch-versioning.md`): patch per commit, minor per milestone; samakan versi semua `package.json` dengan tag.
4. **Jangan menyambung ke database VPS produksi**, Cloudflare, atau melakukan deploy tanpa perintah eksplisit. `database/baseline/` read-only; perubahan schema hanya lewat `database/migrations/`.
5. Satu milestone dalam satu waktu (`docs/blueprint/docs/14_ROADMAP_BACKLOG.md`). Sebelum mulai: sebutkan file yang diubah dan tes yang ditambah. Setelah selesai: `npm run check` harus lulus.
6. Semua teks UI lewat i18n (`apps/web/src/i18n/locales/{id,en}`), tidak di-hardcode di JSX.
7. ID BIGINT dikirim sebagai string di JSON; query MySQL wajib prepared statement dan scoped per project.

## Perintah

```bash
npm install          # sekali di awal
npm run dev          # API (127.0.0.1:8787) + web (127.0.0.1:5173)
npm run check        # format, lint, typecheck, test, build
```
