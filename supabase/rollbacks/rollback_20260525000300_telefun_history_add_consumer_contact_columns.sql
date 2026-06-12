-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260525000300_telefun_history_add_consumer_contact_columns.sql
-- Description: Drops the consumer_phone and consumer_city columns from
--              telefun_history. Note: Other columns that were added with
--              ADD COLUMN IF NOT EXISTS (recording_path through
--              realistic_mode_enabled) were already added by migration
--              20260523000000 and are rolled back by that migration.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping columns will permanently delete consumer contact data.
--   BACKUP REQUIRED: pg_dump -t telefun_history --column-inserts > telefun_backup.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.telefun_history
  DROP COLUMN IF EXISTS consumer_phone,
  DROP COLUMN IF EXISTS consumer_city;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: Both columns should not exist (0 rows)
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'COLUMN consumer_phone' AS object_type, COUNT(*) AS exists_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'consumer_phone'
UNION ALL
SELECT 'COLUMN consumer_city', COUNT(*)
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'telefun_history' AND column_name = 'consumer_city';
