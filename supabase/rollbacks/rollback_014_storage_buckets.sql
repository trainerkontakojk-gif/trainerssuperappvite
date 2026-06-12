-- Rollback: 014_storage_buckets
-- Removes the buckets created by migration 014.
-- WARNING: This rollback refuses to run while either bucket contains objects.
-- Back up and remove objects first:
--   DELETE FROM storage.objects WHERE bucket_id = 'foto-avatar';
--   DELETE FROM storage.objects WHERE bucket_id = 'export-reports';

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM storage.objects
    WHERE bucket_id IN ('foto-avatar', 'export-reports')
  ) THEN
    RAISE EXCEPTION
      'Cannot rollback migration 014: foto-avatar or export-reports still contains objects';
  END IF;
END;
$$;

DELETE FROM storage.buckets
WHERE id IN ('foto-avatar', 'export-reports');

COMMIT;

-- Verification
SELECT id, name
FROM storage.buckets
WHERE id IN ('foto-avatar', 'export-reports');
