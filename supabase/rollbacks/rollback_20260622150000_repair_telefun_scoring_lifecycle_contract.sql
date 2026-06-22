-- Rollback for 20260622150000_repair_telefun_scoring_lifecycle_contract.sql
-- DATA LOSS WARNING: run only after reverting the API and backing up scoring data.

BEGIN;

DROP INDEX IF EXISTS public.idx_telefun_scoring_retry_queue;
DROP INDEX IF EXISTS public.idx_telefun_scoring_claimed_at;
DROP INDEX IF EXISTS public.idx_telefun_scoring_status;

DROP FUNCTION IF EXISTS public.enqueue_telefun_scoring(UUID);
DROP FUNCTION IF EXISTS public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.fail_telefun_scoring(UUID, TEXT);
DROP FUNCTION IF EXISTS public.complete_telefun_scoring(UUID, NUMERIC, JSONB);
DROP FUNCTION IF EXISTS public.claim_telefun_scoring(UUID, INT);

ALTER TABLE public.telefun_history
  DROP CONSTRAINT IF EXISTS telefun_history_scoring_status_check,
  DROP COLUMN IF EXISTS scoring_next_attempt_at,
  DROP COLUMN IF EXISTS scoring_last_error,
  DROP COLUMN IF EXISTS scoring_attempt_count,
  DROP COLUMN IF EXISTS scoring_completed_at,
  DROP COLUMN IF EXISTS scoring_claimed_at,
  DROP COLUMN IF EXISTS scoring_status;

NOTIFY pgrst, 'reload schema';

COMMIT;
