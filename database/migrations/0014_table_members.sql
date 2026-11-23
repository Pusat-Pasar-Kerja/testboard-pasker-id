-- ============================================================================
-- 0014 - Anggota meja dengan akun Pengguna (ADR 0018)
-- STATUS : Diminta pemilik proyek (24 Nov 2026).
-- IMPACT : 1 tabel baru `workshop_table_members`. Nama anggota yang sudah ada di
--          `workshop_tables.member_names_json` disalin ke tabel ini (urutan tetap). Kolom lama
--          tidak dihapus dan tidak dipakai lagi oleh aplikasi.
-- DESIGN : satu baris per orang di meja: nama, dan (bila Admin mengisi email) akun Pengguna
--          orang itu. Kartu meja tetap satu akun WORKSHOP per meja (ADR 0016).
-- ROLLBACK (hanya dev): DROP TABLE workshop_table_members;
-- ============================================================================
CREATE TABLE IF NOT EXISTS workshop_table_members (
  id           BIGINT UNSIGNED   NOT NULL AUTO_INCREMENT,
  table_id     BIGINT UNSIGNED   NOT NULL,
  sort_order   SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  display_name VARCHAR(100)      NOT NULL,
  user_id      BIGINT UNSIGNED   NULL COMMENT 'Akun Pengguna orang ini (dari email yang diisi Admin)',
  created_at   DATETIME(3)       NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_table_member_name (table_id, display_name),
  UNIQUE KEY uq_table_member_user (table_id, user_id),
  KEY idx_table_member_user (user_id),
  CONSTRAINT fk_table_member_table FOREIGN KEY (table_id) REFERENCES workshop_tables(id) ON DELETE CASCADE,
  CONSTRAINT fk_table_member_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- MariaDB 10.4 has no JSON_TABLE: walk the (at most 30) array positions with a number list.
INSERT IGNORE INTO workshop_table_members (table_id, sort_order, display_name)
SELECT t.id, n.n, LEFT(TRIM(JSON_UNQUOTE(JSON_EXTRACT(t.member_names_json, CONCAT('$[', n.n, ']')))), 100)
  FROM workshop_tables t
  JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4
        UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9
        UNION ALL SELECT 10 UNION ALL SELECT 11 UNION ALL SELECT 12 UNION ALL SELECT 13
        UNION ALL SELECT 14 UNION ALL SELECT 15 UNION ALL SELECT 16 UNION ALL SELECT 17
        UNION ALL SELECT 18 UNION ALL SELECT 19 UNION ALL SELECT 20 UNION ALL SELECT 21
        UNION ALL SELECT 22 UNION ALL SELECT 23 UNION ALL SELECT 24 UNION ALL SELECT 25
        UNION ALL SELECT 26 UNION ALL SELECT 27 UNION ALL SELECT 28 UNION ALL SELECT 29) n
    ON n.n < JSON_LENGTH(t.member_names_json)
 WHERE t.member_names_json IS NOT NULL
   AND JSON_VALID(t.member_names_json)
   AND TRIM(JSON_UNQUOTE(JSON_EXTRACT(t.member_names_json, CONCAT('$[', n.n, ']')))) <> '';
