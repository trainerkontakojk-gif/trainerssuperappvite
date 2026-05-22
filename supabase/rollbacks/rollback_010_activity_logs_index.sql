-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 010_activity_logs_index.sql
-- Description: Removes the B-tree index on activity_logs(created_at DESC).
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Independently reversible
--   (activity_logs table from 004 remains intact)
--
-- No data loss: This migration only creates an index. Removing it affects
--   query performance but not data integrity.
-- ═══════════════════════════════════════════════════════════════════════════════

-- NOTE: DROP INDEX CONCURRENTLY cannot run inside a transaction block.
-- Execute this file without wrapping in BEGIN/COMMIT.

-- 1. Drop index (CONCURRENTLY to avoid blocking reads)
DROP INDEX CONCURRENTLY IF EXISTS public.idx_activity_logs_created_at;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: Should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT indexname AS index_name, 'should not exist' AS status
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'idx_activity_logs_created_at';
