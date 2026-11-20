-- Read-only checks only. Can run in DBeaver as authorized account.
SELECT DATABASE() AS active_database, VERSION() AS mysql_version;
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema='testboard'
ORDER BY table_type, table_name;
SELECT table_type, COUNT(*) AS total
FROM information_schema.tables
WHERE table_schema='testboard'
GROUP BY table_type;
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema='testboard' AND table_name='file_objects'
ORDER BY ordinal_position;
SELECT * FROM testboard.v_run_case_latest_status LIMIT 5;
-- Optional privilege check (as an admin or own MySQL account):
-- SHOW GRANTS;
