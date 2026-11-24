-- ============================================================================
-- 0015 - Susunan seperti Google Drive: Fase > Fitur > Skenario, bagian UAT, Bug Reporting
-- STATUS : Diminta pemilik proyek (24 Nov 2026, putaran kedua; ADR 0019).
-- IMPACT : 1 tabel baru `uat_features`. Kolom baru (semua boleh kosong atau berbawaan):
--          test_cases.cycle_id, test_runs.is_public/public_fields_json/public_intro,
--          workshop_tables.table_number, workshop_table_members.run_id,
--          defects.reporter_contact. workshop_table_members.table_id boleh kosong (peserta UAT
--          yang belum masuk kelompok). Tugas Developer/Pemantau menjadi Pengguna. Tidak ada
--          data yang dihapus; tampilan publik fase disalin ke UAT-nya dan ke Bug Reporting.
-- SAFE   : setiap perintah memakai IF (NOT) EXISTS / INSERT IGNORE / WHERE ... IS NULL, jadi
--          aman dijalankan ulang bila berhenti di tengah.
-- ROLLBACK (hanya dev):
--   DROP TABLE uat_features;
--   ALTER TABLE test_cases DROP FOREIGN KEY fk_cases_cycle, DROP COLUMN cycle_id;
--   ALTER TABLE test_runs DROP COLUMN public_intro, DROP COLUMN public_fields_json,
--     DROP COLUMN is_public;
--   ALTER TABLE workshop_tables DROP COLUMN table_number;
--   ALTER TABLE workshop_table_members DROP FOREIGN KEY fk_member_run, DROP COLUMN run_id;
--   ALTER TABLE defects DROP COLUMN reporter_contact;
-- ============================================================================

-- 1. Skenario disimpan di dalam satu Fase (seperti file di dalam folder).
ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS cycle_id BIGINT UNSIGNED NULL
    COMMENT 'Fase tempat skenario ini disimpan; kosong = belum masuk fase' AFTER module_id,
  ADD INDEX IF NOT EXISTS ix_cases_cycle_module (project_id, cycle_id, module_id);
ALTER TABLE test_cases
  ADD CONSTRAINT fk_cases_cycle FOREIGN KEY IF NOT EXISTS (cycle_id)
    REFERENCES test_cycles(id) ON DELETE SET NULL;

-- Skenario yang sudah dipakai di lembar uji sebuah fase masuk ke fase itu (yang pertama bila
-- dipakai di beberapa fase).
UPDATE test_cases tc
  JOIN (SELECT rc.test_case_id, MIN(r.cycle_id) AS cycle_id
          FROM test_run_cases rc JOIN test_runs r ON r.id = rc.test_run_id
         WHERE r.cycle_id IS NOT NULL
         GROUP BY rc.test_case_id) x ON x.test_case_id = tc.id
   SET tc.cycle_id = x.cycle_id
 WHERE tc.cycle_id IS NULL;

-- Proyek yang baru punya satu fase: semua skenario tanpa fase masuk ke fase itu.
UPDATE test_cases tc
  JOIN (SELECT project_id, MIN(id) AS cycle_id FROM test_cycles
         GROUP BY project_id HAVING COUNT(*) = 1) one ON one.project_id = tc.project_id
   SET tc.cycle_id = one.cycle_id
 WHERE tc.cycle_id IS NULL;

-- 2. UAT (dulu "lembar uji") punya tampilan publiknya sendiri; salin dari fasenya.
ALTER TABLE test_runs
  ADD COLUMN IF NOT EXISTS is_public TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = UAT ini tampil di halaman depan untuk umum' AFTER status_code,
  ADD COLUMN IF NOT EXISTS public_fields_json LONGTEXT NULL
    COMMENT 'Data UAT yang boleh dilihat umum, mis. ["features.list"]' AFTER is_public,
  ADD COLUMN IF NOT EXISTS public_intro TEXT NULL
    COMMENT 'Pengantar untuk umum (jadwal, tempat)' AFTER public_fields_json;

UPDATE test_runs r JOIN test_cycles c ON c.id = r.cycle_id
   SET r.is_public = c.is_public,
       r.public_fields_json = c.public_fields_json,
       r.public_intro = c.public_intro
 WHERE r.public_fields_json IS NULL
   AND (c.is_public = 1 OR c.public_fields_json IS NOT NULL OR c.public_intro IS NOT NULL);

