-- Rollback: 20260612000000_fix_profiles_rls_recursion
-- Restores original RLS policies using direct subqueries (pre-fix state).
-- NOTE: This restores the pre-fix state which had infinite recursion on SELECT.
-- Only rollback if you have a specific reason to revert.

-- 1. Restore original admin SELECT policy (direct subquery)
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer'))
  );

-- 2. Restore original admin UPDATE policy (direct subquery)
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 3. Drop SECURITY DEFINER helper functions (safe after policies no longer depend on them)
DROP FUNCTION IF EXISTS public.is_admin_or_trainer();
DROP FUNCTION IF EXISTS public.is_admin();

-- Verification: check policies exist and functions are dropped
SELECT 'profiles_select_admin' AS policy_name FROM pg_policies WHERE policyname = 'profiles_select_admin' AND tablename = 'profiles'
UNION ALL
SELECT 'profiles_update_admin' FROM pg_policies WHERE policyname = 'profiles_update_admin' AND tablename = 'profiles'
UNION ALL
SELECT 'functions_dropped' WHERE NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin_or_trainer')
  AND NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'is_admin');
