# Database

| Folder                                   | Isi                                                                                                                | Aturan                                                                                                             |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `baseline/schema_baseline_reference.sql` | Snapshot schema `testboard` (27 tabel + view `v_run_case_latest_status`) yang **sudah dijalankan di VPS produksi** | **Read-only.** Hanya untuk membuat DB **lokal** yang masih kosong. **Jangan pernah dijalankan ulang di VPS.**      |
| `checks/DATABASE_READ_ONLY_CHECKS.sql`   | Query verifikasi read-only (SHOW/SELECT)                                                                           | Aman dijalankan untuk memeriksa struktur.                                                                          |
| `migrations/`                            | Perubahan schema **baru** (mis. tabel session)                                                                     | Bernomor, forward-only, direview, diuji di lokal/staging dulu. Tidak diterapkan ke VPS tanpa persetujuan + backup. |

Prinsip:

- Aplikasi (backend) memakai user MySQL ber-privilege terbatas (`SELECT/INSERT/UPDATE/DELETE`). Migration dijalankan dengan akun terpisah.
- Tidak ada `DROP TABLE` / perubahan destruktif pada data produksi.
- File lampiran tidak disimpan sebagai BLOB; `file_objects` hanya berisi metadata.
