-- 008: Admin/Trainer Read & Update Policies for profiles
-- Defense-in-depth: allow admin/trainer to read/update any profile via RLS
-- (Backend already uses service_role, but this enables direct user JWT access)

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Ensure is_deleted column exists (defined before GRANT that references it)
-- Idempotent: migration 20260520054101 also adds this with IF NOT EXISTS
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer'))
  );

DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
CREATE POLICY "profiles_update_admin" ON public.profiles
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'trainer'))
  );

GRANT SELECT (id, email, role, full_name, is_deleted, created_at, updated_at) ON public.profiles TO authenticated;
GRANT UPDATE (role, is_deleted) ON public.profiles TO authenticated;
