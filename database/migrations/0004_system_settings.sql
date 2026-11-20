-- ============================================================================
-- 0004 - Website-wide settings managed by Super Admin (ADR 0004)
-- STATUS : Disetujui pemilik proyek (20 Nov 2026). Status penerapan tercatat di schema_migrations.
-- IMPACT : tabel baru. Pengaturan per proyek tetap di project_settings (baseline).
-- EXAMPLES: upload.max_file_mb, upload.allowed_types, auth.session_hours, ui.default_locale
-- NOTE   : MariaDB 10.4 -> JSON = LONGTEXT + CHECK(JSON_VALID); backend mem-parse sendiri.
-- ROLLBACK (hanya dev): DROP TABLE system_settings;
-- ============================================================================
CREATE TABLE IF NOT EXISTS system_settings (
  setting_key  VARCHAR(120)    NOT NULL,
  value_json   JSON            NOT NULL,
  updated_by   BIGINT UNSIGNED NULL,
  updated_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (setting_key),
  CONSTRAINT fk_sysset_actor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
