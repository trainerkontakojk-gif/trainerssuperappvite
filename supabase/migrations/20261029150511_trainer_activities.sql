CREATE TABLE public.trainer_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL CHECK (year BETWEEN 2020 AND 2100),
  program text NOT NULL CHECK (program IN ('sobat', 'ketik', 'telefun', 'pdkt', 'ceriwis')),
  kind text NOT NULL CHECK (kind IN ('poster', 'foto')),
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 120),
  event_date date,
  image_url text NOT NULL,
  drive_url text NOT NULL CHECK (drive_url ~ '^https://(drive|docs)\.google\.com/'),
  sort_order integer NOT NULL DEFAULT 0,
  is_published boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX trainer_activities_year_program_sort_order_idx
  ON public.trainer_activities (year, program, sort_order);

CREATE TRIGGER trainer_activities_set_updated_at
  BEFORE UPDATE ON public.trainer_activities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.trainer_activities ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.trainer_activities FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.trainer_activities TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON TABLE public.trainer_activities TO authenticated;
GRANT ALL ON TABLE public.trainer_activities TO service_role;

CREATE POLICY trainer_activities_public_read
  ON public.trainer_activities
  FOR SELECT TO anon, authenticated
  USING (is_published);

CREATE POLICY trainer_activities_admin_trainer_read
  ON public.trainer_activities
  FOR SELECT TO authenticated
  USING (public.is_admin_or_trainer());

CREATE POLICY trainer_activities_admin_trainer_insert
  ON public.trainer_activities
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin_or_trainer());

CREATE POLICY trainer_activities_admin_trainer_update
  ON public.trainer_activities
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_trainer())
  WITH CHECK (public.is_admin_or_trainer());

CREATE POLICY trainer_activities_admin_trainer_delete
  ON public.trainer_activities
  FOR DELETE TO authenticated
  USING (public.is_admin_or_trainer());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'trainer-activity-media',
  'trainer-activity-media',
  true,
  5242880,
  ARRAY['image/png', 'image/jpeg', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
