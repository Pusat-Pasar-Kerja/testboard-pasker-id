# ADR 0001 - Lokasi repo, branch, dan versioning

- **Status:** Diterima (20 November 2026)
- **Pemutus:** Pemilik proyek

## Konteks

- Remote `github.com/Pusat-Pasar-Kerja/testboard-pasker-id` bersifat **publik**.
- Workbook UAT asli (nama penguji, screenshot, catatan bug) ada di folder `references/` milik pengembang dan **tidak boleh** masuk repo.
- `update.sh` di VPS menjalankan `git pull --ff-only origin main` ke `/opt/lampp/htdocs/paskerid/public/testboard/` yang berada di **webroot publik** Apache.

## Keputusan

1. **Root repo** = folder `workspace/v1.0` di komputer pengembang. Folder `references/` berada di luar repo. Dokumen blueprint disalin ke `docs/blueprint/` tanpa file Excel asli dan dengan IP VPS disensor. `.gitignore` menolak `*.xlsx` kecuali template dummy.
2. **Branch:** semua pekerjaan di-commit ke `develop`. `main` hanya menerima merge rilis yang disetujui **setelah** Apache dibatasi hanya menyajikan `dist` (lihat doc 12), sehingga `update.sh` tidak menarik kode setengah jadi ke webroot publik.
3. **Versioning (SemVer 0.x):** **setiap commit yang di-push wajib diberi tag** annotated.
   - Scaffold awal: `v0.1.0`.
   - Setiap commit berikutnya: naik **patch** (`v0.1.1`, `v0.1.2`, ...).
   - Milestone selesai: naik **minor** (`v0.2.0` = Milestone 1 selesai, dst.).
   - `v1.0.0` hanya saat release gate produksi (doc 13 + security gate doc 09) lulus.
   - Versi di semua `package.json` workspace disamakan dengan tag (`npm version X.Y.Z --workspaces --include-workspace-root --no-git-tag-version`).

## Pembaruan 24 November 2026: Versi 1

- Pemilik proyek menetapkan **`v1.0.0`**. Situs sudah live di VPS dan dipakai untuk UAT bersama. Deploy, migrasi, uji `smoke`, Super Admin pertama, serta backup dengan uji restore sudah dijalankan di VPS sejak 20 November 2026. Kolom "VPS" di `docs/deploy/production-checklist.md` belum dicentang di repo.
- Mulai `v1.0.0`, setiap commit yang di-push tetap diberi tag:
  - **patch** untuk perbaikan (`v1.0.1`);
  - **minor** untuk fitur baru atau milestone (`v1.1.0`);
  - **major** hanya untuk perubahan yang tidak cocok dengan versi sebelumnya (`v2.0.0`).
- Nomor versi tampil di kaki halaman (`__APP_VERSION__` dari `apps/web/package.json`) dan di `GET /api/v1/health`.

## Konsekuensi

- Default branch GitHub menjadi `develop` sampai `main` dibuat pada rilis pertama.
- Setiap push: `git push origin develop --follow-tags`.
