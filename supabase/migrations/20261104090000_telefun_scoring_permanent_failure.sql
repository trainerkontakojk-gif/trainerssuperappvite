-- Telefun scoring: permanent failures leave the retry queue.
-- Plan: plans/markdown/telefun-scoring-permanent-failure.md
--
-- A permanent scoring failure (for example agent speech that is too short)
-- previously looked like any other failed row with a null retry date, so the
-- worker re-claimed it until the attempt budget ran out, paying for a new
-- Gemini transcription each time. The marker below lets the queue skip it.

BEGIN;

ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS scoring_failed_permanently boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.telefun_history.scoring_failed_permanently IS
  'True only while scoring_status = failed after a permanent scoring error; the worker queue skips these rows. Cleared by trigger on any other scoring_status.';

-- Any write that leaves scoring_status other than 'failed' (claim, enqueue,
-- complete, rerun restore) clears the marker, so a later transient failure or
-- reschedule never inherits it. No existing RPC needs to change.
CREATE OR REPLACE FUNCTION app_internal.telefun_clear_permanent_scoring_failure()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
BEGIN
  IF NEW.scoring_status IS DISTINCT FROM 'failed' THEN
    NEW.scoring_failed_permanently := false;
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION app_internal.telefun_clear_permanent_scoring_failure()
  FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS telefun_history_clear_permanent_scoring_failure
  ON public.telefun_history;
CREATE TRIGGER telefun_history_clear_permanent_scoring_failure
  BEFORE INSERT OR UPDATE ON public.telefun_history
  FOR EACH ROW
  EXECUTE FUNCTION app_internal.telefun_clear_permanent_scoring_failure();

-- Same claim-token fence as fail_telefun_scoring(uuid,text,text), plus the marker.
CREATE OR REPLACE FUNCTION public.fail_telefun_scoring_permanently(
  p_session_id uuid,
  p_error text,
  p_claim_token_hash text
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app_internal.assert_service_role();
  UPDATE public.telefun_history
  SET scoring_status = 'failed',
      scoring_last_error = p_error,
      scoring_failed_permanently = true,
      scoring_claim_token_hash = NULL,
      scoring_claim_owner = NULL
  WHERE id = p_session_id
    AND scoring_status = 'processing'
    AND p_claim_token_hash IS NOT NULL
    AND scoring_claim_token_hash IS NOT DISTINCT FROM p_claim_token_hash;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.fail_telefun_scoring_permanently(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_telefun_scoring_permanently(uuid, text, text)
  TO service_role;

COMMIT;
