-- 009: Storage RLS Policies for foto-avatar and export-reports buckets
-- Enforces owner-path access, MIME type restrictions, file size limits,
-- and role-based read/delete access for admin/trainer roles.

-- =============================================================================
-- BUCKET: foto-avatar
-- Allowed MIME: image/jpeg, image/png, image/webp
-- Max size: 5 MB (5242880 bytes)
-- =============================================================================

-- INSERT: Owner can upload to their own folder with MIME/size checks
DROP POLICY IF EXISTS "foto_avatar_insert" ON storage.objects;
CREATE POLICY "foto_avatar_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'foto-avatar'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (metadata->>'mimetype') IN ('image/jpeg', 'image/png', 'image/webp')
    AND (metadata->>'size')::int <= 5242880
  );

-- SELECT: Owner OR admin/trainer can read
DROP POLICY IF EXISTS "foto_avatar_select" ON storage.objects;
CREATE POLICY "foto_avatar_select" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'foto-avatar'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'trainer')
      )
    )
  );

-- UPDATE: Owner only can overwrite their own files
DROP POLICY IF EXISTS "foto_avatar_update" ON storage.objects;
CREATE POLICY "foto_avatar_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'foto-avatar'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'foto-avatar'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (metadata->>'mimetype') IN ('image/jpeg', 'image/png', 'image/webp')
    AND (metadata->>'size')::int <= 5242880
  );

-- DELETE: Owner OR admin can delete
DROP POLICY IF EXISTS "foto_avatar_delete" ON storage.objects;
CREATE POLICY "foto_avatar_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'foto-avatar'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );

-- =============================================================================
-- BUCKET: export-reports
-- Allowed MIME: application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document
-- Max size: 20 MB (20971520 bytes)
-- =============================================================================

-- INSERT: Owner can upload to their own folder with MIME/size checks
DROP POLICY IF EXISTS "export_reports_insert" ON storage.objects;
CREATE POLICY "export_reports_insert" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'export-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (metadata->>'mimetype') IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    AND (metadata->>'size')::int <= 20971520
  );

-- SELECT: Owner OR admin/trainer can read
DROP POLICY IF EXISTS "export_reports_select" ON storage.objects;
CREATE POLICY "export_reports_select" ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'export-reports'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'trainer')
      )
    )
  );

-- UPDATE: Owner only can overwrite their own files
DROP POLICY IF EXISTS "export_reports_update" ON storage.objects;
CREATE POLICY "export_reports_update" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'export-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'export-reports'
    AND (storage.foldername(name))[1] = auth.uid()::text
    AND (metadata->>'mimetype') IN (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
    AND (metadata->>'size')::int <= 20971520
  );

-- DELETE: Owner OR admin can delete
DROP POLICY IF EXISTS "export_reports_delete" ON storage.objects;
CREATE POLICY "export_reports_delete" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'export-reports'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
      )
    )
  );
