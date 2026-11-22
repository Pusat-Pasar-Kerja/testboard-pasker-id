-- ============================================================================
-- 0011 - "Selalu login di perangkat ini" (ADR 0015)
-- STATUS : Diminta pemilik proyek (22 Nov 2026).
-- IMPACT : 1 kolom baru NOT NULL DEFAULT 0 di user_sessions; sesi lama tetap 0 (perilaku
--          sama seperti sebelumnya: batas 12 jam dan batas diam 120 menit).
-- DESIGN : sesi yang diingat (1) berlaku sampai expires_at (bawaan 30 hari) tanpa batas diam;
--          tetap dicabut saat logout, ganti kata sandi, akun dinonaktifkan, atau "Keluar dari
--          perangkat lain".
-- ROLLBACK (hanya dev): ALTER TABLE user_sessions DROP COLUMN remember_device;
-- ============================================================================
ALTER TABLE user_sessions
  ADD COLUMN remember_device TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = "Selalu login di perangkat ini": no idle limit, persistent cookie' AFTER expires_at;