-- 3. Fitur yang diuji di sebuah UAT, dengan statusnya untuk publik (Dibuka/Selesai/Sembunyi).
CREATE TABLE IF NOT EXISTS uat_features (
  run_id      BIGINT UNSIGNED NOT NULL,
  module_id   BIGINT UNSIGNED NOT NULL,
  state_code  VARCHAR(16)     NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN|DONE|HIDDEN',
  updated_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (run_id, module_id),
  KEY ix_uat_features_module (module_id),
  CONSTRAINT fk_uatfeat_run FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_uatfeat_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO uat_features (run_id, module_id, state_code)
SELECT DISTINCT rc.test_run_id, tc.module_id, COALESCE(wf.state_code, 'OPEN')
  FROM test_run_cases rc
  JOIN test_cases tc ON tc.id = rc.test_case_id
  JOIN test_runs r ON r.id = rc.test_run_id
  LEFT JOIN workshop_features wf ON wf.cycle_id = r.cycle_id AND wf.module_id = tc.module_id
 WHERE tc.module_id IS NOT NULL;

-- 4. Peserta UAT: satu baris per orang per UAT, dengan atau tanpa kelompok (meja).
ALTER TABLE workshop_table_members DROP FOREIGN KEY IF EXISTS fk_table_member_table;
ALTER TABLE workshop_table_members
  ADD COLUMN IF NOT EXISTS run_id BIGINT UNSIGNED NULL
    COMMENT 'UAT tempat orang ini ikut' AFTER id,
  MODIFY table_id BIGINT UNSIGNED NULL COMMENT 'Kelompok (meja); kosong = belum masuk kelompok',
  ADD INDEX IF NOT EXISTS ix_member_run (run_id);
ALTER TABLE workshop_table_members
  ADD CONSTRAINT fk_table_member_table FOREIGN KEY IF NOT EXISTS (table_id)
    REFERENCES workshop_tables(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_member_run FOREIGN KEY IF NOT EXISTS (run_id)
    REFERENCES test_runs(id) ON DELETE CASCADE;

UPDATE workshop_table_members m JOIN workshop_tables t ON t.id = m.table_id
   SET m.run_id = t.run_id
 WHERE m.run_id IS NULL AND t.run_id IS NOT NULL;

-- 5. Kelompok (meja): nomor meja sendiri; nama unik per UAT, bukan per fase.
ALTER TABLE workshop_tables
  ADD COLUMN IF NOT EXISTS table_number SMALLINT UNSIGNED NULL COMMENT 'Nomor meja' AFTER name,
  ADD INDEX IF NOT EXISTS ix_wstable_cycle (cycle_id);
ALTER TABLE workshop_tables DROP INDEX IF EXISTS uq_wstable_name;
ALTER TABLE workshop_tables ADD UNIQUE INDEX IF NOT EXISTS uq_wstable_run_name (run_id, name);

UPDATE workshop_tables
   SET table_number = CAST(REGEXP_SUBSTR(name, '[0-9]{1,3}') AS UNSIGNED)
 WHERE table_number IS NULL AND name REGEXP '[0-9]';

-- 6. Laporan dari publik (Bug Reporting): kontak pelapor, tidak pernah tampil ke publik.
ALTER TABLE defects
  ADD COLUMN IF NOT EXISTS reporter_contact VARCHAR(200) NULL
    COMMENT 'Kontak pelapor publik (email/telepon); hanya untuk Admin';

-- 7. Hanya tiga jenis orang: Super Admin, Admin, Pengguna. Developer/Pemantau menjadi Pengguna.
UPDATE project_members SET role_code = 'TESTER' WHERE role_code IN ('DEVELOPER', 'VIEWER');

-- 8. Pengguna yang sudah mengerjakan atau ditugaskan di sebuah UAT tetap bisa membukanya.
--    Super Admin dan Admin situs mengelola semua UAT, jadi tidak dicatat sebagai peserta.
INSERT INTO workshop_table_members (run_id, table_id, sort_order, display_name, user_id)
SELECT x.run_id, NULL, 0, LEFT(u.display_name, 100), u.id
  FROM (SELECT trc.test_run_id AS run_id, trc.assigned_to AS user_id
          FROM test_run_cases trc WHERE trc.assigned_to IS NOT NULL
        UNION
        SELECT trc.test_run_id, e.tester_id
          FROM test_executions e JOIN test_run_cases trc ON trc.id = e.run_case_id
         WHERE e.tester_id IS NOT NULL) x
  JOIN users u ON u.id = x.user_id AND u.auth_provider = 'LOCAL'
  JOIN test_runs r ON r.id = x.run_id
  JOIN project_members pm
    ON pm.project_id = r.project_id AND pm.user_id = u.id AND pm.role_code = 'TESTER'
 WHERE NOT EXISTS (SELECT 1 FROM workshop_table_members m
                    WHERE m.run_id = x.run_id AND m.user_id = u.id)
   AND NOT EXISTS (SELECT 1 FROM user_system_roles s WHERE s.user_id = u.id);

-- 9. Bug Reporting publik per proyek: dari fase publik yang menampilkan daftar masalah.
INSERT IGNORE INTO project_settings (project_id, setting_key, value_json)
SELECT c.project_id, 'bugs.public', 'true'
  FROM test_cycles c
 WHERE c.is_public = 1 AND c.public_fields_json LIKE '%"bugs.list"%'
 GROUP BY c.project_id;
INSERT IGNORE INTO project_settings (project_id, setting_key, value_json)
SELECT c.project_id, 'bugs.public_fields', MIN(c.public_fields_json)
  FROM test_cycles c
 WHERE c.is_public = 1 AND c.public_fields_json LIKE '%"bugs.list"%'
 GROUP BY c.project_id;
