-- SECURITY WARNING: this rollback reopens direct owner inserts of arbitrary
-- scores/review status. Use only for an explicitly approved rollback.
BEGIN;

DROP POLICY IF EXISTS "ketik_history_insert_own" ON public.ketik_history;
CREATE POLICY "ketik_history_insert_own" ON public.ketik_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);

COMMIT;
