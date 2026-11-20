-- ============================================================================
-- TESTBOARD PASKER ID - MYSQL 8.0+ SCHEMA
-- Prepared from the 3 provided Karirhub UAT workbooks (November 2026).
-- VERSION: 1.0 | ENCODING: UTF-8
-- Run as a SQL script in DBeaver against the EXISTING `testboard` database.
-- Only run on your dedicated TestBoard database, not another application's DB.
-- The database must already exist. This script does NOT create or drop a database.
-- This schema creates tables and a view; it does NOT create MySQL accounts.
-- No screenshots, videos, PDFs or other binary file contents are stored in MySQL.
-- Uploaded files are stored in private object/file storage after processing.
-- ============================================================================

USE `testboard`;

-- 1. AUTHENTICATION AND PROJECT ACCESS ----------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  display_name      VARCHAR(200) NOT NULL,
  email             VARCHAR(254) NOT NULL,
  password_hash     VARCHAR(255) NULL COMMENT 'Never store a plaintext password',
  auth_provider     VARCHAR(40) NOT NULL DEFAULT 'LOCAL',
  auth_subject      VARCHAR(191) NULL,
  preferred_locale  VARCHAR(5) NOT NULL DEFAULT 'id' COMMENT 'id or en',
  is_active         TINYINT(1) NOT NULL DEFAULT 1,
  created_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_auth (auth_provider, auth_subject)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS projects (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_code    VARCHAR(40) NOT NULL COMMENT 'e.g. KARIRHUB',
  name            VARCHAR(200) NOT NULL,
  description     TEXT NULL,
  is_archived     TINYINT(1) NOT NULL DEFAULT 0,
  created_by      BIGINT UNSIGNED NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_projects_code (project_code),
  CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS project_members (
  project_id      BIGINT UNSIGNED NOT NULL,
  user_id         BIGINT UNSIGNED NOT NULL,
  role_code       VARCHAR(32) NOT NULL COMMENT 'ADMIN|QA_LEAD|TESTER|DEVELOPER|VIEWER',
  joined_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, user_id),
  KEY ix_members_user (user_id),
  CONSTRAINT fk_members_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS modules (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id      BIGINT UNSIGNED NOT NULL,
  module_code     VARCHAR(40) NOT NULL COMMENT 'e.g. PKI, VLN, GW, CDC',
  name            VARCHAR(200) NOT NULL,
  description     TEXT NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_module_code (project_id, module_code),
  CONSTRAINT fk_modules_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. TEST-CASE LIBRARY ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS test_cycles (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id      BIGINT UNSIGNED NOT NULL,
  cycle_code      VARCHAR(60) NOT NULL COMMENT 'PHASE-1-2026, PHASE-2-2026',
  title           VARCHAR(200) NOT NULL,
  description     TEXT NULL,
  starts_on       DATE NULL,
  ends_on         DATE NULL,
  status_code     VARCHAR(20) NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED|ACTIVE|COMPLETED',
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_cycle_code (project_id, cycle_code),
  CONSTRAINT fk_cycles_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS test_suites (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id         BIGINT UNSIGNED NOT NULL,
  module_id          BIGINT UNSIGNED NULL,
  name               VARCHAR(255) NOT NULL,
  description        TEXT NULL,
  reference_document VARCHAR(500) NULL COMMENT 'e.g. FSD document title',
  reference_url      VARCHAR(1000) NULL,
  reference_version  VARCHAR(100) NULL,
  owner_unit         VARCHAR(255) NULL,
  scope_description  TEXT NULL,
  preparation_date   DATE NULL,
  source_notes       TEXT NULL,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_suites_project_module (project_id, module_id),
  CONSTRAINT fk_suites_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_suites_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL,
  CONSTRAINT fk_suites_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS test_cases (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id          BIGINT UNSIGNED NOT NULL,
  module_id           BIGINT UNSIGNED NULL,
  suite_id            BIGINT UNSIGNED NULL,
  case_code           VARCHAR(100) NOT NULL COMMENT 'e.g. UAT-PKI-001',
  sequence_number     INT UNSIGNED NULL COMMENT 'No. in the source spreadsheet',
  category            VARCHAR(255) NULL,
  title               TEXT NOT NULL COMMENT 'Fitur/Proses',
  requirement_refs    TEXT NULL COMMENT 'BRD/FSD references; optional',
  priority_code       VARCHAR(32) NOT NULL DEFAULT 'MUST_HAVE' COMMENT 'MUST_HAVE|SHOULD_HAVE|COULD_HAVE|WONT_HAVE',
  test_type_code      VARCHAR(40) NOT NULL DEFAULT 'POSITIVE' COMMENT 'POSITIVE|NEGATIVE|RBAC|SLA|UI_UX|INTEGRATION|OTHER',
  actor_label         VARCHAR(500) NULL COMMENT 'Aktor / role being tested',
  preconditions       MEDIUMTEXT NULL,
  test_steps_text     MEDIUMTEXT NULL COMMENT 'Preserve original numbered Excel steps',
  expected_result     MEDIUMTEXT NULL,
  source_locale       VARCHAR(5) NOT NULL DEFAULT 'id' COMMENT 'id or en',
  case_status         VARCHAR(24) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT|READY|ARCHIVED',
  source_kind         VARCHAR(24) NOT NULL DEFAULT 'MANUAL' COMMENT 'MANUAL|LEGACY_IMPORT|AI_IMPORT',
  current_version     INT UNSIGNED NOT NULL DEFAULT 1,
  created_by          BIGINT UNSIGNED NULL,
  updated_by          BIGINT UNSIGNED NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at          DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_test_case_code (project_id, case_code),
  KEY ix_cases_module_status (module_id, case_status),
  KEY ix_cases_suite (suite_id),
  KEY ix_cases_priority (priority_code),
  CONSTRAINT fk_cases_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_cases_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL,
  CONSTRAINT fk_cases_suite FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE SET NULL,
  CONSTRAINT fk_cases_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_cases_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS test_case_translations (
  test_case_id       BIGINT UNSIGNED NOT NULL,
  locale             VARCHAR(5) NOT NULL COMMENT 'id|en',
  title              TEXT NULL,
  preconditions      MEDIUMTEXT NULL,
  test_steps_text    MEDIUMTEXT NULL,
  expected_result    MEDIUMTEXT NULL,
  translated_by      BIGINT UNSIGNED NULL,
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (test_case_id, locale),
  CONSTRAINT fk_translation_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_translation_user FOREIGN KEY (translated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS test_case_steps (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_case_id      BIGINT UNSIGNED NOT NULL,
  step_number       INT UNSIGNED NOT NULL,
  instruction       MEDIUMTEXT NOT NULL,
  expected_result   MEDIUMTEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_case_step_no (test_case_id, step_number),
  CONSTRAINT fk_steps_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS test_case_revisions (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_case_id      BIGINT UNSIGNED NOT NULL,
  revision_number   INT UNSIGNED NOT NULL,
  snapshot_json     JSON NOT NULL COMMENT 'Immutable pre/post-change case data',
  changed_by        BIGINT UNSIGNED NULL,
  change_reason     VARCHAR(500) NULL,
  changed_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_case_revision (test_case_id, revision_number),
  CONSTRAINT fk_revisions_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_revisions_actor FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. UAT SESSIONS, EXECUTION AND RETEST ----------------------------------------
CREATE TABLE IF NOT EXISTS test_runs (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id       BIGINT UNSIGNED NOT NULL,
  cycle_id         BIGINT UNSIGNED NULL,
  run_code         VARCHAR(80) NOT NULL COMMENT 'e.g. RUN-PH1-20260730',
  name             VARCHAR(255) NOT NULL,
  environment_name VARCHAR(100) NULL COMMENT 'STAGING|UAT|PRODUCTION-MIRROR',
  build_version    VARCHAR(100) NULL,
  environment_url  VARCHAR(1000) NULL COMMENT 'Non-secret URL only',
  status_code      VARCHAR(24) NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED|ACTIVE|COMPLETED|LOCKED',
  starts_at        DATETIME(3) NULL,
  ends_at          DATETIME(3) NULL,
  created_by       BIGINT UNSIGNED NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_run_code (project_id, run_code),
  KEY ix_runs_cycle (cycle_id),
  CONSTRAINT fk_runs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_runs_cycle FOREIGN KEY (cycle_id) REFERENCES test_cycles(id) ON DELETE SET NULL,
  CONSTRAINT fk_runs_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS test_run_cases (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_run_id       BIGINT UNSIGNED NOT NULL,
  test_case_id      BIGINT UNSIGNED NOT NULL,
  assigned_to       BIGINT UNSIGNED NULL,
  case_version      INT UNSIGNED NOT NULL DEFAULT 1,
  case_snapshot_json JSON NULL COMMENT 'Freeze case definition when a run begins',
  sort_order        INT UNSIGNED NOT NULL DEFAULT 0,
  added_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_run_case (test_run_id, test_case_id),
  KEY ix_run_cases_assignee (assigned_to),
  CONSTRAINT fk_run_cases_run FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE,
  CONSTRAINT fk_run_cases_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE RESTRICT,
  CONSTRAINT fk_run_cases_assignee FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS test_executions (
  id               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  run_case_id      BIGINT UNSIGNED NOT NULL,
  attempt_number   INT UNSIGNED NOT NULL COMMENT '1=initial; 2+=retest/re-execution',
  execution_kind   VARCHAR(24) NOT NULL DEFAULT 'INITIAL' COMMENT 'INITIAL|RETEST|RERUN',
  result_status    VARCHAR(24) NOT NULL DEFAULT 'NOT_RUN' COMMENT 'NOT_RUN|IN_PROGRESS|PASSED|FAILED|BLOCKED|SKIPPED',
  actual_result    MEDIUMTEXT NULL COMMENT 'Detail Hasil Aktual',
  notes            MEDIUMTEXT NULL COMMENT 'Catatan',
  tester_id        BIGINT UNSIGNED NULL,
  legacy_tester_name VARCHAR(255) NULL COMMENT 'Historic Excel tester name not in users',
  tested_at        DATETIME(3) NULL,
  browser_name     VARCHAR(100) NULL,
  device_name      VARCHAR(100) NULL,
  operating_system VARCHAR(100) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_execution_attempt (run_case_id, attempt_number),
  KEY ix_exec_tester_date (tester_id, tested_at),
  KEY ix_exec_status (result_status),
  CONSTRAINT fk_executions_run_case FOREIGN KEY (run_case_id) REFERENCES test_run_cases(id) ON DELETE RESTRICT,
  CONSTRAINT fk_executions_tester FOREIGN KEY (tester_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS test_execution_steps (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  execution_id      BIGINT UNSIGNED NOT NULL,
  test_case_step_id BIGINT UNSIGNED NOT NULL,
  result_status     VARCHAR(24) NOT NULL DEFAULT 'NOT_RUN',
  actual_result     TEXT NULL,
  notes             TEXT NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_execution_step (execution_id, test_case_step_id),
  CONSTRAINT fk_exec_steps_execution FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE CASCADE,
  CONSTRAINT fk_exec_steps_definition FOREIGN KEY (test_case_step_id) REFERENCES test_case_steps(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. BUG TRACKER (BUGS CAN EXIST WITH OR WITHOUT A TEST CASE) -------------------
CREATE TABLE IF NOT EXISTS defects (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id         BIGINT UNSIGNED NOT NULL,
  module_id          BIGINT UNSIGNED NULL,
  bug_code           VARCHAR(100) NOT NULL COMMENT 'e.g. BUG-KAR-0001',
  title              VARCHAR(500) NOT NULL,
  description        MEDIUMTEXT NULL,
  steps_to_reproduce MEDIUMTEXT NULL,
  expected_behavior  MEDIUMTEXT NULL,
  actual_behavior    MEDIUMTEXT NULL,
  severity_code      VARCHAR(24) NOT NULL DEFAULT 'MEDIUM' COMMENT 'CRITICAL|HIGH|MEDIUM|LOW|INFO',
  priority_code      VARCHAR(24) NOT NULL DEFAULT 'MEDIUM' COMMENT 'URGENT|HIGH|MEDIUM|LOW',
  status_code        VARCHAR(32) NOT NULL DEFAULT 'OPEN' COMMENT 'OPEN|IN_PROGRESS|FIXED|READY_FOR_RETEST|VERIFIED|REOPENED|CLOSED|WONT_FIX',
  source_kind        VARCHAR(24) NOT NULL DEFAULT 'UAT' COMMENT 'UAT|USER_REPORT|OTHER',
  environment_name   VARCHAR(100) NULL,
  build_version      VARCHAR(100) NULL,
  browser_name       VARCHAR(100) NULL,
  reported_by        BIGINT UNSIGNED NULL,
  assigned_to        BIGINT UNSIGNED NULL,
  fixed_in_version   VARCHAR(100) NULL,
  resolved_at        DATETIME(3) NULL,
  closed_at          DATETIME(3) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_defect_code (project_id, bug_code),
  KEY ix_defects_status_severity (project_id, status_code, severity_code),
  KEY ix_defects_assigned (assigned_to, status_code),
  CONSTRAINT fk_defects_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_defects_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL,
  CONSTRAINT fk_defects_reporter FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT fk_defects_assignee FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS defect_execution_links (
  defect_id         BIGINT UNSIGNED NOT NULL,
  execution_id      BIGINT UNSIGNED NOT NULL,
  linked_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (defect_id, execution_id),
  KEY ix_defect_link_execution (execution_id),
  CONSTRAINT fk_defect_link_defect FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE,
  CONSTRAINT fk_defect_link_execution FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS defect_comments (
  id            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  defect_id     BIGINT UNSIGNED NOT NULL,
  author_id     BIGINT UNSIGNED NULL,
  body          MEDIUMTEXT NOT NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_defect_comments_date (defect_id, created_at),
  CONSTRAINT fk_comments_defect FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS defect_status_history (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  defect_id       BIGINT UNSIGNED NOT NULL,
  from_status     VARCHAR(32) NULL,
  to_status       VARCHAR(32) NOT NULL,
  changed_by      BIGINT UNSIGNED NULL,
  change_comment  VARCHAR(1000) NULL,
  changed_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_defect_history (defect_id, changed_at),
  CONSTRAINT fk_defect_hist_defect FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE,
  CONSTRAINT fk_defect_hist_actor FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. PRIVATE FILE METADATA, NOT FILE BINARY ------------------------------------
CREATE TABLE IF NOT EXISTS file_objects (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id          BIGINT UNSIGNED NOT NULL,
  storage_backend     VARCHAR(24) NOT NULL DEFAULT 'S3' COMMENT 'S3|MINIO|PRIVATE_LOCAL',
  bucket_name         VARCHAR(128) NOT NULL,
  object_key          VARCHAR(255) NOT NULL COMMENT 'Private random key, not a public URL',
  original_filename   VARCHAR(500) NOT NULL,
  original_mime       VARCHAR(128) NOT NULL,
  stored_mime         VARCHAR(128) NOT NULL,
  evidence_type       VARCHAR(24) NOT NULL DEFAULT 'OTHER' COMMENT 'SCREENSHOT|VIDEO|LOG|DOCUMENT|OTHER',
  original_size_bytes BIGINT UNSIGNED NOT NULL,
  stored_size_bytes   BIGINT UNSIGNED NULL,
  original_sha256     CHAR(64) NULL COMMENT 'Hash of bytes received before transformation',
  stored_sha256       CHAR(64) NULL COMMENT 'Hash of final stored bytes',
  compression_method  VARCHAR(100) NULL COMMENT 'e.g. WEBP_LOSSLESS, PNG_OPTIMIZE, H264, GZIP',
  processing_status   VARCHAR(24) NOT NULL DEFAULT 'PROCESSING' COMMENT 'PROCESSING|READY|FAILED|REJECTED',
  scan_status         VARCHAR(24) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING|CLEAN|INFECTED|ERROR',
  compression_note    VARCHAR(500) NULL COMMENT 'e.g. already compressed; no reduction possible',
  width_px            INT UNSIGNED NULL,
  height_px           INT UNSIGNED NULL,
  duration_seconds    DECIMAL(12,3) NULL,
  thumbnail_object_key VARCHAR(255) NULL,
  uploaded_by         BIGINT UNSIGNED NULL,
  uploaded_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  processed_at        DATETIME(3) NULL,
  deleted_at          DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_file_storage_key (bucket_name, object_key),
  KEY ix_file_project_status (project_id, processing_status),
  CONSTRAINT fk_file_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_file_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS execution_files (
  id             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  execution_id   BIGINT UNSIGNED NOT NULL,
  file_object_id BIGINT UNSIGNED NOT NULL,
  caption        VARCHAR(500) NULL,
  step_number    INT UNSIGNED NULL COMMENT 'Optional link to a numbered test step',
  sort_order     INT UNSIGNED NOT NULL DEFAULT 0,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_execution_file (execution_id, file_object_id),
  CONSTRAINT fk_exec_file_execution FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE CASCADE,
  CONSTRAINT fk_exec_file_object FOREIGN KEY (file_object_id) REFERENCES file_objects(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS defect_files (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  defect_id       BIGINT UNSIGNED NOT NULL,
  file_object_id  BIGINT UNSIGNED NOT NULL,
  caption         VARCHAR(500) NULL,
  sort_order      INT UNSIGNED NOT NULL DEFAULT 0,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_defect_file (defect_id, file_object_id),
  CONSTRAINT fk_bug_file_bug FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE,
  CONSTRAINT fk_bug_file_object FOREIGN KEY (file_object_id) REFERENCES file_objects(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS test_case_files (
  id              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  test_case_id    BIGINT UNSIGNED NOT NULL,
  file_object_id  BIGINT UNSIGNED NOT NULL,
  caption         VARCHAR(500) NULL,
  created_at      DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_case_file (test_case_id, file_object_id),
  CONSTRAINT fk_case_file_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE,
  CONSTRAINT fk_case_file_object FOREIGN KEY (file_object_id) REFERENCES file_objects(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. XLSX / CSV / JSON IMPORTS, INCLUDING AI-GENERATED TEST CASES --------------
CREATE TABLE IF NOT EXISTS import_jobs (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id         BIGINT UNSIGNED NOT NULL,
  source_file_id     BIGINT UNSIGNED NULL COMMENT 'Can refer to processed uploaded .xlsx/.csv/.json',
  original_filename  VARCHAR(500) NOT NULL,
  source_format      VARCHAR(16) NOT NULL COMMENT 'XLSX|CSV|JSON',
  source_kind        VARCHAR(24) NOT NULL DEFAULT 'LEGACY' COMMENT 'LEGACY|AI|MANUAL',
  import_mode        VARCHAR(24) NOT NULL DEFAULT 'CREATE_ONLY' COMMENT 'CREATE_ONLY|UPDATE|NEW_REVISION',
  status_code        VARCHAR(32) NOT NULL DEFAULT 'UPLOADED' COMMENT 'UPLOADED|VALIDATING|PREVIEW|IMPORTING|COMPLETED|PARTIAL|FAILED',
  selected_sheets_json JSON NULL,
  column_mapping_json JSON NULL,
  total_rows         INT UNSIGNED NOT NULL DEFAULT 0,
  valid_rows         INT UNSIGNED NOT NULL DEFAULT 0,
  imported_rows      INT UNSIGNED NOT NULL DEFAULT 0,
  skipped_rows       INT UNSIGNED NOT NULL DEFAULT 0,
  invalid_rows       INT UNSIGNED NOT NULL DEFAULT 0,
  error_summary      TEXT NULL,
  created_by         BIGINT UNSIGNED NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  completed_at       DATETIME(3) NULL,
  PRIMARY KEY (id),
  KEY ix_import_jobs_project_status (project_id, status_code),
  CONSTRAINT fk_import_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_import_file FOREIGN KEY (source_file_id) REFERENCES file_objects(id) ON DELETE SET NULL,
  CONSTRAINT fk_import_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS import_job_rows (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  import_job_id       BIGINT UNSIGNED NOT NULL,
  sheet_name          VARCHAR(255) NULL,
  source_row_number   INT UNSIGNED NULL,
  external_case_code  VARCHAR(100) NULL,
  source_hash         CHAR(64) NULL COMMENT 'Use for re-import deduplication',
  raw_payload_json    JSON NULL,
  mapped_payload_json JSON NULL,
  status_code         VARCHAR(24) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING|VALID|ERROR|DUPLICATE|IMPORTED|SKIPPED',
  validation_errors_json JSON NULL,
  target_test_case_id BIGINT UNSIGNED NULL,
  created_at          DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_import_rows_job_status (import_job_id, status_code),
  KEY ix_import_rows_case (target_test_case_id),
  CONSTRAINT fk_import_row_job FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE,
  CONSTRAINT fk_import_row_case FOREIGN KEY (target_test_case_id) REFERENCES test_cases(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS import_job_row_files (
  id                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  import_job_row_id BIGINT UNSIGNED NOT NULL,
  file_object_id    BIGINT UNSIGNED NOT NULL,
  source_anchor     VARCHAR(100) NULL COMMENT 'Original sheet coordinate such as E3',
  PRIMARY KEY (id),
  UNIQUE KEY uq_import_row_file (import_job_row_id, file_object_id),
  CONSTRAINT fk_import_image_row FOREIGN KEY (import_job_row_id) REFERENCES import_job_rows(id) ON DELETE CASCADE,
  CONSTRAINT fk_import_image_file FOREIGN KEY (file_object_id) REFERENCES file_objects(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. CONFIGURATION AND AUDIT TRAIL ---------------------------------------------
CREATE TABLE IF NOT EXISTS project_settings (
  project_id        BIGINT UNSIGNED NOT NULL,
  setting_key       VARCHAR(120) NOT NULL COMMENT 'e.g. upload.max_video_mb',
  value_json        JSON NOT NULL,
  updated_by        BIGINT UNSIGNED NULL,
  updated_at        DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, setting_key),
  CONSTRAINT fk_settings_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_settings_actor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_logs (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  project_id         BIGINT UNSIGNED NULL,
  actor_id           BIGINT UNSIGNED NULL,
  entity_type        VARCHAR(100) NOT NULL COMMENT 'test_case|test_execution|defect|file_object|import_job',
  entity_id          BIGINT UNSIGNED NOT NULL,
  action_code        VARCHAR(100) NOT NULL COMMENT 'CREATE|UPDATE|DELETE|STATUS_CHANGE|IMPORT|DOWNLOAD',
  old_values_json    JSON NULL,
  new_values_json    JSON NULL,
  request_id         VARCHAR(100) NULL,
  client_ip          VARCHAR(45) NULL,
  created_at         DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ix_audit_entity (entity_type, entity_id, created_at),
  KEY ix_audit_project_date (project_id, created_at),
  CONSTRAINT fk_audit_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. SIMPLE VIEW: LATEST STATUS FOR EACH CASE IN EACH RUN -----------------------
CREATE OR REPLACE VIEW v_run_case_latest_status AS
SELECT
  trc.id AS run_case_id,
  trc.test_run_id,
  trc.test_case_id,
  COALESCE(te.result_status, 'NOT_RUN') AS latest_status,
  te.id AS last_execution_id,
  te.attempt_number AS last_attempt_number,
  te.tested_at AS last_tested_at
FROM test_run_cases AS trc
LEFT JOIN (
  SELECT run_case_id, MAX(attempt_number) AS max_attempt
  FROM test_executions
  GROUP BY run_case_id
) AS attempts ON attempts.run_case_id = trc.id
LEFT JOIN test_executions AS te
  ON te.run_case_id = trc.id AND te.attempt_number = attempts.max_attempt;

-- QUICK CHECK AFTER EXECUTING SCRIPT:
-- SHOW TABLES;
-- SELECT COUNT(*) AS number_of_tables FROM information_schema.tables
-- WHERE table_schema='testboard' AND table_type='BASE TABLE';
-- SELECT * FROM v_run_case_latest_status LIMIT 5;
