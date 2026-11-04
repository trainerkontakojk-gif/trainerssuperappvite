-- Rollback: 20261104090000_telefun_scoring_permanent_failure.sql
-- Revert the API first: it calls fail_telefun_scoring_permanently and filters
-- the queue on scoring_failed_permanently.
-- Data loss: only the permanent-failure marker. Those rows become eligible for
-- automatic retry again until their attempt budget is used up.

BEGIN;

DROP FUNCTION IF EXISTS public.fail_telefun_scoring_permanently(uuid, text, text);

DROP TRIGGER IF EXISTS telefun_history_clear_permanent_scoring_failure
  ON public.telefun_history;
DROP FUNCTION IF EXISTS app_internal.telefun_clear_permanent_scoring_failure();

ALTER TABLE public.telefun_history
  DROP COLUMN IF EXISTS scoring_failed_permanently;

COMMIT;
