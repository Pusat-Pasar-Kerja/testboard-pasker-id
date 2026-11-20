-- ============================================================================
-- 0001 - Migration tracking table
-- STATUS : USULAN (belum diterapkan di mana pun). Terapkan ke DB LOKAL setelah disetujui.
-- ENGINE : MariaDB 10.4.32 (sama dengan VPS)
-- IMPACT : tabel baru saja; tidak mengubah 27 tabel baseline.
-- RUN AS : akun migrasi (root lokal / akun DBA di VPS), BUKAN testboard_app.
-- ROLLBACK (hanya dev): DROP TABLE schema_migrations;
-- ============================================================================
CREATE TABLE IF NOT EXISTS schema_migrations (
  version     VARCHAR(100) NOT NULL COMMENT 'File name without .sql, e.g. 0002_user_sessions',
  checksum    CHAR(64)     NOT NULL COMMENT 'SHA-256 of the file; a changed file is refused',
  applied_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  applied_by  VARCHAR(100) NULL,
  PRIMARY KEY (version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
