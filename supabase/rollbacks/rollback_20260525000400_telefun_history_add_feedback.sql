-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260525000400_telefun_history_add_feedback.sql
-- Description: Drops the feedback column from telefun_history.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping the feedback column will permanently delete feedback data.
--   BACKUP REQUIRED: UPDATE telefun_history SET feedback = NULL ... before running.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.telefun_history
  DROP COLUMN IF EXISTS feedback;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: Column should not exist (0 rows)
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'COLUMN feedback' AS object_type, COUNT(*) AS exists_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'feedback';
