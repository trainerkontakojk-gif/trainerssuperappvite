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

ALTER POLICY "Users read own telefun recordings" ON storage.objects
  USING (bucket_id = 'telefun-recordings' AND (
    (storage.foldername(name))[1] = auth.uid()::text OR EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','trainer')
    )
  ));
ALTER POLICY "Users can view their own coaching summaries" ON public.telefun_coaching_summary
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','trainer')
  ));
ALTER POLICY "Users can view their own replay annotations" ON public.telefun_replay_annotations
  USING (auth.uid() = user_id OR EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','trainer')
  ));
