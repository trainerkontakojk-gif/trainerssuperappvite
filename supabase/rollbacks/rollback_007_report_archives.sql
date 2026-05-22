-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 007_report_archives.sql
-- Description: Removes the report_archives table, its indexes, and RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Independently reversible
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping report_archives will permanently delete all saved/generated reports.
--   BACKUP REQUIRED: pg_dump -t public.report_archives > report_archives_backup.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop RLS policies
DROP POLICY IF EXISTS "users_view_own_reports" ON report_archives;
DROP POLICY IF EXISTS "users_insert_own_reports" ON report_archives;
DROP POLICY IF EXISTS "users_delete_own_reports" ON report_archives;
DROP POLICY IF EXISTS "users_update_own_reports" ON report_archives;

-- 2. Drop indexes
DROP INDEX IF EXISTS idx_report_archives_user_id;
DROP INDEX IF EXISTS idx_report_archives_created_at;
DROP INDEX IF EXISTS idx_report_archives_type;

-- 3. Drop table
DROP TABLE IF EXISTS report_archives CASCADE;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'TABLE report_archives' AS object_type, COUNT(*) AS exists_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'report_archives';
