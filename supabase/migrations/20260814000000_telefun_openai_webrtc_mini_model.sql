-- Telefun OpenAI WebRTC: add gpt-realtime-2.1-mini as an exact registry member.
--
-- Additive, fail-closed extension of the Full (gpt-realtime-2.1) path:
--   1. widen telefun_realtime_attempts.model_id check to the exact two-model
--      registry set {gpt-realtime-2.1, gpt-realtime-2.1-mini};
--   2. replace claim_telefun_realtime_attempt so it accepts the exact
--      two-model set and requires the claimed model to equal the persisted
--      telefun_history.telefun_model_id row.
--
-- The runtime allowed-model env gate (TELEFUN_OPENAI_WEBRTC_ALLOWED_MODEL_IDS)
-- is server-side only and is enforced before this RPC is called; SQL enforces
-- the shared registry set because env config is not visible to the database.
--
-- Transport-level constraints, lease RPCs, triggers, and grants for other
-- objects are intentionally untouched. Historical migrations are never edited.

ALTER TABLE public.telefun_realtime_attempts
  DROP CONSTRAINT IF EXISTS telefun_realtime_attempts_model_check;

ALTER TABLE public.telefun_realtime_attempts
  ADD CONSTRAINT telefun_realtime_attempts_model_check
  CHECK (model_id IN ('gpt-realtime-2.1', 'gpt-realtime-2.1-mini'));

-- Claim one pre-created, owned WebRTC session. The history row lock and the
-- unique session constraint make the one-attempt boundary atomic. The model
-- gate is the exact shared registry set and the claimed model must equal the
-- persisted history row model (never a JS constant). NULL params fail closed.
CREATE OR REPLACE FUNCTION public.claim_telefun_realtime_attempt(
  p_session_id UUID,
  p_user_id UUID,
  p_attempt_id UUID,
  p_model_id TEXT,
  p_transport TEXT
) RETURNS TABLE(
  claimed BOOLEAN,
  attempt_id UUID,
  finalization_key UUID,
  usage_request_id TEXT,
  state TEXT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_history_user_id UUID;
  v_history_status TEXT;
  v_history_model_id TEXT;
  v_history_transport TEXT;
  v_existing public.telefun_realtime_attempts%ROWTYPE;
  v_finalization_key UUID;
  v_usage_request_id TEXT := 'telefun-webrtc:' || p_attempt_id::text;
BEGIN
  SELECT h.user_id, h.status, h.telefun_model_id, h.telefun_transport
  INTO v_history_user_id, v_history_status, v_history_model_id, v_history_transport
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;

  IF v_history_user_id IS NULL
     OR v_history_user_id <> p_user_id
     OR v_history_status <> 'active'
     OR p_model_id IS NULL
     OR p_model_id NOT IN ('gpt-realtime-2.1', 'gpt-realtime-2.1-mini')
     OR p_transport IS DISTINCT FROM 'openai-webrtc'
     OR v_history_model_id IS DISTINCT FROM p_model_id
     OR v_history_transport IS DISTINCT FROM 'openai-webrtc' THEN
    RETURN QUERY SELECT false, NULL::uuid, NULL::uuid, NULL::text, NULL::text, 'session_rejected';
    RETURN;
  END IF;

  SELECT a.* INTO v_existing
  FROM public.telefun_realtime_attempts a
  WHERE a.session_id = p_session_id
  FOR UPDATE;

  IF FOUND THEN
    RETURN QUERY SELECT
      false,
      v_existing.id,
      v_existing.finalization_key,
      v_existing.usage_request_id,
      v_existing.state,
      CASE
        WHEN v_existing.state = 'ended' THEN 'attempt_exists_terminal'
        ELSE 'attempt_exists_active'
      END;
    RETURN;
  END IF;

  v_finalization_key := gen_random_uuid();
  INSERT INTO public.telefun_realtime_attempts (
    id, session_id, user_id, model_id, transport, state,
    finalization_key, usage_request_id
  ) VALUES (
    p_attempt_id, p_session_id, p_user_id, p_model_id, p_transport,
    'claimed', v_finalization_key, v_usage_request_id
  );

  RETURN QUERY SELECT
    true,
    p_attempt_id,
    v_finalization_key,
    v_usage_request_id,
    'claimed'::text,
    'claimed'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_telefun_realtime_attempt(UUID, UUID, UUID, TEXT, TEXT) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_telefun_realtime_attempt(UUID, UUID, UUID, TEXT, TEXT) TO service_role;
