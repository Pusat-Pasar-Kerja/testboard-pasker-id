-- ============================================================================
-- 0008 - Account recovery: "Lupa email / Lupa password" requests and reset links (ADR 0012)
-- STATUS : Diminta pemilik proyek (21 Nov 2026): pengguna yang lupa email atau kata sandi
--          mengirim permintaan ke Administrator; hanya Super Admin yang membantu dengan
--          menerbitkan tautan berbatas waktu, maksimal satu tautan aktif per akun.
-- IMPACT : 2 tabel baru; tidak mengubah tabel atau data yang sudah ada.
-- PRIVACY: tautan tidak pernah disimpan mentah - hanya SHA-256 dari token acak 256-bit.
--          Isi permintaan (nama, email, kontak, pesan) hanya terlihat oleh Super Admin dan
--          dibersihkan otomatis 180 hari setelah selesai (job retensi backend).
-- WHY    : active_user_id berisi user_id selama tautan masih bisa dipakai dan NULL setelah
--          dipakai / dicabut / diganti / kedaluwarsa. UNIQUE pada kolom itu menjamin tidak
--          pernah ada dua tautan aktif untuk akun yang sama, juga bila dua admin menekan
--          tombol bersamaan.
-- ROLLBACK (hanya dev):
--   DROP TABLE password_reset_links; DROP TABLE account_recovery_requests;
-- ============================================================================
CREATE TABLE IF NOT EXISTS account_recovery_requests (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  request_kind       VARCHAR(20)     NOT NULL COMMENT 'FORGOT_PASSWORD|FORGOT_EMAIL',
  status_code        VARCHAR(20)     NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN|RESOLVED|DISMISSED',
  submitted_name     VARCHAR(120)    NOT NULL,
  submitted_email    VARCHAR(254)    NULL COMMENT 'As typed by the visitor (may match no account)',
  contact_info       VARCHAR(200)    NULL,
  message_text       VARCHAR(1000)   NULL,
  user_id            BIGINT UNSIGNED NULL COMMENT 'Matched or linked account (Super Admin only)',
  submit_count       INT UNSIGNED    NOT NULL DEFAULT 1,
  ip_address         VARCHAR(45)     NULL,
  user_agent         VARCHAR(255)    NULL,
  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_submitted_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  handled_by         BIGINT UNSIGNED NULL,
  handled_at         DATETIME(3)     NULL,
  resolution_note    VARCHAR(500)    NULL,
  PRIMARY KEY (id),
  KEY ix_recovery_status (status_code, last_submitted_at),
  KEY ix_recovery_ip (ip_address, created_at),
  KEY ix_recovery_email (submitted_email),
  KEY ix_recovery_user (user_id),
  CONSTRAINT fk_recovery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_recovery_handler FOREIGN KEY (handled_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS password_reset_links (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id          BIGINT UNSIGNED NOT NULL,
  token_hash       CHAR(64)        NOT NULL COMMENT 'SHA-256 of the random token in the link',
  active_user_id   BIGINT UNSIGNED NULL COMMENT '= user_id while usable; NULL afterwards',
  request_id       BIGINT UNSIGNED NULL,
  issued_by        BIGINT UNSIGNED NULL,
  issued_at        DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at       DATETIME(3)     NOT NULL,
  used_at          DATETIME(3)     NULL,
  revoked_at       DATETIME(3)     NULL,
  revoked_by       BIGINT UNSIGNED NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_reset_token (token_hash),
  UNIQUE KEY uq_reset_active_user (active_user_id),
  KEY ix_reset_user (user_id, issued_at),
  CONSTRAINT fk_reset_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_reset_request FOREIGN KEY (request_id)
    REFERENCES account_recovery_requests(id) ON DELETE SET NULL,
  CONSTRAINT fk_reset_issuer FOREIGN KEY (issued_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_reset_revoker FOREIGN KEY (revoked_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
