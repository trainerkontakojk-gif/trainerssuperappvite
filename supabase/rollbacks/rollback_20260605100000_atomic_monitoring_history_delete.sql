-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260605100000_atomic_monitoring_history_delete.sql
-- Description: Drops delete_monitoring_history, which did not exist before the
--              forward migration.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: None (function-level change only)
--
-- No data loss: Function removal only.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DROP FUNCTION IF EXISTS public.delete_monitoring_history(TEXT, UUID);

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: exists_count = 0
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'FUNCTION delete_monitoring_history' AS object_type, COUNT(*) AS exists_count
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name = 'delete_monitoring_history'
  AND routine_type = 'FUNCTION';
