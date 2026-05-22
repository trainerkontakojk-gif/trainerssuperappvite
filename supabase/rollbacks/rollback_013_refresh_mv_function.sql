-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 013_refresh_mv_function.sql
-- Description: Removes the refresh_mv_qa_period_summary() function used to
--              refresh the materialized view concurrently from the backend.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Independently reversible
--   (The materialized view from 011 remains intact; only the refresh function is removed.
--    Manual REFRESH MATERIALIZED VIEW commands can still be used.)
--
-- No data loss: This migration only creates a function. No tables or data affected.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop function
DROP FUNCTION IF EXISTS public.refresh_mv_qa_period_summary();

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: Should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT routine_name AS function_name, 'should not exist' AS status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'refresh_mv_qa_period_summary';
