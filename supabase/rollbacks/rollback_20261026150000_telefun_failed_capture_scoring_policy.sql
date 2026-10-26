BEGIN;

DROP FUNCTION IF EXISTS app_internal.telefun_capture_scoring_ready(uuid);

CREATE OR REPLACE FUNCTION public.claim_telefun_scoring(p_session_id uuid, p_claim_timeout_seconds integer, p_claim_token_hash text, p_claim_owner text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  PERFORM app_internal.assert_service_role();
  IF p_claim_timeout_seconds IS NULL OR p_claim_timeout_seconds < 300
     OR p_claim_token_hash IS NULL OR p_claim_token_hash = ''
     OR p_claim_owner IS NULL OR p_claim_owner = '' THEN
    RETURN FALSE;
  END IF;
  SELECT h.scoring_status, h.scoring_claimed_at, h.scoring_next_attempt_at,
         h.telefun_transport, h.status, h.scoring_ready_at,
         h.agent_recording_path, h.user_id
  INTO v_current_status, v_claimed_at, v_next_attempt, v_transport,
       v_session_status, v_scoring_ready_at, v_agent_path, v_user_id
  FROM public.telefun_history h WHERE h.id = p_session_id FOR UPDATE;
  IF v_current_status IS NULL OR v_current_status = 'completed' THEN RETURN FALSE; END IF;
  IF v_transport = 'openai-webrtc' AND (
    v_session_status <> 'completed' OR v_scoring_ready_at IS NULL
    OR v_agent_path IS NULL
    OR v_agent_path !~ ('^' || v_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$')
  ) THEN RETURN FALSE; END IF;
  IF v_current_status = 'processing' AND v_claimed_at IS NOT NULL
     AND (v_now - v_claimed_at) < make_interval(secs => p_claim_timeout_seconds) THEN RETURN FALSE; END IF;
  IF v_current_status IN ('pending', 'failed') AND v_next_attempt IS NOT NULL
     AND v_next_attempt > v_now THEN RETURN FALSE; END IF;
  UPDATE public.telefun_history
  SET scoring_status = 'processing', scoring_claimed_at = v_now,
      scoring_claim_token_hash = p_claim_token_hash, scoring_claim_owner = p_claim_owner,
      scoring_attempt_count = COALESCE(scoring_attempt_count, 0) + 1,
      scoring_last_error = NULL, scoring_next_attempt_at = NULL
  WHERE id = p_session_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_telefun_scoring(p_session_id uuid, p_claim_timeout_seconds integer DEFAULT 300)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_current_status TEXT;
  v_claimed_at TIMESTAMPTZ;
  v_next_attempt TIMESTAMPTZ;
  v_transport TEXT;
  v_session_status TEXT;
  v_scoring_ready_at TIMESTAMPTZ;
  v_agent_path TEXT;
  v_user_id UUID;
  v_effective_timeout INT;
  v_now TIMESTAMPTZ := now();
BEGIN
  PERFORM app_internal.assert_service_role();
  v_effective_timeout := GREATEST(COALESCE(p_claim_timeout_seconds, 300), 300);
  SELECT h.scoring_status, h.scoring_claimed_at, h.scoring_next_attempt_at,
         h.telefun_transport, h.status, h.scoring_ready_at,
         h.agent_recording_path, h.user_id
  INTO v_current_status, v_claimed_at, v_next_attempt, v_transport,
       v_session_status, v_scoring_ready_at, v_agent_path, v_user_id
  FROM public.telefun_history h WHERE h.id = p_session_id FOR UPDATE;
  IF v_current_status IS NULL OR v_current_status = 'completed' THEN RETURN FALSE; END IF;
  IF v_transport = 'openai-webrtc' AND (
    v_session_status <> 'completed' OR v_scoring_ready_at IS NULL
    OR v_agent_path IS NULL
    OR v_agent_path !~ ('^' || v_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$')
  ) THEN RETURN FALSE; END IF;
  IF v_current_status = 'processing' AND v_claimed_at IS NOT NULL
     AND (v_now - v_claimed_at) < make_interval(secs => v_effective_timeout) THEN RETURN FALSE; END IF;
  IF v_current_status IN ('pending', 'failed') AND v_next_attempt IS NOT NULL
     AND v_next_attempt > v_now THEN RETURN FALSE; END IF;
  UPDATE public.telefun_history
  SET scoring_status = 'processing', scoring_claimed_at = v_now,
      scoring_claim_token_hash = NULL, scoring_claim_owner = 'legacy-scoring-worker',
      scoring_attempt_count = COALESCE(scoring_attempt_count, 0) + 1,
      scoring_last_error = NULL, scoring_next_attempt_at = NULL
  WHERE id = p_session_id;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.enqueue_telefun_scoring(p_session_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_transport TEXT;
  v_status TEXT;
  v_scoring_ready_at TIMESTAMPTZ;
  v_agent_path TEXT;
  v_user_id UUID;
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT h.telefun_transport, h.status, h.scoring_ready_at,
         h.agent_recording_path, h.user_id
  INTO v_transport, v_status, v_scoring_ready_at, v_agent_path, v_user_id
  FROM public.telefun_history h WHERE h.id = p_session_id FOR UPDATE;
  IF v_transport = 'openai-webrtc' AND (
    v_status <> 'completed' OR v_scoring_ready_at IS NULL OR v_agent_path IS NULL
    OR v_agent_path !~ ('^' || v_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$')
  ) THEN RETURN FALSE; END IF;
  UPDATE public.telefun_history
  SET scoring_status = 'pending', scoring_next_attempt_at = now()
  WHERE id = p_session_id
    AND scoring_status IS DISTINCT FROM 'completed'
    AND scoring_status IS DISTINCT FROM 'processing';
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_telefun_recording_uploaded(p_session_id uuid, p_user_id uuid, p_recording_path text DEFAULT NULL::text, p_agent_recording_path text DEFAULT NULL::text, p_capture_status text DEFAULT 'ready'::text)
 RETURNS TABLE(applied boolean, recording_status text, recording_ready boolean, scoring_ready boolean, scoring_status text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_session public.telefun_history%ROWTYPE;
  v_recording_status TEXT;
  v_recording_path TEXT;
  v_agent_recording_path TEXT;
  v_scoring_status TEXT;
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT h.* INTO v_session FROM public.telefun_history h
  WHERE h.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'pending'::text, false, false, 'pending'::text, 'session_not_found'; RETURN;
  END IF;
  IF v_session.user_id <> p_user_id THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'not_owner'; RETURN;
  END IF;
  IF p_capture_status NOT IN ('ready', 'failed') THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'invalid_capture_status'; RETURN;
  END IF;
  IF p_recording_path IS NOT NULL AND p_recording_path !~ ('^' || p_user_id::text || '/' || p_session_id::text || '/full_call\.[A-Za-z0-9]+$') THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, COALESCE(v_session.scoring_status, 'pending'), 'invalid_recording_path'; RETURN;
  END IF;
  IF p_agent_recording_path IS NOT NULL AND p_agent_recording_path !~ ('^' || p_user_id::text || '/' || p_session_id::text || '/agent_only\.[A-Za-z0-9]+$') THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, COALESCE(v_session.scoring_status, 'pending'), 'invalid_recording_path'; RETURN;
  END IF;
  IF p_recording_path IS NOT NULL AND v_session.recording_path IS NOT NULL AND p_recording_path <> v_session.recording_path THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'path_conflict'; RETURN;
  END IF;
  IF p_agent_recording_path IS NOT NULL AND v_session.agent_recording_path IS NOT NULL AND p_agent_recording_path <> v_session.agent_recording_path THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'path_conflict'; RETURN;
  END IF;
  v_recording_path := COALESCE(p_recording_path, v_session.recording_path);
  v_agent_recording_path := COALESCE(p_agent_recording_path, v_session.agent_recording_path);
  IF p_capture_status = 'ready' AND v_recording_path IS NULL AND v_agent_recording_path IS NULL THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, COALESCE(v_session.scoring_status, 'pending'), 'recording_required'; RETURN;
  END IF;
  v_scoring_status := COALESCE(v_session.scoring_status, 'pending');
  IF p_capture_status = 'failed' THEN
    v_recording_status := 'failed';
    IF v_session.telefun_transport = 'openai-webrtc' AND v_scoring_status = 'processing' THEN v_scoring_status := 'failed'; END IF;
  ELSIF v_session.recording_status IN ('partial', 'ready') THEN
    v_recording_status := v_session.recording_status;
  ELSE
    v_recording_status := 'uploaded';
  END IF;
  UPDATE public.telefun_history
  SET recording_path = v_recording_path,
      agent_recording_path = v_agent_recording_path,
      recording_status = v_recording_status,
      recording_error = CASE WHEN p_capture_status = 'failed' THEN 'Recording capture failed' ELSE NULL END,
      scoring_status = CASE
        WHEN p_capture_status = 'failed' AND v_session.telefun_transport = 'openai-webrtc' AND v_session.scoring_status = 'processing' THEN 'failed'
        ELSE COALESCE(v_session.scoring_status, 'pending') END,
      scoring_claimed_at = CASE WHEN p_capture_status = 'failed' AND v_session.telefun_transport = 'openai-webrtc' AND v_session.scoring_status = 'processing' THEN NULL ELSE v_session.scoring_claimed_at END,
      scoring_last_error = CASE WHEN p_capture_status = 'failed' AND v_session.telefun_transport = 'openai-webrtc' THEN 'Recording capture failed' ELSE v_session.scoring_last_error END,
      scoring_ready_at = CASE WHEN p_capture_status = 'failed' THEN NULL ELSE v_session.scoring_ready_at END,
      scoring_next_attempt_at = CASE WHEN p_capture_status = 'failed' THEN NULL ELSE v_session.scoring_next_attempt_at END
  WHERE id = p_session_id;
  RETURN QUERY SELECT true, v_recording_status,
    (v_session.recording_ready_at IS NOT NULL OR v_recording_path IS NOT NULL OR v_agent_recording_path IS NOT NULL) AND v_recording_status IN ('partial', 'ready'),
    CASE WHEN p_capture_status = 'failed' THEN false ELSE v_session.scoring_ready_at IS NOT NULL END,
    v_scoring_status, CASE WHEN p_capture_status = 'failed' THEN 'capture_failed' ELSE 'uploaded' END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_telefun_recording_ready(p_session_id uuid, p_user_id uuid, p_recording_path text DEFAULT NULL::text, p_agent_recording_path text DEFAULT NULL::text)
 RETURNS TABLE(applied boolean, recording_status text, recording_ready boolean, scoring_ready boolean, scoring_ready_at timestamp with time zone, scoring_status text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_session public.telefun_history%ROWTYPE;
  v_recording_path TEXT;
  v_agent_recording_path TEXT;
  v_recording_status TEXT;
  v_scoring_status TEXT;
  v_scoring_ready_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT h.* INTO v_session FROM public.telefun_history h WHERE h.id = p_session_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT false, 'pending'::text, false, false, NULL::timestamptz, 'pending'::text, 'session_not_found'; RETURN; END IF;
  IF v_session.user_id <> p_user_id THEN RETURN QUERY SELECT false, v_session.recording_status, false, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'not_owner'; RETURN; END IF;
  IF v_session.recording_status = 'failed' OR v_session.recording_error IS NOT NULL THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'capture_failed'; RETURN;
  END IF;
  IF p_recording_path IS NOT NULL AND p_recording_path !~ ('^' || p_user_id::text || '/' || p_session_id::text || '/full_call\.seekable\.webm$') THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'invalid_seekable_path'; RETURN;
  END IF;
  IF p_agent_recording_path IS NOT NULL AND p_agent_recording_path !~ ('^' || p_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$') THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'invalid_seekable_path'; RETURN;
  END IF;
  IF p_recording_path IS NOT NULL AND v_session.recording_path IS NOT NULL AND p_recording_path <> v_session.recording_path
     AND NOT (v_session.recording_path = p_user_id::text || '/' || p_session_id::text || '/full_call.webm' AND p_recording_path = p_user_id::text || '/' || p_session_id::text || '/full_call.seekable.webm') THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'path_conflict'; RETURN;
  END IF;
  IF p_agent_recording_path IS NOT NULL AND v_session.agent_recording_path IS NOT NULL AND p_agent_recording_path <> v_session.agent_recording_path
     AND NOT (v_session.agent_recording_path = p_user_id::text || '/' || p_session_id::text || '/agent_only.webm' AND p_agent_recording_path = p_user_id::text || '/' || p_session_id::text || '/agent_only.seekable.webm') THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'path_conflict'; RETURN;
  END IF;
  v_recording_path := COALESCE(p_recording_path, v_session.recording_path);
  v_agent_recording_path := COALESCE(p_agent_recording_path, v_session.agent_recording_path);
  IF v_recording_path IS NULL AND v_agent_recording_path IS NULL THEN RETURN QUERY SELECT false, v_session.recording_status, false, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'recording_required'; RETURN; END IF;
  v_recording_status := CASE
    WHEN v_recording_path ~ ('^' || p_user_id::text || '/' || p_session_id::text || '/full_call\.seekable\.webm$')
      AND v_agent_recording_path ~ ('^' || p_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$') THEN 'ready'
    ELSE 'partial' END;
  v_scoring_status := COALESCE(v_session.scoring_status, 'pending');
  v_scoring_ready_at := v_session.scoring_ready_at;
  IF v_session.status = 'completed' AND v_agent_recording_path ~ ('^' || p_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$') THEN
    v_scoring_ready_at := COALESCE(v_scoring_ready_at, v_now);
    IF v_scoring_status NOT IN ('processing', 'completed') THEN v_scoring_status := 'pending'; END IF;
  END IF;
  UPDATE public.telefun_history
  SET recording_path = v_recording_path, agent_recording_path = v_agent_recording_path,
      recording_status = v_recording_status, recording_ready_at = COALESCE(recording_ready_at, v_now),
      recording_error = NULL, scoring_ready_at = v_scoring_ready_at, scoring_status = v_scoring_status,
      scoring_next_attempt_at = CASE WHEN v_scoring_ready_at IS NOT NULL AND v_scoring_status = 'pending' THEN COALESCE(scoring_next_attempt_at, v_now) ELSE scoring_next_attempt_at END
  WHERE id = p_session_id;
  RETURN QUERY SELECT true, v_recording_status, true, v_scoring_ready_at IS NOT NULL,
    v_scoring_ready_at, v_scoring_status, 'ready'::text;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_telefun_scoring(p_session_id uuid, p_score numeric, p_voice_assessment jsonb, p_claim_token_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID; v_user_id UUID; v_status TEXT; v_transport TEXT;
  v_recording_status TEXT; v_recording_error TEXT; v_scoring_status TEXT;
  v_scoring_ready_at TIMESTAMPTZ; v_agent_recording_path TEXT; v_claim_token_hash TEXT;
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_claim_token_hash IS NULL OR p_claim_token_hash = '' THEN RETURN FALSE; END IF;
  SELECT h.id, h.user_id, h.status, h.telefun_transport, h.recording_status,
         h.recording_error, h.scoring_status, h.scoring_ready_at,
         h.agent_recording_path, h.scoring_claim_token_hash
  INTO v_id, v_user_id, v_status, v_transport, v_recording_status,
       v_recording_error, v_scoring_status, v_scoring_ready_at,
       v_agent_recording_path, v_claim_token_hash
  FROM public.telefun_history h WHERE h.id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_id IS NULL OR v_scoring_status <> 'processing' THEN RETURN FALSE; END IF;
  IF v_claim_token_hash IS DISTINCT FROM p_claim_token_hash THEN RETURN FALSE; END IF;
  IF v_transport = 'openai-webrtc' AND (
    v_status <> 'completed' OR v_recording_status IS NULL
    OR v_recording_status NOT IN ('partial', 'ready') OR v_recording_error IS NOT NULL
    OR v_scoring_ready_at IS NULL
    OR v_agent_recording_path IS DISTINCT FROM v_user_id::text || '/' || p_session_id::text || '/agent_only.seekable.webm'
  ) THEN RETURN FALSE; END IF;
  UPDATE public.telefun_history SET scoring_status = 'completed', scoring_completed_at = now(),
    score = p_score, voice_assessment = COALESCE(p_voice_assessment, voice_assessment),
    scoring_claim_token_hash = NULL, scoring_claim_owner = NULL
  WHERE id = p_session_id AND scoring_status = 'processing'
    AND scoring_claim_token_hash IS NOT DISTINCT FROM p_claim_token_hash;
  RETURN FOUND;
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_telefun_scoring(p_session_id uuid, p_score numeric, p_voice_assessment jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id UUID; v_user_id UUID; v_status TEXT; v_transport TEXT;
  v_recording_status TEXT; v_recording_error TEXT; v_scoring_status TEXT;
  v_scoring_ready_at TIMESTAMPTZ; v_agent_recording_path TEXT; v_claim_token_hash TEXT;
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT h.id, h.user_id, h.status, h.telefun_transport, h.recording_status,
         h.recording_error, h.scoring_status, h.scoring_ready_at,
         h.agent_recording_path, h.scoring_claim_token_hash
  INTO v_id, v_user_id, v_status, v_transport, v_recording_status,
       v_recording_error, v_scoring_status, v_scoring_ready_at,
       v_agent_recording_path, v_claim_token_hash
  FROM public.telefun_history h WHERE h.id = p_session_id FOR UPDATE;
  IF NOT FOUND OR v_id IS NULL OR v_scoring_status <> 'processing' OR v_claim_token_hash IS NOT NULL THEN RETURN FALSE; END IF;
  IF v_transport = 'openai-webrtc' AND (
    v_status <> 'completed' OR v_recording_status IS NULL
    OR v_recording_status NOT IN ('partial', 'ready') OR v_recording_error IS NOT NULL
    OR v_scoring_ready_at IS NULL
    OR v_agent_recording_path IS DISTINCT FROM v_user_id::text || '/' || p_session_id::text || '/agent_only.seekable.webm'
  ) THEN RETURN FALSE; END IF;
  UPDATE public.telefun_history SET scoring_status = 'completed', scoring_completed_at = now(),
    score = p_score, voice_assessment = COALESCE(p_voice_assessment, voice_assessment),
    scoring_claim_token_hash = NULL, scoring_claim_owner = NULL
  WHERE id = p_session_id AND scoring_status = 'processing' AND scoring_claim_token_hash IS NULL;
  RETURN FOUND;
END;
$function$;

COMMIT;
