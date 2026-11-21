-- ============================================================================
-- 0007 - Permanent (owner) Super Admin (ADR 0011)
-- STATUS : Diminta pemilik proyek (21 Nov 2026): akun Super Admin utama tidak boleh bisa
--          dicabut atau dinonaktifkan oleh siapa pun dari website.
-- IMPACT : 1 kolom baru NOT NULL DEFAULT 0 pada user_system_roles; tidak mengubah data.
-- WHY    : Tanda pemilik ditetapkan hanya lewat perintah di server
--          (ops/testboard.sh protect-admin), tidak bisa diubah lewat website.
-- ROLLBACK (hanya dev):
--   ALTER TABLE user_system_roles DROP COLUMN is_permanent;
-- ============================================================================
ALTER TABLE user_system_roles
  ADD COLUMN is_permanent TINYINT(1) NOT NULL DEFAULT 0
    COMMENT 'Owner: cannot be revoked or deactivated from the website' AFTER role_code;
