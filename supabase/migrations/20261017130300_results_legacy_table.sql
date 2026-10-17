-- Capture the prod-only legacy `results` table.
--
-- Prod keeps old Telefun sessions in `results`, and the monitoring review
-- detail still reads them when an id is not in telefun_history. No repo
-- migration created the table (phase-37 parity audit; prod readback
-- 2026-10-17), so that path always failed locally and in E2E.
--
-- Columns, constraints and indexes match prod. Differences on purpose:
-- - update_results_updated_at is dropped, not created: `results` has no
--   updated_at column, so on prod that trigger makes every UPDATE fail.
-- - Access is backend-only (service role). anon loses all grants and
--   authenticated keeps SELECT on its own rows. The duplicate own-row
--   policies and the 'Trainer'/'Leader' policies are dropped: they call
--   get_auth_role(), which the repo does not have, and compare capitalised
--   role names that profiles no longer uses.
-- Idempotent: on prod this keeps the table and its rows.

CREATE TABLE IF NOT EXISTS public.results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL,
  scenario_title text,
  score integer NOT NULL,
  feedback text,
  history jsonb,
  created_at timestamptz NOT NULL DEFAULT timezone('utc'::text, now()),
  details jsonb DEFAULT '{}'::jsonb,
  CONSTRAINT results_pkey PRIMARY KEY (id),
  CONSTRAINT results_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES public.profiles(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_results_created_at ON public.results USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_results_module ON public.results USING btree (module);
CREATE INDEX IF NOT EXISTS idx_results_user_id ON public.results USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_results_user_module ON public.results USING btree (user_id, module);

DROP TRIGGER IF EXISTS update_results_updated_at ON public.results;

ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leaders can view all results" ON public.results;
DROP POLICY IF EXISTS "Trainers can view all results" ON public.results;
DROP POLICY IF EXISTS "Users can delete their own results" ON public.results;
DROP POLICY IF EXISTS "Users can insert own results" ON public.results;
DROP POLICY IF EXISTS "Users can insert their own results" ON public.results;
DROP POLICY IF EXISTS "Users can view their own results" ON public.results;
DROP POLICY IF EXISTS "Users can view own results" ON public.results;
CREATE POLICY "Users can view own results" ON public.results
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

REVOKE ALL ON TABLE public.results FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.results TO authenticated;
GRANT ALL ON TABLE public.results TO service_role;
