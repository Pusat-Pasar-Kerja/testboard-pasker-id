# Checklist kesiapan produksi (Definition of Done Milestone 7)

Centang di VPS sebelum go-live. Kolom "Lokal" = sudah dibuktikan di laptop pengembang
(Apache 2.4 XAMPP + MariaDB 10.4, sama dengan VPS) pada rilis M7.

| #   | Pemeriksaan                                                                                            | Cara                                            | Lokal | VPS |
| --- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ----- | --- |
| 1   | Server memenuhi prasyarat (Node 22.12+, modul Apache, MySQL tools, cron)                               | `bash ops/testboard.sh check`                   | -     | [ ] |
| 2   | `api.env` di luar folder publik, izin 600, akun aplikasi (bukan root)                                  | `check`                                         | ya    | [ ] |
| 3   | Migrasi 0001-0006 diterapkan setelah backup                                                            | `deploy` (langkah migrasi)                      | ya    | [ ] |
| 4   | Halaman `/testboard/` tampil; refresh deep link tidak 404 (TB-OPS-001)                                 | `bash ops/testboard.sh smoke`                   | ya    | [ ] |
| 5   | `.git`, `.env`, kode sumber, SQL, skrip, `node_modules` tertutup, termasuk URL ter-encode (TB-OPS-002) | `smoke`                                         | ya    | [ ] |
| 6   | API hanya di 127.0.0.1:8787, bisa diakses lewat `/testboard/api/` saja                                 | `smoke` + konfigurasi (API menolak host publik) | ya    | [ ] |
| 7   | Login, logout, salah password, akun nonaktif (TB-AUTH-001..004)                                        | coba di browser                                 | tes   | [ ] |
| 8   | VIEWER tidak bisa membuat/mengubah; anggota proyek lain tidak melihat data (TB-RBAC-001/002)           | coba dengan 2 akun                              | tes   | [ ] |
| 9   | Unggah bukti tersimpan di `~/testboard-data/storage`, bukan di folder publik                           | unggah 1 screenshot, cek folder                 | tes   | [ ] |
| 10  | Backup malam berjalan; uji restore berhasil (TB-OPS-003)                                               | `backup` + `restore <folder>`                   | ya    | [ ] |
| 11  | Rollback aplikasi berfungsi                                                                            | `rollback` lalu `./update.sh`                   | -     | [ ] |
| 12  | Super Admin pertama dibuat dan password sementara diganti                                              | `create-admin`                                  | -     | [ ] |
| 13  | Ekspor laporan hanya untuk QA Lead/Admin, formula dinetralkan (TB-REPORT-001)                          | ekspor CSV, buka di Excel                       | tes   | [ ] |
| 14  | Tidak ada data Excel UAT asli/PII di demo Cloudflare                                                   | cek demo                                        | ya    | [ ] |

`tes` = dicakup tes otomatis (integrasi API + UI) yang lulus di CI.

## Pengerasan opsional (butuh admin server)

- `ServerTokens Prod` dan `ServerSignature Off` di konfigurasi utama Apache (versi Apache
  saat ini terlihat di header `Server`).
- User Linux khusus untuk TestBoard, dan service systemd sebagai pengganti cron watchdog.
- Subdomain sendiri untuk memisahkan origin dari aplikasi induk (lihat ADR 0010).
- Salinan backup otomatis ke server/penyimpanan lain.
