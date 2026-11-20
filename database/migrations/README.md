# Migrations

Belum ada migration. Usulan pertama (Milestone 2) adalah tabel session login (`user_sessions`), karena schema baseline belum punya session store (lihat `docs/blueprint/docs/15_OPEN_DECISIONS_AND_GAPS.md`).

Konvensi nama file: `NNNN_deskripsi_singkat.sql` (contoh `0001_user_sessions.sql`), forward-only, disertai catatan dampak dan rencana rollback di header file.
