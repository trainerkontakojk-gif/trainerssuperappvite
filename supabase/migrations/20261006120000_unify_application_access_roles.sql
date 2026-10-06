-- Apply only after the profile role audit is clean. Remote application is separate.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE role NOT IN ('admin','trainer','leader','agent')) THEN
    RAISE EXCEPTION 'Role audit required: unsupported profile role exists';
  END IF;
END $$;

ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'agent';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin','trainer','leader','agent'));

-- Signup must use the canonical default rather than the retired literal user.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, status)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name', 'pending');
  RETURN NEW;
END;
$$;

-- Telefun policies that still list 'qa' are intentionally left untouched: the
-- CHECK above makes role 'qa' impossible, so role IN ('admin','trainer','qa')
-- already equals role IN ('admin','trainer'). Remote preflight (2026-10-06)
-- found two of those policies missing and storage.objects owned by
-- supabase_storage_admin, so ALTER POLICY would only block the apply.
