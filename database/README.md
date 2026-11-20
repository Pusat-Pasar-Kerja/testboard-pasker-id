# Database

| Folder                                   | Isi                                                                                                                | Aturan                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `baseline/schema_baseline_reference.sql` | Snapshot schema `testboard` (27 tabel + view `v_run_case_latest_status`) yang **sudah dijalankan di VPS produksi** | **Read-only.** Hanya untuk membuat DB **lokal** yang masih kosong. **Jangan pernah dijalankan ulang di VPS.**      |
| `checks/DATABASE_READ_ONLY_CHECKS.sql`   | Query verifikasi read-only (SHOW/SELECT)                                                                           | Aman dijalankan untuk memeriksa struktur.                                                                          |
| `migrations/`                            | Perubahan schema **baru** (mis. tabel session)                                                                     | Bernomor, forward-only, direview, diuji di lokal/staging dulu. Tidak diterapkan ke VPS tanpa persetujuan + backup. |

Prinsip:

- Aplikasi (backend) memakai user database ber-privilege terbatas (`SELECT/INSERT/UPDATE/DELETE`). Migration dijalankan dengan akun terpisah.
- Tidak ada `DROP TABLE` / perubahan destruktif pada data produksi.
- File lampiran tidak disimpan sebagai BLOB; `file_objects` hanya berisi metadata.

## Database lokal (tanpa Docker - cara utama)

Engine: **MariaDB 10.4.32** dari XAMPP yang sudah terpasang, sama persis dengan VPS ([ADR 0003](../docs/adr/0003-database-engine.md), [ADR 0004](../docs/adr/0004-keputusan-20-nov-2026.md)). Berjalan sebagai **instance terpisah** (data di `.local-db/`, port 3307), jadi database XAMPP Anda tidak tersentuh.

```bash
npm run db:init     # sekali: buat instance, database testboard, user dev, impor schema baseline
npm run db:start    # nyalakan (misalnya setelah laptop restart)
npm run db:stop     # matikan
npm run db:status   # versi, sql_mode, collation, jumlah tabel
```

- `db:init` menyalin pengaturan VPS (`sql_mode`, `utf8mb4_general_ci`) dan menulis `apps/api/.env` (git-ignored) berisi kredensial lokal acak.
- User aplikasi lokal `testboard_dev` hanya punya `SELECT/INSERT/UPDATE/DELETE` (sama seperti `testboard_app` di VPS); migration dijalankan sebagai root lokal.
- Koneksi DBeaver: host `127.0.0.1`, port **3307**, database `testboard`; kredensial ada di `apps/api/.env`. **Ini database laptop, bukan VPS.**
- Binary di lokasi lain: set variabel `MARIADB_BIN` (default folder `mysql\bin` milik XAMPP di drive C).

## Alternatif: Docker

Engine sama (`mariadb:10.4.32`), untuk pengembang yang punya Docker.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) lalu jalankan aplikasinya.
2. Salin `infra/docker/docker.env.example` menjadi `infra/docker/docker.env`, isi password lokal (bebas, hanya untuk laptop).
3. Dari root repo:

   ```bash
   docker compose --env-file infra/docker/docker.env -f infra/docker/docker-compose.dev.yml up -d
   ```

4. Koneksi DBeaver: host `127.0.0.1`, port **3307**, database `testboard`, user `testboard_dev`. **Ini database laptop, bukan VPS.**
5. Hati-hati: `docker compose ... down -v` **menghapus** isi database lokal.
