-- ============================================================================
-- 0005 - Login attempts for rate limiting and adaptive lockout (doc 09, TB-AUTH-002)
-- STATUS : Disetujui pemilik proyek (20 Nov 2026). Status penerapan tercatat di schema_migrations.
-- IMPACT : tabel baru; tanpa FK (percobaan untuk email yang tidak terdaftar juga dicatat).
-- PRIVACY: email TIDAK disimpan mentah - hanya SHA-256 dari email yang dinormalkan.
--          Data lama dibersihkan berkala (mis. lebih dari 30 hari) oleh job backend.
-- ROLLBACK (hanya dev): DROP TABLE auth_login_attempts;
-- ============================================================================
CREATE TABLE IF NOT EXISTS auth_login_attempts (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  email_hash    CHAR(64)        NOT NULL COMMENT 'SHA-256 of lower-cased trimmed email',
  ip_address    VARCHAR(45)     NULL,
  succeeded     TINYINT(1)      NOT NULL,
  attempted_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_login_attempts_email (email_hash, attempted_at),
  KEY ix_login_attempts_ip (ip_address, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
