# Baseline SQL Data Dictionary (Generated)

> Generated from the exact SQL file provided; table definitions are **reference**, not migrations.

**Total tables parsed:** 27.

## `users`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `display_name` | `VARCHAR(200)` | NOT NULL |  |
| `email` | `VARCHAR(254)` | NOT NULL |  |
| `password_hash` | `VARCHAR(255)` | NULL/unspecified | COMMENT Never store a plaintext password |
| `auth_provider` | `VARCHAR(40)` | NOT NULL | DEFAULT 'LOCAL' |
| `auth_subject` | `VARCHAR(191)` | NULL/unspecified |  |
| `preferred_locale` | `VARCHAR(5)` | NOT NULL | DEFAULT 'id'; COMMENT id or en |
| `is_active` | `TINYINT(1)` | NOT NULL | DEFAULT 1 |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |
| `updated_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_users_email (email)`
- `UNIQUE KEY uq_users_auth (auth_provider, auth_subject)`

## `projects`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `project_code` | `VARCHAR(40)` | NOT NULL | COMMENT e.g. KARIRHUB |
| `name` | `VARCHAR(200)` | NOT NULL |  |
| `description` | `TEXT` | NULL/unspecified |  |
| `is_archived` | `TINYINT(1)` | NOT NULL | DEFAULT 0 |
| `created_by` | `BIGINT` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |
| `updated_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_projects_code (project_code)`
- `CONSTRAINT fk_projects_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`

## `project_members`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `project_id` | `BIGINT` | NOT NULL |  |
| `user_id` | `BIGINT` | NOT NULL |  |
| `role_code` | `VARCHAR(32)` | NOT NULL | COMMENT ADMIN/QA_LEAD/TESTER/DEVELOPER/VIEWER |
| `joined_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (project_id, user_id)`
- `KEY ix_members_user (user_id)`
- `CONSTRAINT fk_members_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_members_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE`

## `modules`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `project_id` | `BIGINT` | NOT NULL |  |
| `module_code` | `VARCHAR(40)` | NOT NULL | COMMENT e.g. PKI, VLN, GW, CDC |
| `name` | `VARCHAR(200)` | NOT NULL |  |
| `description` | `TEXT` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_module_code (project_id, module_code)`
- `CONSTRAINT fk_modules_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`

## `test_cycles`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `project_id` | `BIGINT` | NOT NULL |  |
| `cycle_code` | `VARCHAR(60)` | NOT NULL | COMMENT PHASE-1-2026, PHASE-2-2026 |
| `title` | `VARCHAR(200)` | NOT NULL |  |
| `description` | `TEXT` | NULL/unspecified |  |
| `starts_on` | `DATE` | NULL/unspecified |  |
| `ends_on` | `DATE` | NULL/unspecified |  |
| `status_code` | `VARCHAR(20)` | NOT NULL | DEFAULT 'PLANNED'; COMMENT PLANNED/ACTIVE/COMPLETED |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_cycle_code (project_id, cycle_code)`
- `CONSTRAINT fk_cycles_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`

## `test_suites`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `project_id` | `BIGINT` | NOT NULL |  |
| `module_id` | `BIGINT` | NULL/unspecified |  |
| `name` | `VARCHAR(255)` | NOT NULL |  |
| `description` | `TEXT` | NULL/unspecified |  |
| `reference_document` | `VARCHAR(500)` | NULL/unspecified | COMMENT e.g. FSD document title |
| `reference_url` | `VARCHAR(1000)` | NULL/unspecified |  |
| `reference_version` | `VARCHAR(100)` | NULL/unspecified |  |
| `owner_unit` | `VARCHAR(255)` | NULL/unspecified |  |
| `scope_description` | `TEXT` | NULL/unspecified |  |
| `preparation_date` | `DATE` | NULL/unspecified |  |
| `source_notes` | `TEXT` | NULL/unspecified |  |
| `created_by` | `BIGINT` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `KEY ix_suites_project_module (project_id, module_id)`
- `CONSTRAINT fk_suites_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_suites_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL`
- `CONSTRAINT fk_suites_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`

