-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260525000200_restore_mv_qa_period_summary_contract.sql
-- Description: Drops the mv_qa_period_summary materialized view, its indexes,
--              and the refresh_mv_qa_period_summary() function created by
--              migration 20260525000200.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping the materialized view will permanently delete the cached summary
--   data. It can be rebuilt by re-running REFRESH MATERIALIZED VIEW.
--   BACKUP RECOMMENDED: pg_dump -t mv_qa_period_summary > mv_backup.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop the materialized view (CASCADE drops indexes and grants)
DROP MATERIALIZED VIEW IF EXISTS public.mv_qa_period_summary CASCADE;

-- 2. Drop the refresh function (indexes are dropped by CASCADE)
DROP FUNCTION IF EXISTS public.refresh_mv_qa_period_summary();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'MATERIALIZED VIEW mv_qa_period_summary' AS object_type, COUNT(*) AS exists_count
FROM pg_matviews
WHERE schemaname = 'public' AND matviewname = 'mv_qa_period_summary'
UNION ALL
SELECT 'FUNCTION refresh_mv_qa_period_summary', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'refresh_mv_qa_period_summary';
