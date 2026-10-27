BEGIN;

-- Administrative retirement is deliberately separate from a scoring claim:
-- it does not admit a provider call, increment attempts, or weaken capture gates.
CREATE OR REPLACE FUNCTION public.retire_telefun_openai_scoring(
  p_session_id uuid,
  p_expected_scoring_status text DEFAULT NULL::text,
  p_expected_voice_assessment jsonb DEFAULT NULL::jsonb
)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_session public.telefun_history%ROWTYPE;
  v_now TIMESTAMPTZ := now();
  v_disabled_reason CONSTANT TEXT := 'Penilaian OpenAI Realtime tidak lagi tersedia untuk Telefun.';
BEGIN
  PERFORM app_internal.assert_service_role();

  SELECT h.* INTO v_session
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Mirror isRetiredTelefunOpenAiRealtimeSelection: exact historical IDs,
  -- the retired realtime prefix, and either retired transport are terminal.
  IF NOT COALESCE(
    v_session.telefun_model_id IN (
      'gpt-realtime-2.1',
      'gpt-realtime-2.1-mini'
    )
    OR v_session.telefun_model_id LIKE 'gpt-realtime-%'
    OR v_session.telefun_transport IN ('openai-audio', 'openai-webrtc'),
    FALSE
  ) THEN
    RETURN FALSE;
  END IF;

  IF v_session.status IS DISTINCT FROM 'completed'
     AND v_session.status IS DISTINCT FROM 'failed' THEN
    RETURN FALSE;
  END IF;

  -- Preserve completed assessments independently of caller snapshots, even
  -- when the stored JSON is malformed. The expected arguments remain only for
  -- signature compatibility and never authorize downgrading completed history.
  IF v_session.scoring_status = 'completed'
     AND v_session.voice_assessment IS NOT NULL THEN
    RETURN FALSE;
  END IF;

  -- Leave scheduled work alone until its retry time, and do not revoke a live
  -- 300-second scoring claim. A stale processing claim is safe to fence below.
  IF v_session.scoring_next_attempt_at IS NOT NULL
     AND v_session.scoring_next_attempt_at > v_now THEN
    RETURN FALSE;
  END IF;
  IF v_session.scoring_status = 'processing'
     AND v_session.scoring_claimed_at > v_now - INTERVAL '300 seconds' THEN
    RETURN FALSE;
  END IF;

  -- Idempotent success only for the exact already-retired durable state.
  IF v_session.scoring_status = 'failed'
     AND v_session.scoring_last_error = v_disabled_reason
     AND v_session.scoring_next_attempt_at IS NULL
     AND v_session.scoring_claimed_at IS NULL
     AND v_session.scoring_claim_token_hash IS NULL
     AND v_session.scoring_claim_owner IS NULL THEN
    RETURN TRUE;
  END IF;

  UPDATE public.telefun_history
  SET scoring_status = 'failed',
      scoring_last_error = v_disabled_reason,
      scoring_next_attempt_at = NULL,
      scoring_claimed_at = NULL,
      scoring_claim_token_hash = NULL,
      scoring_claim_owner = NULL
  WHERE id = p_session_id;

  RETURN FOUND;
END;
$function$;

REVOKE ALL ON FUNCTION public.retire_telefun_openai_scoring(UUID, TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retire_telefun_openai_scoring(UUID, TEXT, JSONB)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