## `test_cases`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `project_id` | `BIGINT` | NOT NULL |  |
| `module_id` | `BIGINT` | NULL/unspecified |  |
| `suite_id` | `BIGINT` | NULL/unspecified |  |
| `case_code` | `VARCHAR(100)` | NOT NULL | COMMENT e.g. UAT-PKI-001 |
| `sequence_number` | `INT` | NULL/unspecified | COMMENT No. in the source spreadsheet |
| `category` | `VARCHAR(255)` | NULL/unspecified |  |
| `title` | `TEXT` | NOT NULL | COMMENT Fitur/Proses |
| `requirement_refs` | `TEXT` | NULL/unspecified | COMMENT BRD/FSD references; optional |
| `priority_code` | `VARCHAR(32)` | NOT NULL | DEFAULT 'MUST_HAVE'; COMMENT MUST_HAVE/SHOULD_HAVE/COULD_HAVE/WONT_HAVE |
| `test_type_code` | `VARCHAR(40)` | NOT NULL | DEFAULT 'POSITIVE'; COMMENT POSITIVE/NEGATIVE/RBAC/SLA/UI_UX/INTEGRATION/OTHER |
| `actor_label` | `VARCHAR(500)` | NULL/unspecified | COMMENT Aktor / role being tested |
| `preconditions` | `MEDIUMTEXT` | NULL/unspecified |  |
| `test_steps_text` | `MEDIUMTEXT` | NULL/unspecified | COMMENT Preserve original numbered Excel steps |
| `expected_result` | `MEDIUMTEXT` | NULL/unspecified |  |
| `source_locale` | `VARCHAR(5)` | NOT NULL | DEFAULT 'id'; COMMENT id or en |
| `case_status` | `VARCHAR(24)` | NOT NULL | DEFAULT 'DRAFT'; COMMENT DRAFT/READY/ARCHIVED |
| `source_kind` | `VARCHAR(24)` | NOT NULL | DEFAULT 'MANUAL'; COMMENT MANUAL/LEGACY_IMPORT/AI_IMPORT |
| `current_version` | `INT` | NOT NULL | DEFAULT 1 |
| `created_by` | `BIGINT` | NULL/unspecified |  |
| `updated_by` | `BIGINT` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |
| `updated_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) |
| `deleted_at` | `DATETIME(3)` | NULL/unspecified |  |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_test_case_code (project_id, case_code)`
- `KEY ix_cases_module_status (module_id, case_status)`
- `KEY ix_cases_suite (suite_id)`
- `KEY ix_cases_priority (priority_code)`
- `CONSTRAINT fk_cases_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_cases_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL`
- `CONSTRAINT fk_cases_suite FOREIGN KEY (suite_id) REFERENCES test_suites(id) ON DELETE SET NULL`
- `CONSTRAINT fk_cases_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`
- `CONSTRAINT fk_cases_updater FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL`

## `test_case_translations`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `test_case_id` | `BIGINT` | NOT NULL |  |
| `locale` | `VARCHAR(5)` | NOT NULL | COMMENT id/en |
| `title` | `TEXT` | NULL/unspecified |  |
| `preconditions` | `MEDIUMTEXT` | NULL/unspecified |  |
| `test_steps_text` | `MEDIUMTEXT` | NULL/unspecified |  |
| `expected_result` | `MEDIUMTEXT` | NULL/unspecified |  |
| `translated_by` | `BIGINT` | NULL/unspecified |  |
| `updated_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (test_case_id, locale)`
- `CONSTRAINT fk_translation_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE`
- `CONSTRAINT fk_translation_user FOREIGN KEY (translated_by) REFERENCES users(id) ON DELETE SET NULL`

