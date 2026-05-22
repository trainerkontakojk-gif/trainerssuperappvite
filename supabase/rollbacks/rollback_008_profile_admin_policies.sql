-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 008_profile_admin_policies.sql
-- Description: Removes admin/trainer SELECT and UPDATE policies on profiles,
--              and revokes the column-level grants added by this migration.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Independently reversible
--   (profiles table and base policies from 000 remain intact)
--
-- No data loss: This migration only adds policies and grants, no tables or columns.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop RLS policies
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

-- 2. Revoke column-level grants
REVOKE SELECT (id, email, role, full_name, is_deleted, created_at, updated_at) ON public.profiles FROM authenticated;
REVOKE UPDATE (role, is_deleted) ON public.profiles FROM authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT policyname AS policy_name, 'should not exist' AS status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND policyname IN ('profiles_select_admin', 'profiles_update_admin');
