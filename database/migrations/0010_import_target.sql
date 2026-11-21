-- ============================================================================
-- 0010 - What an import job creates: test cases or bugs (ADR 0013, "Impor Bug")
-- STATUS : Diminta pemilik proyek (21 Nov 2026): bug dari Tracker Fase 1 diimpor ke sistem.
-- IMPACT : 1 kolom baru NOT NULL DEFAULT 'TEST_CASES' pada import_jobs; job lama tetap
--          bernilai TEST_CASES (perilaku sama seperti sebelumnya).
-- ROLLBACK (hanya dev): ALTER TABLE import_jobs DROP COLUMN import_target;
-- ============================================================================
ALTER TABLE import_jobs
  ADD COLUMN import_target VARCHAR(16) NOT NULL DEFAULT 'TEST_CASES'
    COMMENT 'TEST_CASES|DEFECTS' AFTER source_kind;
