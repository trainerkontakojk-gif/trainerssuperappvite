-- Rollback: practice_quota
-- DATA LOSS: drops the practice limit rules, per-user overrides and the usage
-- ledger. Revert the API and Telefun server first; with the tables gone every
-- practice start fails closed.

DROP FUNCTION IF EXISTS public.consume_practice_quota(uuid, text, text);
DROP FUNCTION IF EXISTS public.refund_practice_quota(uuid, text, text);
DROP TABLE IF EXISTS public.practice_usage;
DROP TABLE IF EXISTS public.practice_limit_overrides;
DROP TABLE IF EXISTS public.practice_limit_rules;

-- Restore the owner write policies from 003_telefun_core.sql.
DROP POLICY IF EXISTS "telefun_history_insert_own" ON public.telefun_history;
CREATE POLICY "telefun_history_insert_own" ON public.telefun_history
  FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "telefun_history_update_own" ON public.telefun_history;
CREATE POLICY "telefun_history_update_own" ON public.telefun_history
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
