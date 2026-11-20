# ADR 0003 - Engine database: MariaDB 10.4.32 (mengikuti VPS)

- **Status:** Diterima (20 November 2026)
- **Pemutus:** Pemilik proyek

## Konteks

- Blueprint mengasumsikan "MySQL 8". Pemeriksaan `SELECT VERSION();` di VPS produksi menghasilkan **`10.4.32-MariaDB`** (bawaan LAMPP).
- Pemilik proyek memilih **Docker** untuk database lokal.

## Keputusan

1. Database lokal = container **`mariadb:10.4.32`** (persis sama dengan produksi), port `127.0.0.1:3307`, file `infra/docker/docker-compose.dev.yml`. Schema baseline di-import otomatis saat volume pertama kali dibuat.
2. Kode backend wajib kompatibel dengan **MariaDB 10.4** (dan tetap jalan di versi MariaDB yang lebih baru).
3. Timestamp disimpan UTC (container memakai `--default-time-zone=+00:00`); tampilan Asia/Jakarta di UI.

## Batasan MariaDB 10.4 yang harus diperhatikan programmer

| Fitur                               | Status di 10.4                               | Konsekuensi                                                          |
| ----------------------------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Kolom `JSON`                        | Alias `LONGTEXT` + `CHECK (JSON_VALID(...))` | Driver mengembalikan **string**; backend harus `JSON.parse` sendiri. |
| `SELECT ... FOR UPDATE SKIP LOCKED` | Tidak ada (baru 10.6)                        | Antrean job memakai `FOR UPDATE` biasa / status-claim atomik.        |
| `INSERT ... RETURNING`              | Tidak ada (baru 10.5)                        | Ambil id dari `insertId` hasil query.                                |
| `JSON_TABLE`                        | Tidak ada (baru 10.6)                        | Olah JSON di aplikasi.                                               |
| CTE, window function, `CHECK`       | Ada                                          | Boleh dipakai.                                                       |

## Risiko

- **MariaDB 10.4 sudah end-of-life sejak Juni 2024** (tidak ada lagi patch keamanan). Disarankan merencanakan upgrade VPS ke versi LTS (mis. 10.11 atau 11.4) sebelum go-live publik, dengan backup + uji restore. Upgrade adalah keputusan infrastruktur; aplikasi dibuat agar tidak bergantung pada fitur khusus 10.4.
- Pengaturan server VPS (`sql_mode`, `character_set_server`, `collation_server`, `time_zone`) belum diketahui; perlu dicocokkan sebelum Milestone 3.