## `test_case_steps`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `test_case_id` | `BIGINT` | NOT NULL |  |
| `step_number` | `INT` | NOT NULL |  |
| `instruction` | `MEDIUMTEXT` | NOT NULL |  |
| `expected_result` | `MEDIUMTEXT` | NULL/unspecified |  |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_case_step_no (test_case_id, step_number)`
- `CONSTRAINT fk_steps_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE`

## `test_case_revisions`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `test_case_id` | `BIGINT` | NOT NULL |  |
| `revision_number` | `INT` | NOT NULL |  |
| `snapshot_json` | `JSON` | NOT NULL | COMMENT Immutable pre/post-change case data |
| `changed_by` | `BIGINT` | NULL/unspecified |  |
| `change_reason` | `VARCHAR(500)` | NULL/unspecified |  |
| `changed_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_case_revision (test_case_id, revision_number)`
- `CONSTRAINT fk_revisions_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE`
- `CONSTRAINT fk_revisions_actor FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL`

## `test_runs`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `project_id` | `BIGINT` | NOT NULL |  |
| `cycle_id` | `BIGINT` | NULL/unspecified |  |
| `run_code` | `VARCHAR(80)` | NOT NULL | COMMENT e.g. RUN-PH1-20260730 |
| `name` | `VARCHAR(255)` | NOT NULL |  |
| `environment_name` | `VARCHAR(100)` | NULL/unspecified | COMMENT STAGING/UAT/PRODUCTION-MIRROR |
| `build_version` | `VARCHAR(100)` | NULL/unspecified |  |
| `environment_url` | `VARCHAR(1000)` | NULL/unspecified | COMMENT Non-secret URL only |
| `status_code` | `VARCHAR(24)` | NOT NULL | DEFAULT 'PLANNED'; COMMENT PLANNED/ACTIVE/COMPLETED/LOCKED |
| `starts_at` | `DATETIME(3)` | NULL/unspecified |  |
| `ends_at` | `DATETIME(3)` | NULL/unspecified |  |
| `created_by` | `BIGINT` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |
| `updated_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_run_code (project_id, run_code)`
- `KEY ix_runs_cycle (cycle_id)`
- `CONSTRAINT fk_runs_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_runs_cycle FOREIGN KEY (cycle_id) REFERENCES test_cycles(id) ON DELETE SET NULL`
- `CONSTRAINT fk_runs_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`

## `test_run_cases`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `test_run_id` | `BIGINT` | NOT NULL |  |
| `test_case_id` | `BIGINT` | NOT NULL |  |
| `assigned_to` | `BIGINT` | NULL/unspecified |  |
| `case_version` | `INT` | NOT NULL | DEFAULT 1 |
| `case_snapshot_json` | `JSON` | NULL/unspecified | COMMENT Freeze case definition when a run begins |
| `sort_order` | `INT` | NOT NULL | DEFAULT 0 |
| `added_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_run_case (test_run_id, test_case_id)`
- `KEY ix_run_cases_assignee (assigned_to)`
- `CONSTRAINT fk_run_cases_run FOREIGN KEY (test_run_id) REFERENCES test_runs(id) ON DELETE CASCADE`
- `CONSTRAINT fk_run_cases_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE RESTRICT`
- `CONSTRAINT fk_run_cases_assignee FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL`

## `test_executions`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `run_case_id` | `BIGINT` | NOT NULL |  |
| `attempt_number` | `INT` | NOT NULL | COMMENT 1=initial; 2+=retest/re-execution |
| `execution_kind` | `VARCHAR(24)` | NOT NULL | DEFAULT 'INITIAL'; COMMENT INITIAL/RETEST/RERUN |
| `result_status` | `VARCHAR(24)` | NOT NULL | DEFAULT 'NOT_RUN'; COMMENT NOT_RUN/IN_PROGRESS/PASSED/FAILED/BLOCKED/SKIPPED |
| `actual_result` | `MEDIUMTEXT` | NULL/unspecified | COMMENT Detail Hasil Aktual |
| `notes` | `MEDIUMTEXT` | NULL/unspecified | COMMENT Catatan |
| `tester_id` | `BIGINT` | NULL/unspecified |  |
| `legacy_tester_name` | `VARCHAR(255)` | NULL/unspecified | COMMENT Historic Excel tester name not in users |
| `tested_at` | `DATETIME(3)` | NULL/unspecified |  |
| `browser_name` | `VARCHAR(100)` | NULL/unspecified |  |
| `device_name` | `VARCHAR(100)` | NULL/unspecified |  |
| `operating_system` | `VARCHAR(100)` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_execution_attempt (run_case_id, attempt_number)`
- `KEY ix_exec_tester_date (tester_id, tested_at)`
- `KEY ix_exec_status (result_status)`
- `CONSTRAINT fk_executions_run_case FOREIGN KEY (run_case_id) REFERENCES test_run_cases(id) ON DELETE RESTRICT`
- `CONSTRAINT fk_executions_tester FOREIGN KEY (tester_id) REFERENCES users(id) ON DELETE SET NULL`

