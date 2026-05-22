-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 012_ai_usage_status_error.sql
-- Description: Removes the status and error_message columns from ai_usage_logs,
--              and drops the idx_ai_usage_logs_status index.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Independently reversible
--   (ai_usage_logs table from 002 remains intact with original columns)
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping the status column will lose all request status tracking data
--   (success/failed/timeout classification).
--   Dropping error_message will lose all captured error details.
--   BACKUP REQUIRED:
--     psql -c "COPY (SELECT id, status, error_message FROM ai_usage_logs) TO STDOUT" > ai_status_backup.csv
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop index on status
DROP INDEX IF EXISTS idx_ai_usage_logs_status;

-- 2. Drop columns
ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS error_message;
ALTER TABLE ai_usage_logs DROP COLUMN IF EXISTS status;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT column_name AS missing_column, 'should not exist' AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'ai_usage_logs'
  AND column_name IN ('status', 'error_message')
UNION ALL
SELECT indexname, 'should not exist'
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'idx_ai_usage_logs_status';
