-- Restore canonical KTP/Profiler photo bucket parity.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'profiler-foto',
  'profiler-foto',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Public can read profiler photos" ON storage.objects;
CREATE POLICY "Public can read profiler photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'profiler-foto');

DROP POLICY IF EXISTS "Trainers can upload profiler photos" ON storage.objects;
CREATE POLICY "Trainers can upload profiler photos" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'profiler-foto'
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('trainer', 'trainers', 'admin')
        AND COALESCE(profiles.is_deleted, false) = false
        AND COALESCE(profiles.status, 'active') = 'active'
    )
  );

DROP POLICY IF EXISTS "Trainers can update profiler photos" ON storage.objects;
CREATE POLICY "Trainers can update profiler photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'profiler-foto'
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('trainer', 'trainers', 'admin')
        AND COALESCE(profiles.is_deleted, false) = false
        AND COALESCE(profiles.status, 'active') = 'active'
    )
  )
  WITH CHECK (
    bucket_id = 'profiler-foto'
    AND EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('trainer', 'trainers', 'admin')
        AND COALESCE(profiles.is_deleted, false) = false
        AND COALESCE(profiles.status, 'active') = 'active'
    )
  );
