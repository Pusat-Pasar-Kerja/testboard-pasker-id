# Migrations

Perubahan schema **baru** di atas baseline (27 tabel). Forward-only, bernomor, direview, diuji di lokal dulu. **Tidak pernah diterapkan ke VPS tanpa persetujuan pemilik proyek dan backup.**

## Status

| File                           | Isi                                                              | Alasan                                                                 | Status                 |
| ------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------- |
| `0001_schema_migrations.sql`   | Tabel pencatat migration yang sudah diterapkan (dengan checksum) | Mencegah migration dijalankan dua kali atau file diubah diam-diam      | **Diterapkan (lokal)** |
| `0002_user_sessions.sql`       | Sesi login server-side (hash token, CSRF, kedaluwarsa, revoke)   | Login aman (DEC-02, doc 09); schema baseline belum punya session store | **Diterapkan (lokal)** |
| `0003_user_system_roles.sql`   | Peran global `SUPER_ADMIN`                                       | Keputusan DEC-01 (ADR 0004)                                            | **Diterapkan (lokal)** |
| `0004_system_settings.sql`     | Pengaturan website oleh Super Admin                              | Keputusan ADR 0004                                                     | **Diterapkan (lokal)** |
| `0005_auth_login_attempts.sql` | Catatan percobaan login (email di-hash)                          | Rate limit dan lockout (TB-AUTH-002)                                   | **Diterapkan (lokal)** |

Dampak ke database:

- **Hanya menambah 5 tabel baru.** Tidak ada `ALTER`/`DROP` pada 27 tabel baseline dan tidak ada perubahan data.
- Grant `testboard_app` di VPS (`SELECT, INSERT, UPDATE, DELETE ON testboard.*`) otomatis mencakup tabel baru; tidak perlu grant tambahan.
- Migration dijalankan dengan akun migrasi/DBA, bukan `testboard_app`.

## Cara menerapkan

Disetujui pemilik proyek 20 Nov 2026 dan sudah diterapkan ke database **lokal**. **VPS: belum.**

```bash
npm run db:migrate              # terapkan yang belum (lokal)
npm run db:migrate -- --status  # lihat status saja
```

Runner `scripts/migrate.mjs` menerapkan file berurutan ke database **lokal**, mencatat checksum di `schema_migrations`, dan menolak file yang sudah berubah setelah diterapkan. Penerapan ke VPS adalah langkah terpisah di Milestone 7, dengan backup dan rencana rollback.
