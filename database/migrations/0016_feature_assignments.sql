-- ============================================================================
-- 0016 - Penugasan fitur di UAT: kelompok dan pengguna
-- STATUS : Diminta pemilik proyek (24 Nov 2026, setelah v0.22.0; ADR 0020).
-- IMPACT : 1 tabel baru `uat_feature_people` (pengguna yang ditugaskan langsung ke sebuah
--          fitur UAT). Kelompok tetap memakai `workshop_table_modules`. Tidak ada kolom atau
--          data yang dihapus. Peserta yang belum masuk kelompok (dulu boleh mengerjakan semua
--          fitur UAT-nya) ditugaskan ke semua fitur UAT itu, supaya tidak ada yang kehilangan
--          pekerjaan; Admin bisa mengurangi penugasan kapan saja.
-- SAFE   : IF NOT EXISTS / INSERT IGNORE, jadi aman dijalankan ulang.
-- ROLLBACK (hanya dev):
--   DROP TABLE uat_feature_people;
-- ============================================================================

CREATE TABLE IF NOT EXISTS uat_feature_people (
  member_id   BIGINT UNSIGNED NOT NULL COMMENT 'Peserta UAT (workshop_table_members.id)',
  module_id   BIGINT UNSIGNED NOT NULL COMMENT 'Fitur yang ditugaskan kepadanya',
  created_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (member_id, module_id),
  KEY ix_feature_people_module (module_id),
  CONSTRAINT fk_feature_people_member FOREIGN KEY (member_id)
    REFERENCES workshop_table_members(id) ON DELETE CASCADE,
  CONSTRAINT fk_feature_people_module FOREIGN KEY (module_id)
    REFERENCES modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Peserta tanpa kelompok: tetap mengerjakan semua fitur UAT-nya seperti sebelumnya.
INSERT IGNORE INTO uat_feature_people (member_id, module_id)
SELECT m.id, f.module_id
  FROM workshop_table_members m
  JOIN uat_features f ON f.run_id = m.run_id
 WHERE m.table_id IS NULL AND m.run_id IS NOT NULL;
