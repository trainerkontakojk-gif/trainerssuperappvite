-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260520054101_add_is_deleted_to_profiles.sql
-- Description: Removes the is_deleted column and its index from the profiles table.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Independently reversible
--   (profiles table from 000 remains intact with original columns)
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping the is_deleted column will lose all soft-delete state for profiles.
--   Any profiles marked as is_deleted=true will lose that classification.
--   BACKUP REQUIRED:
--     psql -c "COPY (SELECT id, is_deleted FROM profiles WHERE is_deleted = true) TO STDOUT" > soft_deleted_backup.csv
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop index
DROP INDEX IF EXISTS public.profiles_is_deleted_idx;

-- 2. Drop column
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_deleted;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT column_name AS missing_column, 'should not exist' AS status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'is_deleted'
UNION ALL
SELECT indexname, 'should not exist'
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname = 'profiles_is_deleted_idx';
