-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 011_materialized_view_dashboard.sql
-- Description: Removes the mv_qa_period_summary materialized view and its indexes.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Requires prior rollback of [013]
--   - 013_refresh_mv_function creates a function that references this view
--
-- No data loss: Materialized views contain computed/cached data only.
--   The source data in qa_temuan, profiler_peserta, and profiles remains intact.
--   Dashboard queries will fall back to raw table computation.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop indexes on materialized view
DROP INDEX IF EXISTS idx_mv_qa_period_summary_period_id;
DROP INDEX IF EXISTS idx_mv_qa_period_summary_service_type;
DROP INDEX IF EXISTS idx_mv_qa_period_summary_unique;

-- 2. Drop materialized view
DROP MATERIALIZED VIEW IF EXISTS mv_qa_period_summary;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: Should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT matviewname AS view_name, 'should not exist' AS status
FROM pg_matviews
WHERE schemaname = 'public'
  AND matviewname = 'mv_qa_period_summary';
