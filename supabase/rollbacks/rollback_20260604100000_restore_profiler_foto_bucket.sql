-- ═══════════════════════════════════════════════════════════════════════════════
-- ROLLBACK: 20260604100000_restore_profiler_foto_bucket.sql
-- Description: Reverses the profiler-foto bucket restoration by dropping the
--              3 RLS policies and the bucket introduced by this migration.
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- DATA LOSS WARNING: Removing the bucket can remove or orphan stored objects,
-- depending on the storage schema's foreign-key behavior. Back up files first.
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Drop the 3 RLS policies added by migration 20260604100000
DROP POLICY IF EXISTS "Public can read profiler photos" ON storage.objects;
DROP POLICY IF EXISTS "Trainers can upload profiler photos" ON storage.objects;
DROP POLICY IF EXISTS "Trainers can update profiler photos" ON storage.objects;

-- 2. Remove the bucket because it did not exist earlier in the migration chain.
DELETE FROM storage.buckets
WHERE id = 'profiler-foto';

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION QUERY
-- Expected: all queries return 0 rows.
-- ═══════════════════════════════════════════════════════════════════════════════
SELECT 'POLICY Public can read profiler photos' AS object_type, COUNT(*) AS exists_count
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'Public can read profiler photos'
UNION ALL
SELECT 'POLICY Trainers can upload profiler photos', COUNT(*)
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'Trainers can upload profiler photos'
UNION ALL
SELECT 'POLICY Trainers can update profiler photos', COUNT(*)
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
  AND policyname = 'Trainers can update profiler photos'
UNION ALL
SELECT 'BUCKET profiler-foto', COUNT(*)
FROM storage.buckets
WHERE id = 'profiler-foto';
