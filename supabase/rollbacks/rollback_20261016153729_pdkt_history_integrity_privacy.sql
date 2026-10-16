-- SECURITY: restores direct owner history inserts and private JSON reads.
-- The projected API read path remains compatible. No data is removed.
BEGIN;
GRANT SELECT, INSERT, UPDATE ON public.pdkt_history TO anon, authenticated;
DROP POLICY IF EXISTS pdkt_history_insert_own ON public.pdkt_history;
CREATE POLICY pdkt_history_insert_own ON public.pdkt_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
COMMIT;
