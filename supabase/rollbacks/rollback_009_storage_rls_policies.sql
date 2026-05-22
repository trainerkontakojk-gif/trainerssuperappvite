-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 009_storage_rls_policies.sql
-- Description: Removes storage RLS policies for foto-avatar and export-reports
--              buckets (INSERT, SELECT, UPDATE, DELETE policies for each bucket).
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Dependency: Independently reversible
--   (Storage buckets themselves are not created by this migration, only policies)
--
-- No data loss: This migration only creates RLS policies on storage.objects.
--   Existing files in the buckets remain intact after policy removal.
--   NOTE: After rollback, storage access will be unrestricted by these policies.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop foto-avatar policies
DROP POLICY IF EXISTS "foto_avatar_insert" ON storage.objects;
DROP POLICY IF EXISTS "foto_avatar_select" ON storage.objects;
DROP POLICY IF EXISTS "foto_avatar_update" ON storage.objects;
DROP POLICY IF EXISTS "foto_avatar_delete" ON storage.objects;

-- 2. Drop export-reports policies
DROP POLICY IF EXISTS "export_reports_insert" ON storage.objects;
DROP POLICY IF EXISTS "export_reports_select" ON storage.objects;
DROP POLICY IF EXISTS "export_reports_update" ON storage.objects;
DROP POLICY IF EXISTS "export_reports_delete" ON storage.objects;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: All queries should return 0 rows
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT policyname AS policy_name, 'should not exist' AS status
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname IN (
    'foto_avatar_insert', 'foto_avatar_select', 'foto_avatar_update', 'foto_avatar_delete',
    'export_reports_insert', 'export_reports_select', 'export_reports_update', 'export_reports_delete'
  );
