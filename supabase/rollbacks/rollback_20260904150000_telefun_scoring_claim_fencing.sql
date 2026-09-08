-- Rollback for 20260904150000_telefun_scoring_claim_fencing.sql
-- Run only after all tokenized claims have settled and the embedded worker is
-- disabled. Existing legacy RPC signatures and lifecycle columns are retained.
-- The table lock closes claim admission while the active-claim check and DDL
-- run in one transaction.

BEGIN;

-- ACCESS EXCLUSIVE conflicts with claim RPC row locks and with new claim
-- admission. Once acquired, no claim can enter between this check and DDL.
LOCK TABLE public.telefun_history IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  v_active_tokenized_claims INT;
BEGIN
  SELECT count(*) INTO v_active_tokenized_claims
  FROM public.telefun_history
  WHERE scoring_status = 'processing'
    AND scoring_claim_token_hash IS NOT NULL;

  IF v_active_tokenized_claims > 0 THEN
    RAISE EXCEPTION
      'rollback blocked: % processing row(s) still carry scoring_claim_token_hash; settle tokenized claims and disable the worker first',
      v_active_tokenized_claims
    USING ERRCODE = '55000';
  END IF;
END;
$$;

-- Restore the effective pre-fencing functions before dropping the fencing
-- columns. These are the Phase 4 claim/completion bodies plus the latest retry
-- queue failure/reschedule semantics from the repair migration.
CREATE OR REPLACE FUNCTION public.claim_telefun_scoring(
  p_session_id UUID,
  p_claim_timeout_seconds INT DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status TEXT;
  v_claimed_at TIMESTAMPTZ;
  v_next_attempt TIMESTAMPTZ;
  v_transport TEXT;
  v_session_status TEXT;
  v_scoring_ready_at TIMESTAMPTZ;
  v_agent_path TEXT;
  v_user_id UUID;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT h.scoring_status, h.scoring_claimed_at, h.scoring_next_attempt_at,
         h.telefun_transport, h.status, h.scoring_ready_at,
         h.agent_recording_path, h.user_id
  INTO v_current_status, v_claimed_at, v_next_attempt,
       v_transport, v_session_status, v_scoring_ready_at,
       v_agent_path, v_user_id
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN RETURN FALSE; END IF;
  IF v_current_status = 'completed' THEN RETURN FALSE; END IF;
  IF v_transport = 'openai-webrtc' AND (
    v_session_status <> 'completed'
    OR v_scoring_ready_at IS NULL
    OR v_agent_path IS NULL
    OR v_agent_path !~ ('^' || v_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$')
  ) THEN RETURN FALSE; END IF;
  IF v_current_status = 'processing' THEN
    IF v_claimed_at IS NOT NULL AND
       (v_now - v_claimed_at) < make_interval(secs => p_claim_timeout_seconds) THEN
      RETURN FALSE;
    END IF;
  END IF;
  IF v_current_status IN ('pending', 'failed') AND v_next_attempt IS NOT NULL AND v_next_attempt > v_now THEN
    RETURN FALSE;
  END IF;

  UPDATE public.telefun_history
  SET scoring_status = 'processing',
      scoring_claimed_at = v_now,
      scoring_attempt_count = COALESCE(scoring_attempt_count, 0) + 1,
      scoring_last_error = NULL,
      scoring_next_attempt_at = NULL
  WHERE id = p_session_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_telefun_scoring(
  p_session_id UUID,
  p_score NUMERIC,
  p_voice_assessment JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id UUID;
  v_user_id UUID;
  v_status TEXT;
  v_transport TEXT;
  v_recording_status TEXT;
  v_recording_error TEXT;
  v_scoring_status TEXT;
  v_scoring_ready_at TIMESTAMPTZ;
  v_agent_recording_path TEXT;
BEGIN
  SELECT h.id,
         h.user_id,
         h.status,
         h.telefun_transport,
         h.recording_status,
         h.recording_error,
         h.scoring_status,
         h.scoring_ready_at,
         h.agent_recording_path
  INTO v_id,
       v_user_id,
       v_status,
       v_transport,
       v_recording_status,
       v_recording_error,
       v_scoring_status,
       v_scoring_ready_at,
       v_agent_recording_path
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_id IS NULL OR v_scoring_status <> 'processing' THEN
    RETURN FALSE;
  END IF;

  IF v_transport IS DISTINCT FROM 'openai-webrtc' THEN
    -- Gemini and legacy OpenAI WebSocket rows retain the prior raw-agent-path
    -- completion behavior; the lock only makes the existing claim deterministic.
    NULL;
  ELSIF v_status <> 'completed'
     OR v_recording_status IS NULL
     OR v_recording_status NOT IN ('partial', 'ready')
     OR v_recording_status = 'failed'
     OR v_recording_error IS NOT NULL
     OR v_scoring_ready_at IS NULL
     OR v_agent_recording_path IS DISTINCT FROM
       v_user_id::text || '/' || p_session_id::text || '/agent_only.seekable.webm' THEN
    RETURN FALSE;
  END IF;

  UPDATE public.telefun_history
  SET scoring_status = 'completed',
      scoring_completed_at = now(),
      score = p_score,
      voice_assessment = COALESCE(p_voice_assessment, voice_assessment)
  WHERE id = p_session_id
    AND scoring_status = 'processing';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_telefun_scoring(
  p_session_id UUID,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.telefun_history
  SET
    scoring_status = 'failed',
    scoring_last_error = p_error
  WHERE id = p_session_id
    AND scoring_status = 'processing';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_telefun_scoring(
  p_session_id UUID,
  p_error TEXT,
  p_next_attempt_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.telefun_history
  SET
    scoring_status = 'failed',
    scoring_last_error = p_error,
    scoring_next_attempt_at = p_next_attempt_at
  WHERE id = p_session_id
    AND scoring_status IN ('processing', 'failed');

  RETURN FOUND;
END;
$$;

-- CREATE OR REPLACE preserves ACLs; restate the baseline grants explicitly so
-- the rollback remains service-role-only even after a partial/manual apply.
REVOKE ALL ON FUNCTION public.claim_telefun_scoring(UUID, INT)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_telefun_scoring(UUID, TEXT)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ)
  FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_telefun_scoring(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ) TO service_role;

DROP FUNCTION IF EXISTS public.claim_telefun_scoring(UUID, INT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.complete_telefun_scoring(UUID, NUMERIC, JSONB, TEXT);
DROP FUNCTION IF EXISTS public.fail_telefun_scoring(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ, TEXT);

DROP INDEX IF EXISTS public.idx_telefun_scoring_claim_token_hash;
ALTER TABLE public.telefun_history
  DROP COLUMN IF EXISTS scoring_claim_token_hash,
  DROP COLUMN IF EXISTS scoring_claim_owner;

NOTIFY pgrst, 'reload schema';

COMMIT;