## `test_execution_steps`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `execution_id` | `BIGINT` | NOT NULL |  |
| `test_case_step_id` | `BIGINT` | NOT NULL |  |
| `result_status` | `VARCHAR(24)` | NOT NULL | DEFAULT 'NOT_RUN' |
| `actual_result` | `TEXT` | NULL/unspecified |  |
| `notes` | `TEXT` | NULL/unspecified |  |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_execution_step (execution_id, test_case_step_id)`
- `CONSTRAINT fk_exec_steps_execution FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE CASCADE`
- `CONSTRAINT fk_exec_steps_definition FOREIGN KEY (test_case_step_id) REFERENCES test_case_steps(id) ON DELETE RESTRICT`

## `defects`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `project_id` | `BIGINT` | NOT NULL |  |
| `module_id` | `BIGINT` | NULL/unspecified |  |
| `bug_code` | `VARCHAR(100)` | NOT NULL | COMMENT e.g. BUG-KAR-0001 |
| `title` | `VARCHAR(500)` | NOT NULL |  |
| `description` | `MEDIUMTEXT` | NULL/unspecified |  |
| `steps_to_reproduce` | `MEDIUMTEXT` | NULL/unspecified |  |
| `expected_behavior` | `MEDIUMTEXT` | NULL/unspecified |  |
| `actual_behavior` | `MEDIUMTEXT` | NULL/unspecified |  |
| `severity_code` | `VARCHAR(24)` | NOT NULL | DEFAULT 'MEDIUM'; COMMENT CRITICAL/HIGH/MEDIUM/LOW/INFO |
| `priority_code` | `VARCHAR(24)` | NOT NULL | DEFAULT 'MEDIUM'; COMMENT URGENT/HIGH/MEDIUM/LOW |
| `status_code` | `VARCHAR(32)` | NOT NULL | DEFAULT 'OPEN'; COMMENT OPEN/IN_PROGRESS/FIXED/READY_FOR_RETEST/VERIFIED/REOPENED/CLOSED/WONT_FIX |
| `source_kind` | `VARCHAR(24)` | NOT NULL | DEFAULT 'UAT'; COMMENT UAT/USER_REPORT/OTHER |
| `environment_name` | `VARCHAR(100)` | NULL/unspecified |  |
| `build_version` | `VARCHAR(100)` | NULL/unspecified |  |
| `browser_name` | `VARCHAR(100)` | NULL/unspecified |  |
| `reported_by` | `BIGINT` | NULL/unspecified |  |
| `assigned_to` | `BIGINT` | NULL/unspecified |  |
| `fixed_in_version` | `VARCHAR(100)` | NULL/unspecified |  |
| `resolved_at` | `DATETIME(3)` | NULL/unspecified |  |
| `closed_at` | `DATETIME(3)` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |
| `updated_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_defect_code (project_id, bug_code)`
- `KEY ix_defects_status_severity (project_id, status_code, severity_code)`
- `KEY ix_defects_assigned (assigned_to, status_code)`
- `CONSTRAINT fk_defects_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_defects_module FOREIGN KEY (module_id) REFERENCES modules(id) ON DELETE SET NULL`
- `CONSTRAINT fk_defects_reporter FOREIGN KEY (reported_by) REFERENCES users(id) ON DELETE SET NULL`
- `CONSTRAINT fk_defects_assignee FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL`

## `defect_execution_links`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `defect_id` | `BIGINT` | NOT NULL |  |
| `execution_id` | `BIGINT` | NOT NULL |  |
| `linked_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (defect_id, execution_id)`
- `KEY ix_defect_link_execution (execution_id)`
- `CONSTRAINT fk_defect_link_defect FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_defect_link_execution FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE RESTRICT`

## `defect_comments`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `defect_id` | `BIGINT` | NOT NULL |  |
| `author_id` | `BIGINT` | NULL/unspecified |  |
| `body` | `MEDIUMTEXT` | NOT NULL |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |
| `updated_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `KEY ix_defect_comments_date (defect_id, created_at)`
- `CONSTRAINT fk_comments_defect FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL`

