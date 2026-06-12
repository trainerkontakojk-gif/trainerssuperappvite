-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260611200000_telefun_scoring_lifecycle.sql
-- Description: Drops the 5 scoring lifecycle columns added to telefun_history,
--              drops 2 indexes, and drops 3 RPC functions (claim_telefun_scoring,
--              complete_telefun_scoring, fail_telefun_scoring).
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping scoring columns from telefun_history will permanently delete
--   all scoring lifecycle data (status, timestamps, errors, attempt count).
--   BACKUP REQUIRED before running in production.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop indexes
DROP INDEX IF EXISTS public.idx_telefun_scoring_status;
DROP INDEX IF EXISTS public.idx_telefun_scoring_claimed_at;

-- 2. Drop RPC functions
DROP FUNCTION IF EXISTS public.claim_telefun_scoring(UUID, INT);
DROP FUNCTION IF EXISTS public.complete_telefun_scoring(UUID, NUMERIC, JSONB);
DROP FUNCTION IF EXISTS public.fail_telefun_scoring(UUID, TEXT);

-- 3. Drop columns from telefun_history
ALTER TABLE public.telefun_history
  DROP COLUMN IF EXISTS scoring_status,
  DROP COLUMN IF EXISTS scoring_claimed_at,
  DROP COLUMN IF EXISTS scoring_completed_at,
  DROP COLUMN IF EXISTS scoring_attempt_count,
  DROP COLUMN IF EXISTS scoring_last_error;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'INDEX idx_telefun_scoring_status' AS object_type, COUNT(*) AS exists_count
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'telefun_history' AND indexname = 'idx_telefun_scoring_status'
UNION ALL
SELECT 'INDEX idx_telefun_scoring_claimed_at', COUNT(*)
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'telefun_history' AND indexname = 'idx_telefun_scoring_claimed_at'
UNION ALL
SELECT 'FUNCTION claim_telefun_scoring', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'claim_telefun_scoring'
UNION ALL
SELECT 'FUNCTION complete_telefun_scoring', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'complete_telefun_scoring'
UNION ALL
SELECT 'FUNCTION fail_telefun_scoring', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'fail_telefun_scoring'
UNION ALL
SELECT 'COLUMN scoring_status', COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'scoring_status'
UNION ALL
SELECT 'COLUMN scoring_claimed_at', COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'scoring_claimed_at'
UNION ALL
SELECT 'COLUMN scoring_completed_at', COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'scoring_completed_at'
UNION ALL
SELECT 'COLUMN scoring_attempt_count', COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'scoring_attempt_count'
UNION ALL
SELECT 'COLUMN scoring_last_error', COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'scoring_last_error';
