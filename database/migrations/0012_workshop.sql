-- ============================================================================
-- 0012 - Mode Workshop: fase publik, meja (kelompok) dengan kartu QR, +1 masalah (ADR 0016)
-- STATUS : Diminta pemilik proyek (22 Nov 2026): UAT dikerjakan berkelompok per meja di forum
--          workshop; fase bisa ditampilkan ke publik dengan tombol per data.
-- IMPACT : 3 kolom baru di test_cycles (bawaan: tidak publik, tidak ada data yang tampil),
--          3 kolom NULL di defects, 4 tabel baru. Tidak mengubah atau menghapus data lama.
-- ROLLBACK (hanya dev):
--   DROP TABLE defect_confirmations, workshop_table_modules, workshop_tables, workshop_features;
--   ALTER TABLE defects DROP FOREIGN KEY fk_defects_duplicate_of,
--     DROP FOREIGN KEY fk_defects_reviewed_by,
--     DROP COLUMN duplicate_of_id, DROP COLUMN reviewed_by, DROP COLUMN reviewed_at;
--   ALTER TABLE test_cycles DROP COLUMN public_intro, DROP COLUMN public_fields_json,
--     DROP COLUMN is_public;
-- ============================================================================

-- Fase publik: satu tombol utama + daftar data yang boleh tampil (JSON array kunci, bawaan kosong).
ALTER TABLE test_cycles
  ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0
    COMMENT '1 = tampil di halaman depan untuk umum' AFTER status_code,
  ADD COLUMN public_fields_json LONGTEXT NULL
    COMMENT 'Data yang boleh dilihat umum, mis. ["features.list","bugs.list"]' AFTER is_public,
  ADD COLUMN public_intro TEXT NULL
    COMMENT 'Pengantar untuk umum (mis. jadwal dan tempat workshop)' AFTER public_fields_json;

-- Fitur yang dikerjakan di sebuah fase: Dibuka / Selesai / Disembunyikan (baris tidak ada = Dibuka).
CREATE TABLE IF NOT EXISTS workshop_features (
  cycle_id    BIGINT UNSIGNED NOT NULL,
  module_id   BIGINT UNSIGNED NOT NULL,
  state_code  VARCHAR(16)     NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN|DONE|HIDDEN',
  updated_at  DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (cycle_id, module_id),
  CONSTRAINT fk_wsfeat_cycle FOREIGN KEY (cycle_id) REFERENCES test_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_wsfeat_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Meja (kelompok). Setiap meja punya akun sendiri (users.auth_provider = 'WORKSHOP', tanpa
-- kata sandi) yang hanya bisa masuk lewat kode meja dan hanya memakai halaman Mode Mudah.
CREATE TABLE IF NOT EXISTS workshop_tables (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id         BIGINT UNSIGNED NOT NULL,
  cycle_id           BIGINT UNSIGNED NOT NULL,
  run_id             BIGINT UNSIGNED NULL COMMENT 'Lembar uji (run) yang dikerjakan meja ini',
  user_id            BIGINT UNSIGNED NOT NULL COMMENT 'Akun meja (WORKSHOP)',
  name               VARCHAR(120)    NOT NULL COMMENT 'mis. Meja 1',
  member_names_json  LONGTEXT        NULL COMMENT 'Nama anggota (teks, bukan akun)',
  access_code        CHAR(6)         NOT NULL COMMENT 'Kode 6 angka yang dicetak di kartu meja',
  valid_from         DATETIME(3)     NULL COMMENT 'UTC; kosong = sejak dibuat',
  valid_until        DATETIME(3)     NOT NULL COMMENT 'UTC; setelah ini kartu tidak berlaku',
  revoked_at         DATETIME(3)     NULL,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_wstable_code (access_code),
  UNIQUE KEY uq_wstable_user (user_id),
  UNIQUE KEY uq_wstable_name (cycle_id, name),
  KEY ix_wstable_project (project_id),
  CONSTRAINT fk_wstable_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_wstable_cycle FOREIGN KEY (cycle_id) REFERENCES test_cycles(id) ON DELETE CASCADE,
  CONSTRAINT fk_wstable_run FOREIGN KEY (run_id) REFERENCES test_runs(id) ON DELETE SET NULL,
  CONSTRAINT fk_wstable_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_wstable_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fitur (modul) yang ditugaskan ke sebuah meja.
CREATE TABLE IF NOT EXISTS workshop_table_modules (
  table_id   BIGINT UNSIGNED NOT NULL,
  module_id  BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (table_id, module_id),
  CONSTRAINT fk_wstm_table FOREIGN KEY (table_id) REFERENCES workshop_tables(id) ON DELETE CASCADE,
  CONSTRAINT fk_wstm_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- "Saya juga mengalami" (+1) pada masalah yang sudah dilaporkan, supaya tidak jadi bug dobel.
CREATE TABLE IF NOT EXISTS defect_confirmations (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  defect_id    BIGINT UNSIGNED NOT NULL,
  user_id      BIGINT UNSIGNED NULL COMMENT 'Akun orang atau akun meja',
  tester_name  VARCHAR(200)    NULL COMMENT 'Nama anggota meja (teks)',
  note         TEXT            NULL,
  created_at   DATETIME(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_confirmation (defect_id, user_id),
  CONSTRAINT fk_confirm_defect FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE,
  CONSTRAINT fk_confirm_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Masalah dari meja masuk ke "Masalah masuk" sampai ditinjau fasilitator; duplikat ditautkan.
ALTER TABLE defects
  ADD COLUMN reviewed_at DATETIME(3) NULL COMMENT 'Sudah ditinjau fasilitator (Mode Workshop)',
  ADD COLUMN reviewed_by BIGINT UNSIGNED NULL,
  ADD COLUMN duplicate_of_id BIGINT UNSIGNED NULL COMMENT 'Ditutup karena sama dengan bug ini',
  ADD CONSTRAINT fk_defects_reviewed_by FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_defects_duplicate_of FOREIGN KEY (duplicate_of_id) REFERENCES defects(id) ON DELETE SET NULL;
