-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260525000500_telefun_history_add_metadata_columns.sql
-- Description: Drops the configured_duration, response_pacing_mode,
--              telefun_model_id, and telefun_transport columns from
--              telefun_history.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ═️  DATA LOSS WARNING:
--   Dropping these columns will permanently delete metadata values.
--   BACKUP REQUIRED before running in production.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.telefun_history
  DROP COLUMN IF EXISTS configured_duration,
  DROP COLUMN IF EXISTS response_pacing_mode,
  DROP COLUMN IF EXISTS telefun_model_id,
  DROP COLUMN IF EXISTS telefun_transport;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All columns should not exist (0 rows)
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'COLUMN configured_duration' AS object_type, COUNT(*) AS exists_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'configured_duration'
UNION ALL
SELECT 'COLUMN response_pacing_mode', COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'response_pacing_mode'
UNION ALL
SELECT 'COLUMN telefun_model_id', COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'telefun_model_id'
UNION ALL
SELECT 'COLUMN telefun_transport', COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'telefun_transport';
