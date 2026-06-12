-- 019: Fix RLS infinite recursion on profiles table
--
-- Problem: Policies `profiles_select_admin` and `profiles_update_admin` use
-- subqueries referencing `profiles` directly, which triggers RLS again
-- on the subquery → infinite recursion → error 42P17 / HTTP 500.
--
-- Fix: Use SECURITY DEFINER helper functions that bypass RLS when checking
-- the current user's role. The function itself is NOT a policy — it's a
-- helper that grants SELECT on profiles only for the current auth.uid()
-- check, which is safe and bounded.

-- 1. Helper: check if current user is admin or trainer (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin_or_trainer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer')
  );
$$;

-- 2. Helper: check if current user is admin only (bypasses RLS)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- 3. Revoke public/authenticated execute on the functions (defense in depth)
REVOKE ALL ON FUNCTION public.is_admin_or_trainer() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;

-- 4. Recreate admin SELECT policy using the helper
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (public.is_admin_or_trainer());

-- 5. Recreate admin UPDATE policy using the helper (admin only)
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE USING (public.is_admin());
