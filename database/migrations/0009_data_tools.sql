-- ============================================================================
-- 0009 - Data tools: bug phase (cycle), imported bug history, merged test cases (ADR 0013)
-- STATUS : Diminta pemilik proyek (21 Nov 2026): bug punya Fase (siklus uji), bug lama dari
--          Tracker bisa diimpor, dan test case ganda bisa digabung.
-- IMPACT : hanya MENAMBAH kolom NULL (tidak ada data yang diubah atau dihapus):
--          defects: cycle_id, legacy_reporter_name, reported_at, source_reference
--          test_cases: merged_into_id
-- WHY    : - cycle_id menghubungkan bug ke Fase (mis. "UAT Fase 1"), sama seperti run.
--          - legacy_reporter_name: nama pelapor/penguji dari file lama disimpan sebagai TEKS,
--            tidak pernah membuat akun (sama dengan legacy_tester_name pada hasil uji).
--          - reported_at: tanggal asli di Tracker; created_at tetap waktu impor.
--          - source_reference: asal baris, mis. "Tracker Fase 1 / Aduan user / baris 12".
--          - merged_into_id: test case yang digabung ke test case lain (diarsipkan, tetap
--            menunjuk ke penggantinya; hasil run lama tidak berubah).
-- ROLLBACK (hanya dev):
--   ALTER TABLE defects DROP FOREIGN KEY fk_defects_cycle, DROP COLUMN cycle_id,
--     DROP COLUMN legacy_reporter_name, DROP COLUMN reported_at, DROP COLUMN source_reference;
--   ALTER TABLE test_cases DROP FOREIGN KEY fk_cases_merged_into, DROP COLUMN merged_into_id;
-- ============================================================================
ALTER TABLE defects
  ADD COLUMN cycle_id BIGINT UNSIGNED NULL COMMENT 'Test cycle / phase' AFTER module_id,
  ADD COLUMN legacy_reporter_name VARCHAR(200) NULL
    COMMENT 'Reporter from an imported sheet (text only, never an account)' AFTER reported_by,
  ADD COLUMN reported_at DATETIME(3) NULL COMMENT 'Original report date of imported bugs'
    AFTER legacy_reporter_name,
  ADD COLUMN source_reference VARCHAR(255) NULL COMMENT 'Where an imported bug came from'
    AFTER source_kind,
  ADD KEY ix_defects_cycle (project_id, cycle_id),
  ADD CONSTRAINT fk_defects_cycle FOREIGN KEY (cycle_id) REFERENCES test_cycles(id)
    ON DELETE SET NULL;

ALTER TABLE test_cases
  ADD COLUMN merged_into_id BIGINT UNSIGNED NULL
    COMMENT 'Archived because it was merged into this test case' AFTER case_status,
  ADD CONSTRAINT fk_cases_merged_into FOREIGN KEY (merged_into_id) REFERENCES test_cases(id)
    ON DELETE SET NULL;
