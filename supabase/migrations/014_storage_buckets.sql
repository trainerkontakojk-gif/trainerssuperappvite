-- 014: Storage Bucket Creation
-- Creates the required storage buckets if they don't already exist.
-- Configuration for MIME types and size limits is also enforced by RLS in 009.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  (
    'foto-avatar', 
    'foto-avatar', 
    false, 
    5242880, 
    '{image/jpeg,image/png,image/webp}'
  ),
  (
    'export-reports', 
    'export-reports', 
    false, 
    20971520, 
    '{application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document}'
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
