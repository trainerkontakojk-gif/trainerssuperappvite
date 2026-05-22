-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 000_profiles_core.sql
-- Description: Removes the profiles table, handle_new_user trigger/function,
--              set_updated_at function, and associated RLS policies.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Requires prior rollback of [001, 002, 003, 004, 005, 006, 007, 008]
--   - 001_sidak_core references profiles for RLS checks
--   - 002_ketik_pdkt_core references auth.users (indirect via profiles)
--   - 003_telefun_core references auth.users
--   - 004_admin_core references profiles for RLS and FK
--   - 005_carbon_copy_parity references profiles
--   - 006_create_user_settings references auth.users
--   - 007_report_archives references auth.users
--   - 008_profile_admin_policies adds policies to profiles
--
-- ⚠️  DATA LOSS WARNING:
--   Dropping the profiles table will permanently delete ALL user profile data.
--   This includes: id, email, full_name, role, status, is_deleted, timestamps.
--   BACKUP REQUIRED: pg_dump -t public.profiles > profiles_backup.sql
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop triggers
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;

-- 2. Drop functions
DROP FUNCTION IF EXISTS public.handle_new_user();
DROP FUNCTION IF EXISTS public.set_updated_at();

-- 3. Drop RLS policies
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

-- 4. Drop table (CASCADE to remove any remaining dependent objects)
DROP TABLE IF EXISTS public.profiles CASCADE;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'TABLE profiles' AS object_type, COUNT(*) AS exists_count
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'profiles'
UNION ALL
SELECT 'FUNCTION handle_new_user', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'handle_new_user'
UNION ALL
SELECT 'FUNCTION set_updated_at', COUNT(*)
FROM information_schema.routines
WHERE routine_schema = 'public' AND routine_name = 'set_updated_at';
