DROP POLICY IF EXISTS trainer_activities_admin_trainer_delete
  ON public.trainer_activities;
DROP POLICY IF EXISTS trainer_activities_admin_trainer_update
  ON public.trainer_activities;
DROP POLICY IF EXISTS trainer_activities_admin_trainer_insert
  ON public.trainer_activities;
DROP POLICY IF EXISTS trainer_activities_admin_trainer_read
  ON public.trainer_activities;
DROP POLICY IF EXISTS trainer_activities_public_read
  ON public.trainer_activities;
DROP TRIGGER IF EXISTS trainer_activities_set_updated_at
  ON public.trainer_activities;
DROP TABLE IF EXISTS public.trainer_activities;

-- Supabase blocks direct DELETEs from storage.buckets. After this SQL, delete
-- the empty bucket through Storage API deleteBucket; it refuses non-empty buckets.
-- Do not delete storage.objects directly, because that can orphan stored files.
