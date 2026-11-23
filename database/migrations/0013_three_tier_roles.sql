-- ============================================================================
-- 0013 - Tiga tingkat peran: Super Admin, Admin, Pengguna dengan tugas (ADR 0017)
-- STATUS : Diminta pemilik proyek (24 Nov 2026).
-- IMPACT : tidak ada kolom atau tabel baru.
--          1. Setiap akun LOCAL yang pernah menjadi Admin atau QA Lead di sebuah proyek (dan
--             belum Super Admin) mendapat peran situs 'ADMIN' di user_system_roles.
--          2. Baris project_members dengan peran ADMIN atau QA_LEAD diubah menjadi TESTER
--             (Penguji). Bagi akun yang kini Admin situs, baris ini tidak lagi menentukan
--             apa-apa (Admin mengelola semua proyek); baris ini baru terpakai bila peran Admin
--             dicabut kelak, dan saat itu orangnya menjadi Pengguna biasa (Penguji).
-- DESIGN : Admin (peran situs) membuat dan mengelola semua proyek. Pengguna mendapat satu
--          tugas per proyek: TESTER (Penguji), DEVELOPER, atau VIEWER (Pemantau).
-- ROLLBACK (hanya dev): tidak otomatis; peran lama per proyek tidak disimpan.
-- ============================================================================
INSERT INTO user_system_roles (user_id, role_code, granted_by)
SELECT DISTINCT m.user_id, 'ADMIN', NULL
  FROM project_members m
  JOIN users u ON u.id = m.user_id
 WHERE m.role_code IN ('ADMIN', 'QA_LEAD')
   AND u.auth_provider = 'LOCAL'
   AND NOT EXISTS (SELECT 1 FROM user_system_roles r WHERE r.user_id = m.user_id);

UPDATE project_members SET role_code = 'TESTER' WHERE role_code IN ('ADMIN', 'QA_LEAD');
