-- 016: Harden Profiles RLS and Grants
-- Prevents users from escalating their own roles or status.

-- 1. Revoke broad update grants from authenticated users
REVOKE UPDATE ON public.profiles FROM authenticated;

-- 2. Grant update only on non-sensitive columns to authenticated users
-- This allows users to update their own profile info (name) but not their role/status.
GRANT UPDATE (full_name) ON public.profiles TO authenticated;

-- 3. Ensure service_role (used by backend) can still update everything
GRANT ALL ON public.profiles TO service_role;

-- 4. Review and tighten UPDATE policy for profiles
-- Users can update their own profile, but they are limited by the GRANT above to only specific columns.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 5. Ensure admins can update any profile (via RLS if they use direct client)
-- Since they are "authenticated", they are also limited by the GRANT above 
-- UNLESS we give them a specific GRANT or they use the Backend API.
-- The Backend API uses service_role, so it's already covered.
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Note: 'trainer' role is removed from profiles_update_admin as per "admin-only" decision.
