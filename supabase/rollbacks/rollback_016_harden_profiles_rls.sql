-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 016_harden_profiles_rls.sql
-- Description: Restores the pre-016 column-level UPDATE grants, drops the
--              tightened policies, and recreates the original
--              policies (profiles_update_own without WITH CHECK, and
--              profiles_update_admin with admin+trainer check).
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: profiles table must exist (000_profiles_core)
--             admin policies must exist (008_profile_admin_policies)
--
-- No data loss: Only policies and grants are affected.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Ensure no broad table-level UPDATE privilege remains
REVOKE UPDATE ON public.profiles FROM authenticated;

-- 2. Revoke column-level grant added by migration 016
REVOKE UPDATE (full_name) ON public.profiles FROM authenticated;

-- 3. Restore the column-level UPDATE grant from migration 008
GRANT UPDATE (role, is_deleted) ON public.profiles TO authenticated;

-- 4. Drop the new policies created by migration 016
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;

-- 5. Recreate original profiles_update_own (without WITH CHECK)
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

-- 6. Recreate original profiles_update_admin (admin+trainer check)
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer'))
  );

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: Both policies and the role/is_deleted grants should exist.
--           Broad table UPDATE and the full_name grant should be absent.
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'POLICY profiles_update_own' AS object_type, COUNT(*) AS exists_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND policyname = 'profiles_update_own'
UNION ALL
SELECT 'POLICY profiles_update_admin', COUNT(*)
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND policyname = 'profiles_update_admin'
UNION ALL
SELECT 'COLUMN GRANT full_name (should be 0)', COUNT(*)
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name = 'full_name'
  AND privilege_type = 'UPDATE'
  AND grantee = 'authenticated'
UNION ALL
SELECT 'COLUMN GRANTS role/is_deleted (should be 2)', COUNT(*)
FROM information_schema.column_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('role', 'is_deleted')
  AND privilege_type = 'UPDATE'
  AND grantee = 'authenticated'
UNION ALL
SELECT 'TABLE GRANT UPDATE (should be 0)', COUNT(*)
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND privilege_type = 'UPDATE'
  AND grantee = 'authenticated';
