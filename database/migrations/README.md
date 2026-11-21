# Migrations

Perubahan schema **baru** di atas baseline (27 tabel). Forward-only, bernomor, direview, diuji di lokal dulu. **Tidak pernah diterapkan ke VPS tanpa persetujuan pemilik proyek dan backup.**

## Status

| File                             | Isi                                                                               | Alasan                                                                 | Status                 |
| -------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------- |
| `0001_schema_migrations.sql`     | Tabel pencatat migration yang sudah diterapkan (dengan checksum)                  | Mencegah migration dijalankan dua kali atau file diubah diam-diam      | **Diterapkan (lokal)** |
| `0002_user_sessions.sql`         | Sesi login server-side (hash token, CSRF, kedaluwarsa, revoke)                    | Login aman (DEC-02, doc 09); schema baseline belum punya session store | **Diterapkan (lokal)** |
| `0003_user_system_roles.sql`     | Peran global `SUPER_ADMIN`                                                        | Keputusan DEC-01 (ADR 0004)                                            | **Diterapkan (lokal)** |
| `0004_system_settings.sql`       | Pengaturan website oleh Super Admin                                               | Keputusan ADR 0004                                                     | **Diterapkan (lokal)** |
| `0005_auth_login_attempts.sql`   | Catatan percobaan login (email di-hash)                                           | Rate limit dan lockout (TB-AUTH-002)                                   | **Diterapkan (lokal)** |
| `0006_file_scan_details.sql`     | 3 kolom NULL di `file_objects`: jenis pemeriksaan, waktu, alasan tolak            | Mencatat jujur file lolos pemeriksaan dasar atau antivirus (ADR 0008)  | **Diterapkan (lokal)** |
| `0007_permanent_super_admin.sql` | 1 kolom `is_permanent` (default 0) di `user_system_roles`                         | Super Admin pemilik tidak bisa dicabut dari website (ADR 0011)         | **Diterapkan (lokal)** |
| `0008_account_recovery.sql`      | 2 tabel: permintaan "Lupa email / kata sandi" dan tautan reset (hash)             | Pemulihan akun lewat Super Admin, 1 tautan aktif per akun (ADR 0012)   | **Diterapkan (lokal)** |
| `0009_data_tools.sql`            | 5 kolom NULL: siklus + jejak impor di `defects`, `merged_into_id` di `test_cases` | Siklus pada bug, impor bug Tracker, gabung test case (ADR 0013)        | **Diterapkan (lokal)** |
| `0010_import_target.sql`         | 1 kolom `import_target` (default TEST_CASES) di `import_jobs`                     | Impor Bug dari Tracker (ADR 0013)                                      | **Diterapkan (lokal)** |

Dampak ke database:

- 0001-0005 dan 0008 **hanya menambah tabel baru** (5 + 2). 0006, 0007, 0009, dan 0010 hanya **menambah** kolom (3 kolom NULL di `file_objects`; 1 kolom default 0 di `user_system_roles`), tidak mengubah/menghapus kolom atau data. Tidak ada `DROP`.
- Grant `testboard_app` di VPS (`SELECT, INSERT, UPDATE, DELETE ON testboard.*`) otomatis mencakup tabel baru; tidak perlu grant tambahan.
- Migration dijalankan dengan akun migrasi/DBA, bukan `testboard_app`.

## Cara menerapkan

0001-0005 disetujui pemilik proyek 20 Nov 2026; 0006 disetujui bersama pilihan Milestone 5. Semua sudah diterapkan ke database **lokal**. **VPS: belum.**

```bash
npm run db:migrate              # terapkan yang belum (lokal)
npm run db:migrate -- --status  # lihat status saja
```

Runner `scripts/migrate.mjs` menerapkan file berurutan ke database **lokal**, mencatat checksum di `schema_migrations`, dan menolak file yang sudah berubah setelah diterapkan. Penerapan ke VPS adalah langkah terpisah di Milestone 7, dengan backup dan rencana rollback.