## `defect_status_history`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `defect_id` | `BIGINT` | NOT NULL |  |
| `from_status` | `VARCHAR(32)` | NULL/unspecified |  |
| `to_status` | `VARCHAR(32)` | NOT NULL |  |
| `changed_by` | `BIGINT` | NULL/unspecified |  |
| `change_comment` | `VARCHAR(1000)` | NULL/unspecified |  |
| `changed_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `KEY ix_defect_history (defect_id, changed_at)`
- `CONSTRAINT fk_defect_hist_defect FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_defect_hist_actor FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE SET NULL`

## `file_objects`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `project_id` | `BIGINT` | NOT NULL |  |
| `storage_backend` | `VARCHAR(24)` | NOT NULL | DEFAULT 'S3'; COMMENT S3/MINIO/PRIVATE_LOCAL |
| `bucket_name` | `VARCHAR(128)` | NOT NULL |  |
| `object_key` | `VARCHAR(255)` | NOT NULL | COMMENT Private random key, not a public URL |
| `original_filename` | `VARCHAR(500)` | NOT NULL |  |
| `original_mime` | `VARCHAR(128)` | NOT NULL |  |
| `stored_mime` | `VARCHAR(128)` | NOT NULL |  |
| `evidence_type` | `VARCHAR(24)` | NOT NULL | DEFAULT 'OTHER'; COMMENT SCREENSHOT/VIDEO/LOG/DOCUMENT/OTHER |
| `original_size_bytes` | `BIGINT` | NOT NULL |  |
| `stored_size_bytes` | `BIGINT` | NULL/unspecified |  |
| `original_sha256` | `CHAR(64)` | NULL/unspecified | COMMENT Hash of bytes received before transformation |
| `stored_sha256` | `CHAR(64)` | NULL/unspecified | COMMENT Hash of final stored bytes |
| `compression_method` | `VARCHAR(100)` | NULL/unspecified | COMMENT e.g. WEBP_LOSSLESS, PNG_OPTIMIZE, H264, GZIP |
| `processing_status` | `VARCHAR(24)` | NOT NULL | DEFAULT 'PROCESSING'; COMMENT PROCESSING/READY/FAILED/REJECTED |
| `scan_status` | `VARCHAR(24)` | NOT NULL | DEFAULT 'PENDING'; COMMENT PENDING/CLEAN/INFECTED/ERROR |
| `compression_note` | `VARCHAR(500)` | NULL/unspecified | COMMENT e.g. already compressed; no reduction possible |
| `width_px` | `INT` | NULL/unspecified |  |
| `height_px` | `INT` | NULL/unspecified |  |
| `duration_seconds` | `DECIMAL(12,3)` | NULL/unspecified |  |
| `thumbnail_object_key` | `VARCHAR(255)` | NULL/unspecified |  |
| `uploaded_by` | `BIGINT` | NULL/unspecified |  |
| `uploaded_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |
| `processed_at` | `DATETIME(3)` | NULL/unspecified |  |
| `deleted_at` | `DATETIME(3)` | NULL/unspecified |  |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_file_storage_key (bucket_name, object_key)`
- `KEY ix_file_project_status (project_id, processing_status)`
- `CONSTRAINT fk_file_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_file_uploader FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL`

## `execution_files`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `execution_id` | `BIGINT` | NOT NULL |  |
| `file_object_id` | `BIGINT` | NOT NULL |  |
| `caption` | `VARCHAR(500)` | NULL/unspecified |  |
| `step_number` | `INT` | NULL/unspecified | COMMENT Optional link to a numbered test step |
| `sort_order` | `INT` | NOT NULL | DEFAULT 0 |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_execution_file (execution_id, file_object_id)`
- `CONSTRAINT fk_exec_file_execution FOREIGN KEY (execution_id) REFERENCES test_executions(id) ON DELETE CASCADE`
- `CONSTRAINT fk_exec_file_object FOREIGN KEY (file_object_id) REFERENCES file_objects(id) ON DELETE RESTRICT`

