-- ============================================================================
-- 0002 - Server-side login sessions (DEC-02, doc 09 "Session policy")
-- STATUS : Disetujui pemilik proyek (20 Nov 2026). Status penerapan tercatat di schema_migrations.
-- IMPACT : tabel baru; FK ke users(id) ON DELETE CASCADE. Tidak mengubah tabel baseline.
-- DESIGN : cookie HttpOnly+Secure+SameSite berisi token acak; DB hanya menyimpan HASH-nya,
--          jadi kebocoran DB tidak membocorkan sesi aktif. Token CSRF juga disimpan sebagai hash.
-- ROLLBACK (hanya dev): DROP TABLE user_sessions;
-- ============================================================================
CREATE TABLE IF NOT EXISTS user_sessions (
  id               CHAR(64)        NOT NULL COMMENT 'SHA-256 of the opaque session token',
  user_id          BIGINT UNSIGNED NOT NULL,
  csrf_token_hash  CHAR(64)        NOT NULL COMMENT 'SHA-256 of the CSRF token for this session',
  created_at       DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at     DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at       DATETIME(3)     NOT NULL COMMENT 'Absolute expiry (UTC)',
  revoked_at       DATETIME(3)     NULL COMMENT 'Set on logout, password change, or admin revoke',
  ip_address       VARCHAR(45)     NULL,
  user_agent       VARCHAR(255)    NULL,
  PRIMARY KEY (id),
  KEY ix_sessions_user (user_id, revoked_at),
  KEY ix_sessions_expiry (expires_at),
  CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
