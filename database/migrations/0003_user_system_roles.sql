-- ============================================================================
-- 0003 - Global (system-wide) roles: SUPER_ADMIN (DEC-01, ADR 0004)
-- STATUS : Disetujui pemilik proyek (20 Nov 2026). Status penerapan tercatat di schema_migrations.
-- IMPACT : tabel baru; tidak menambah kolom ke users. Peran per proyek tetap di project_members.
-- RULES  : Super Admin mengakses dan mengonfigurasi semuanya, tetapi semua aksinya tetap
--          dicatat di audit_logs. Super Admin pertama dibuat lewat CLI di server.
-- ROLLBACK (hanya dev): DROP TABLE user_system_roles;
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_system_roles (
  user_id     BIGINT UNSIGNED NOT NULL,
  role_code   VARCHAR(32)     NOT NULL COMMENT 'SUPER_ADMIN',
  granted_by  BIGINT UNSIGNED NULL,
  granted_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role_code),
  CONSTRAINT fk_sysroles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sysroles_granter FOREIGN KEY (granted_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