## `defect_files`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `defect_id` | `BIGINT` | NOT NULL |  |
| `file_object_id` | `BIGINT` | NOT NULL |  |
| `caption` | `VARCHAR(500)` | NULL/unspecified |  |
| `sort_order` | `INT` | NOT NULL | DEFAULT 0 |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_defect_file (defect_id, file_object_id)`
- `CONSTRAINT fk_bug_file_bug FOREIGN KEY (defect_id) REFERENCES defects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_bug_file_object FOREIGN KEY (file_object_id) REFERENCES file_objects(id) ON DELETE RESTRICT`

## `test_case_files`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `test_case_id` | `BIGINT` | NOT NULL |  |
| `file_object_id` | `BIGINT` | NOT NULL |  |
| `caption` | `VARCHAR(500)` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_case_file (test_case_id, file_object_id)`
- `CONSTRAINT fk_case_file_case FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE`
- `CONSTRAINT fk_case_file_object FOREIGN KEY (file_object_id) REFERENCES file_objects(id) ON DELETE RESTRICT`

## `import_jobs`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `project_id` | `BIGINT` | NOT NULL |  |
| `source_file_id` | `BIGINT` | NULL/unspecified | COMMENT Can refer to processed uploaded .xlsx/.csv/.json |
| `original_filename` | `VARCHAR(500)` | NOT NULL |  |
| `source_format` | `VARCHAR(16)` | NOT NULL | COMMENT XLSX/CSV/JSON |
| `source_kind` | `VARCHAR(24)` | NOT NULL | DEFAULT 'LEGACY'; COMMENT LEGACY/AI/MANUAL |
| `import_mode` | `VARCHAR(24)` | NOT NULL | DEFAULT 'CREATE_ONLY'; COMMENT CREATE_ONLY/UPDATE/NEW_REVISION |
| `status_code` | `VARCHAR(32)` | NOT NULL | DEFAULT 'UPLOADED'; COMMENT UPLOADED/VALIDATING/PREVIEW/IMPORTING/COMPLETED/PARTIAL/FAILED |
| `selected_sheets_json` | `JSON` | NULL/unspecified |  |
| `column_mapping_json` | `JSON` | NULL/unspecified |  |
| `total_rows` | `INT` | NOT NULL | DEFAULT 0 |
| `valid_rows` | `INT` | NOT NULL | DEFAULT 0 |
| `imported_rows` | `INT` | NOT NULL | DEFAULT 0 |
| `skipped_rows` | `INT` | NOT NULL | DEFAULT 0 |
| `invalid_rows` | `INT` | NOT NULL | DEFAULT 0 |
| `error_summary` | `TEXT` | NULL/unspecified |  |
| `created_by` | `BIGINT` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |
| `completed_at` | `DATETIME(3)` | NULL/unspecified |  |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `KEY ix_import_jobs_project_status (project_id, status_code)`
- `CONSTRAINT fk_import_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_import_file FOREIGN KEY (source_file_id) REFERENCES file_objects(id) ON DELETE SET NULL`
- `CONSTRAINT fk_import_creator FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL`

