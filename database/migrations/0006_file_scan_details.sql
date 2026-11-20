-- ============================================================================
-- 0006 - Evidence: record which check cleared a file and why a file was refused (ADR 0008)
-- STATUS : Disetujui pemilik proyek (20 Nov 2026, pilihan M5: pemeriksaan dasar tanpa
--          konfigurasi, ClamAV opsional). Status penerapan tercatat di schema_migrations.
-- IMPACT : 3 kolom baru NULL pada file_objects; tidak mengubah data atau kolom yang ada.
-- WHY    : scan_status = CLEAN tidak cukup: perlu dicatat apakah file lolos pemeriksaan
--          dasar (BASIC) atau antivirus (CLAMAV), kapan, dan alasan aman bila ditolak.
-- ROLLBACK (hanya dev):
--   ALTER TABLE file_objects DROP COLUMN scan_engine, DROP COLUMN scanned_at,
--     DROP COLUMN failure_reason;
-- ============================================================================
ALTER TABLE file_objects
  ADD COLUMN scan_engine    VARCHAR(40)  NULL COMMENT 'BASIC|CLAMAV' AFTER scan_status,
  ADD COLUMN scanned_at     DATETIME(3)  NULL AFTER scan_engine,
  ADD COLUMN failure_reason VARCHAR(200) NULL COMMENT 'Safe reason code for REJECTED/FAILED' AFTER compression_note;
