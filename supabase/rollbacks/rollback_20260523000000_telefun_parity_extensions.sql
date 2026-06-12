-- ROLLBACK: 20260523000000_telefun_parity_extensions.sql
--
-- Restores the Telefun schema and policies from 005_carbon_copy_parity.sql.
-- The bucket, history columns, and both supporting tables already existed
-- before this migration, so they must not be dropped here.

BEGIN;

-- 1. Restore the storage policies from migration 005.
DROP POLICY IF EXISTS "Users upload own telefun recordings" ON storage.objects;
CREATE POLICY "Users upload own telefun recordings" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (
    bucket_id = 'telefun-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users read own telefun recordings" ON storage.objects;
CREATE POLICY "Users read own telefun recordings" ON storage.objects
  FOR SELECT TO authenticated USING (
    bucket_id = 'telefun-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own telefun recordings" ON storage.objects;
CREATE POLICY "Users update own telefun recordings" ON storage.objects
  FOR UPDATE TO authenticated USING (
    bucket_id = 'telefun-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'telefun-recordings'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own telefun recordings" ON storage.objects;

-- 2. Restore the original coaching-summary policy and privileges.
DROP POLICY IF EXISTS "Users can view their own coaching summaries"
  ON public.telefun_coaching_summary;
CREATE POLICY "Users can view their own coaching summaries"
  ON public.telefun_coaching_summary
  FOR SELECT
  USING (auth.uid() = user_id);

REVOKE SELECT ON public.telefun_coaching_summary FROM authenticated;

-- 3. Restore the original replay-annotation policies and privileges.
DROP POLICY IF EXISTS "Users can view their own replay annotations"
  ON public.telefun_replay_annotations;
CREATE POLICY "Users can view their own replay annotations"
  ON public.telefun_replay_annotations
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own replay annotations"
  ON public.telefun_replay_annotations;
CREATE POLICY "Users can insert their own replay annotations"
  ON public.telefun_replay_annotations
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND is_manual = true
    AND EXISTS (
      SELECT 1
      FROM public.telefun_history
      WHERE id = session_id
        AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete their own replay annotations"
  ON public.telefun_replay_annotations;
CREATE POLICY "Users can delete their own replay annotations"
  ON public.telefun_replay_annotations
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

REVOKE SELECT, INSERT, DELETE
  ON public.telefun_replay_annotations
  FROM authenticated;

-- 4. Remove only indexes introduced by this migration.
DROP INDEX IF EXISTS public.idx_telefun_coaching_summary_user_id;
DROP INDEX IF EXISTS public.idx_telefun_coaching_summary_session_id;
DROP INDEX IF EXISTS public.idx_telefun_replay_annotations_session_id;
DROP INDEX IF EXISTS public.idx_telefun_replay_annotations_user_id;

-- 5. Remove only the 4-argument overload introduced by this migration.
DROP FUNCTION IF EXISTS public.upsert_telefun_coaching_summary(
  UUID,
  JSONB,
  INTEGER,
  TEXT
);

COMMIT;

-- Verification:
--   false = 4-argument overload removed
--   true  = pre-existing tables and history columns preserved
SELECT
  to_regprocedure(
    'public.upsert_telefun_coaching_summary(uuid,jsonb,integer,text)'
  ) IS NOT NULL AS four_argument_function_exists,
  to_regclass('public.telefun_coaching_summary') IS NOT NULL
    AS coaching_summary_table_preserved,
  to_regclass('public.telefun_replay_annotations') IS NOT NULL
    AS replay_annotations_table_preserved,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'telefun_history'
      AND column_name = 'recording_path'
  ) AS history_columns_preserved;