## `import_job_rows`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `import_job_id` | `BIGINT` | NOT NULL |  |
| `sheet_name` | `VARCHAR(255)` | NULL/unspecified |  |
| `source_row_number` | `INT` | NULL/unspecified |  |
| `external_case_code` | `VARCHAR(100)` | NULL/unspecified |  |
| `source_hash` | `CHAR(64)` | NULL/unspecified | COMMENT Use for re-import deduplication |
| `raw_payload_json` | `JSON` | NULL/unspecified |  |
| `mapped_payload_json` | `JSON` | NULL/unspecified |  |
| `status_code` | `VARCHAR(24)` | NOT NULL | DEFAULT 'PENDING'; COMMENT PENDING/VALID/ERROR/DUPLICATE/IMPORTED/SKIPPED |
| `validation_errors_json` | `JSON` | NULL/unspecified |  |
| `target_test_case_id` | `BIGINT` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `KEY ix_import_rows_job_status (import_job_id, status_code)`
- `KEY ix_import_rows_case (target_test_case_id)`
- `CONSTRAINT fk_import_row_job FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE`
- `CONSTRAINT fk_import_row_case FOREIGN KEY (target_test_case_id) REFERENCES test_cases(id) ON DELETE SET NULL`

## `import_job_row_files`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `import_job_row_id` | `BIGINT` | NOT NULL |  |
| `file_object_id` | `BIGINT` | NOT NULL |  |
| `source_anchor` | `VARCHAR(100)` | NULL/unspecified | COMMENT Original sheet coordinate such as E3 |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `UNIQUE KEY uq_import_row_file (import_job_row_id, file_object_id)`
- `CONSTRAINT fk_import_image_row FOREIGN KEY (import_job_row_id) REFERENCES import_job_rows(id) ON DELETE CASCADE`
- `CONSTRAINT fk_import_image_file FOREIGN KEY (file_object_id) REFERENCES file_objects(id) ON DELETE RESTRICT`

## `project_settings`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `project_id` | `BIGINT` | NOT NULL |  |
| `setting_key` | `VARCHAR(120)` | NOT NULL | COMMENT e.g. upload.max_video_mb |
| `value_json` | `JSON` | NOT NULL |  |
| `updated_by` | `BIGINT` | NULL/unspecified |  |
| `updated_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (project_id, setting_key)`
- `CONSTRAINT fk_settings_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE`
- `CONSTRAINT fk_settings_actor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL`

## `audit_logs`

| Column | Type | Nullability | Default / comment |
|---|---|---|---|
| `id` | `BIGINT` | NOT NULL |  |
| `project_id` | `BIGINT` | NULL/unspecified |  |
| `actor_id` | `BIGINT` | NULL/unspecified |  |
| `entity_type` | `VARCHAR(100)` | NOT NULL | COMMENT test_case/test_execution/defect/file_object/import_job |
| `entity_id` | `BIGINT` | NOT NULL |  |
| `action_code` | `VARCHAR(100)` | NOT NULL | COMMENT CREATE/UPDATE/DELETE/STATUS_CHANGE/IMPORT/DOWNLOAD |
| `old_values_json` | `JSON` | NULL/unspecified |  |
| `new_values_json` | `JSON` | NULL/unspecified |  |
| `request_id` | `VARCHAR(100)` | NULL/unspecified |  |
| `client_ip` | `VARCHAR(45)` | NULL/unspecified |  |
| `created_at` | `DATETIME(3)` | NOT NULL | DEFAULT CURRENT_TIMESTAMP(3) |

**Keys / constraints:**

- `PRIMARY KEY (id)`
- `KEY ix_audit_entity (entity_type, entity_id, created_at)`
- `KEY ix_audit_project_date (project_id, created_at)`
- `CONSTRAINT fk_audit_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL`
- `CONSTRAINT fk_audit_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL`
