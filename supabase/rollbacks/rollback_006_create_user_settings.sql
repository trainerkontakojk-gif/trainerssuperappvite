-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 006_create_user_settings.sql
-- Description: Removes the user_settings table, its trigger, RLS policy, and grants.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Independently reversible
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping user_settings will permanently delete all user configuration data
--   (JSON settings per user).
--   BACKUP REQUIRED: pg_dump -t public.user_settings > user_settings_backup.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop trigger
DROP TRIGGER IF EXISTS update_user_settings_updated_at ON public.user_settings;

-- 2. Drop RLS policy
DROP POLICY IF EXISTS "Users can manage own settings" ON public.user_settings;

-- 3. Drop table
DROP TABLE IF EXISTS public.user_settings CASCADE;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'TABLE user_settings' AS object_type, COUNT(*) AS exists_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'user_settings';
