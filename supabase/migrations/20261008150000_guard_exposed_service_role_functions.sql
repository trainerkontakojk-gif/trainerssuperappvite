-- T2: D2 + 34 Group A routines (including legacy overloads) + Q3.
-- Apply this file and its migration-history entry in ONE guarded transaction.
-- Frozen from local pg_get_functiondef; unchanged bodies are intentionally kept
-- in full. A30 guard replacement and A33/A34 SQL conversion are the exceptions.
-- Group B grants/global invariant belong to migration 2; no global check here.


CREATE SCHEMA IF NOT EXISTS app_internal;
REVOKE ALL ON SCHEMA app_internal FROM PUBLIC, anon, authenticated;
-- No USAGE for client roles. Do NOT add app_internal to PGRST_DB_SCHEMAS (local config or production API settings).

CREATE OR REPLACE FUNCTION app_internal.assert_service_role()
RETURNS void LANGUAGE plpgsql STABLE SET search_path = '' AS $$
DECLARE v_role text;
BEGIN
  BEGIN
    v_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  EXCEPTION WHEN others THEN
    v_role := NULL;  -- malformed claims are treated as "not service_role"
  END;
  IF v_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'SERVICE_ROLE_REQUIRED' USING ERRCODE = '42501';
  END IF;
END $$;
REVOKE ALL ON FUNCTION app_internal.assert_service_role() FROM PUBLIC, anon, authenticated;

-- public.begin_telefun_realtime_finalization_p5(uuid,uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.begin_telefun_realtime_finalization_p5(p_attempt_id uuid, p_user_id uuid, p_finalization_key uuid, p_requested_outcome text)
 RETURNS TABLE(accepted boolean, should_finalize boolean, state text, requested_outcome text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_attempt public.telefun_realtime_attempts%ROWTYPE; v_outcome TEXT := p_requested_outcome;
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_requested_outcome NOT IN ('completed', 'failed', 'network_lost', 'orphaned') THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, 'invalid_outcome'::text; RETURN;
  END IF;
  SELECT a.* INTO v_attempt FROM public.telefun_realtime_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, 'attempt_not_found'::text; RETURN;
  END IF;
  IF v_attempt.state = 'ended' THEN
    RETURN QUERY SELECT true, false, v_attempt.state, v_attempt.requested_outcome, 'already_ended'::text; RETURN;
  END IF;
  IF v_attempt.state = 'ending' AND v_attempt.finalization_key <> p_finalization_key THEN
    RETURN QUERY SELECT false, false, v_attempt.state, v_attempt.requested_outcome, 'finalization_key_conflict'::text; RETURN;
  END IF;
  IF v_attempt.state <> 'ending' THEN
    UPDATE public.telefun_realtime_attempts SET state = 'ending', requested_outcome = v_outcome,
      finalization_started_at = COALESCE(finalization_started_at, now()), updated_at = now()
    WHERE id = p_attempt_id;
  ELSIF v_attempt.requested_outcome IN ('failed', 'network_lost', 'orphaned') THEN
    v_outcome := v_attempt.requested_outcome;
    UPDATE public.telefun_realtime_attempts SET requested_outcome = v_outcome, updated_at = now()
    WHERE id = p_attempt_id;
  END IF;
  RETURN QUERY SELECT true, true, 'ending'::text, v_outcome, 'ready_to_finalize'::text;
END;
$function$;

-- public.begin_telefun_realtime_finalization(uuid,uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.begin_telefun_realtime_finalization(p_attempt_id uuid, p_user_id uuid, p_finalization_key uuid, p_requested_outcome text)
 RETURNS TABLE(accepted boolean, should_finalize boolean, state text, requested_outcome text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_outcome TEXT := p_requested_outcome;
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_requested_outcome NOT IN ('completed', 'failed') THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, 'invalid_outcome';
    RETURN;
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.telefun_realtime_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, 'attempt_not_found';
    RETURN;
  END IF;
  IF v_attempt.state = 'ended' THEN
    RETURN QUERY SELECT true, false, v_attempt.state, v_attempt.requested_outcome, 'already_ended';
    RETURN;
  END IF;
  IF v_attempt.state = 'ending' AND v_attempt.finalization_key <> p_finalization_key THEN
    RETURN QUERY SELECT false, false, v_attempt.state, v_attempt.requested_outcome, 'finalization_key_conflict';
    RETURN;
  END IF;
  IF v_attempt.state <> 'ending' THEN
    UPDATE public.telefun_realtime_attempts
    SET state = 'ending',
        requested_outcome = v_outcome,
        finalization_started_at = COALESCE(finalization_started_at, now()),
        updated_at = now()
    WHERE id = p_attempt_id;
  ELSIF v_attempt.requested_outcome = 'failed' OR v_outcome = 'failed' THEN
    v_outcome := 'failed';
    UPDATE public.telefun_realtime_attempts
    SET requested_outcome = 'failed', updated_at = now()
    WHERE id = p_attempt_id;
  END IF;

  RETURN QUERY SELECT true, true, 'ending'::text, v_outcome, 'ready_to_finalize'::text;
END;
$function$;

-- public.bind_telefun_realtime_provider_call(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.bind_telefun_realtime_provider_call(p_attempt_id uuid, p_user_id uuid, p_provider_call_id_hash text)
 RETURNS TABLE(accepted boolean, state text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT a.* INTO v_attempt
  FROM public.telefun_realtime_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::text, 'attempt_not_found';
    RETURN;
  END IF;
  IF p_provider_call_id_hash IS NULL
     OR p_provider_call_id_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT false, v_attempt.state, 'invalid_provider_hash';
    RETURN;
  END IF;
  IF v_attempt.state IN ('ending', 'ended') THEN
    RETURN QUERY SELECT false, v_attempt.state, 'attempt_terminalizing';
    RETURN;
  END IF;
  IF v_attempt.provider_call_id_hash IS NOT NULL
     AND v_attempt.provider_call_id_hash <> p_provider_call_id_hash THEN
    RETURN QUERY SELECT false, v_attempt.state, 'provider_hash_conflict';
    RETURN;
  END IF;
  IF v_attempt.state IN ('brokered', 'sideband_connected') THEN
    RETURN QUERY SELECT true, v_attempt.state, 'idempotent';
    RETURN;
  END IF;
  IF v_attempt.state <> 'claimed' THEN
    RETURN QUERY SELECT false, v_attempt.state, 'invalid_attempt_state';
    RETURN;
  END IF;

  UPDATE public.telefun_realtime_attempts
  SET provider_call_id_hash = p_provider_call_id_hash,
      state = 'brokered',
      brokered_at = COALESCE(brokered_at, now()),
      updated_at = now()
  WHERE id = p_attempt_id;

  RETURN QUERY SELECT true, 'brokered'::text, 'bound'::text;
END;
$function$;

-- public.checkpoint_telefun_realtime_transcript(uuid,uuid,bigint,text,text,text,integer,boolean)
CREATE OR REPLACE FUNCTION public.checkpoint_telefun_realtime_transcript(p_attempt_id uuid, p_user_id uuid, p_sequence bigint, p_dedupe_key text, p_speaker text, p_text text, p_start_ms integer, p_is_partial boolean DEFAULT false)
 RETURNS TABLE(accepted boolean, operation text, checkpoint_sequence bigint, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_event public.telefun_realtime_transcript_events%ROWTYPE;
  v_text TEXT := btrim(p_text);
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT a.* INTO v_attempt
  FROM public.telefun_realtime_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'rejected'::text, 0::bigint, 'attempt_not_found';
    RETURN;
  END IF;
  IF v_attempt.state NOT IN ('claimed', 'brokered', 'sideband_connected', 'ending') THEN
    RETURN QUERY SELECT false, 'rejected'::text, v_attempt.transcript_checkpoint_seq, 'invalid_attempt_state';
    RETURN;
  END IF;
  IF p_sequence IS NULL OR p_sequence <= 0
     OR p_dedupe_key IS NULL OR char_length(p_dedupe_key) NOT BETWEEN 1 AND 256
     OR p_speaker NOT IN ('agent', 'consumer')
     OR v_text IS NULL OR char_length(v_text) NOT BETWEEN 1 AND 16000
     OR p_start_ms IS NULL OR p_start_ms < 0 THEN
    RETURN QUERY SELECT false, 'rejected'::text, v_attempt.transcript_checkpoint_seq, 'invalid_checkpoint';
    RETURN;
  END IF;

  SELECT e.* INTO v_event
  FROM public.telefun_realtime_transcript_events e
  WHERE e.attempt_id = p_attempt_id AND e.dedupe_key = p_dedupe_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_event.sequence <> p_sequence
       OR v_event.speaker <> p_speaker
       OR v_event.start_ms <> p_start_ms THEN
      RETURN QUERY SELECT false, 'rejected'::text, v_attempt.transcript_checkpoint_seq, 'dedupe_conflict';
      RETURN;
    END IF;
    IF v_event.text = v_text AND v_event.is_partial = p_is_partial THEN
      RETURN QUERY SELECT true, 'duplicate'::text, v_attempt.transcript_checkpoint_seq, 'duplicate';
      RETURN;
    END IF;
    IF NOT v_event.is_partial OR p_sequence <> v_attempt.transcript_checkpoint_seq THEN
      RETURN QUERY SELECT false, 'rejected'::text, v_attempt.transcript_checkpoint_seq, 'dedupe_conflict';
      RETURN;
    END IF;

    UPDATE public.telefun_realtime_transcript_events
    SET text = v_text,
        is_partial = p_is_partial,
        updated_at = now()
    WHERE id = v_event.id;
    UPDATE public.telefun_realtime_attempts
    SET transcript_checkpoint_at = now(), updated_at = now()
    WHERE id = p_attempt_id;
    RETURN QUERY SELECT true, 'updated'::text, v_attempt.transcript_checkpoint_seq, 'updated';
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.telefun_realtime_transcript_events e
    WHERE e.attempt_id = p_attempt_id AND e.sequence = p_sequence
  ) THEN
    RETURN QUERY SELECT false, 'rejected'::text, v_attempt.transcript_checkpoint_seq, 'dedupe_conflict';
    RETURN;
  END IF;
  IF p_sequence <> v_attempt.transcript_checkpoint_seq + 1 THEN
    RETURN QUERY SELECT false, 'rejected'::text, v_attempt.transcript_checkpoint_seq, 'sequence_gap';
    RETURN;
  END IF;

  INSERT INTO public.telefun_realtime_transcript_events (
    attempt_id, sequence, dedupe_key, speaker, text, start_ms, is_partial
  ) VALUES (
    p_attempt_id, p_sequence, p_dedupe_key, p_speaker, v_text, p_start_ms, p_is_partial
  );
  UPDATE public.telefun_realtime_attempts
  SET transcript_checkpoint_seq = p_sequence,
      transcript_checkpoint_at = now(),
      updated_at = now()
  WHERE id = p_attempt_id;

  RETURN QUERY SELECT true, 'inserted'::text, p_sequence, 'accepted'::text;
END;
$function$;

-- public.claim_telefun_realtime_attempt(uuid,uuid,uuid,text,text)
CREATE OR REPLACE FUNCTION public.claim_telefun_realtime_attempt(p_session_id uuid, p_user_id uuid, p_attempt_id uuid, p_model_id text, p_transport text)
 RETURNS TABLE(claimed boolean, attempt_id uuid, finalization_key uuid, usage_request_id text, state text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_history_user_id UUID;
  v_history_status TEXT;
  v_history_model_id TEXT;
  v_history_transport TEXT;
  v_existing public.telefun_realtime_attempts%ROWTYPE;
  v_finalization_key UUID;
  v_usage_request_id TEXT := 'telefun-webrtc:' || p_attempt_id::text;
BEGIN
  PERFORM app_internal.assert_service_role();
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
$function$;

-- public.claim_telefun_realtime_lease(uuid,uuid,uuid,text,text,integer,integer,integer)
CREATE OR REPLACE FUNCTION public.claim_telefun_realtime_lease(p_user_id uuid, p_session_id uuid, p_attempt_id uuid, p_provider text, p_lease_token_hash text, p_ttl_ms integer, p_max_user_sessions integer, p_max_provider_sessions integer)
 RETURNS TABLE(granted boolean, lease_id uuid, expires_at timestamp with time zone, active_count integer, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_expires TIMESTAMPTZ;
  v_user_count INTEGER;
  v_provider_count INTEGER;
  v_existing public.telefun_realtime_leases%ROWTYPE;
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_id UUID;
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_provider <> 'openai-webrtc'
     OR p_ttl_ms NOT BETWEEN 1000 AND 120000
     OR p_max_user_sessions < 1
     OR p_max_provider_sessions < 1
     OR p_lease_token_hash IS NULL
     OR p_lease_token_hash !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT false, NULL::uuid, v_now, 0, 'invalid_lease_request'::text;
    RETURN;
  END IF;

  -- Both locks make expiry cleanup, cap counting, and insertion one
  -- serializable decision across every Railway replica. The provider lock is
  -- required so two different users cannot race the global provider cap.
  PERFORM pg_advisory_xact_lock(hashtextextended('telefun-webrtc:provider:' || p_provider, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('telefun-webrtc:' || p_provider || ':' || p_user_id::text, 0));
  SELECT a.* INTO v_attempt
  FROM public.telefun_realtime_attempts a
  WHERE a.id = p_attempt_id
  FOR UPDATE;
  IF NOT FOUND OR v_attempt.user_id <> p_user_id OR v_attempt.session_id <> p_session_id
     OR v_attempt.state = 'ended' THEN
    RETURN QUERY SELECT false, NULL::uuid, v_now, 0, 'attempt_not_active'::text;
    RETURN;
  END IF;

  SELECT l.* INTO v_existing
  FROM public.telefun_realtime_leases l
  WHERE l.attempt_id = p_attempt_id AND l.state IN ('active', 'cleanup_claimed')
  FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT false, v_existing.id, v_existing.expires_at, 1, 'attempt_exists'::text;
    RETURN;
  END IF;

  SELECT count(*)::integer INTO v_user_count
  FROM public.telefun_realtime_leases l
  WHERE l.user_id = p_user_id AND l.provider = p_provider
    AND l.state = 'active' AND l.expires_at > v_now;
  SELECT count(*)::integer INTO v_provider_count
  FROM public.telefun_realtime_leases l
  WHERE l.provider = p_provider
    AND l.state = 'active' AND l.expires_at > v_now;
  IF v_user_count >= p_max_user_sessions OR v_provider_count >= p_max_provider_sessions THEN
    RETURN QUERY SELECT false, NULL::uuid, v_now,
      GREATEST(v_user_count, v_provider_count), 'session_cap'::text;
    RETURN;
  END IF;

  v_expires := v_now + make_interval(secs => p_ttl_ms::double precision / 1000.0);
  INSERT INTO public.telefun_realtime_leases (
    attempt_id, session_id, user_id, provider, lease_token_hash, expires_at
  ) VALUES (
    p_attempt_id, p_session_id, p_user_id, p_provider, p_lease_token_hash, v_expires
  ) RETURNING id INTO v_id;
  UPDATE public.telefun_realtime_attempts
  SET lease_id = v_id, lease_token_hash = p_lease_token_hash, updated_at = v_now
  WHERE id = p_attempt_id;
  RETURN QUERY SELECT true, v_id, v_expires, v_provider_count + 1, 'claimed'::text;
END;
$function$;

-- public.claim_telefun_realtime_orphans(integer)
CREATE OR REPLACE FUNCTION public.claim_telefun_realtime_orphans(p_limit integer DEFAULT 25)
 RETURNS TABLE(lease_id uuid, attempt_id uuid, session_id uuid, user_id uuid, provider text, provider_call_reference text, sideband_connected boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app_internal.assert_service_role();
  RETURN QUERY
  WITH candidates AS (
    SELECT l.id
    FROM public.telefun_realtime_leases l
    WHERE l.state = 'active' AND l.provider = 'openai-webrtc'
      AND l.expires_at <= clock_timestamp()
    ORDER BY l.expires_at
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 25), 100))
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.telefun_realtime_leases l
  SET state = 'cleanup_claimed', updated_at = now()
  FROM candidates c
  WHERE l.id = c.id
  RETURNING l.id, l.attempt_id, l.session_id, l.user_id, l.provider,
    l.provider_call_reference, l.sideband_connected;
END;
$function$;

-- public.claim_telefun_scoring(uuid,integer,text,text)
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
  INTO v_current_status, v_claimed_at, v_next_attempt,
       v_transport, v_session_status, v_scoring_ready_at,
       v_agent_path, v_user_id
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN RETURN FALSE; END IF;
  IF v_current_status = 'completed' THEN RETURN FALSE; END IF;
  -- Phase 4 durable-lifecycle guard: WebRTC rows are claimable only when the
  -- session completed with an owned seekable agent path and scoring is ready.
  IF v_transport = 'openai-webrtc' AND (
    v_session_status <> 'completed'
    OR v_scoring_ready_at IS NULL
    OR v_agent_path IS NULL
    OR v_agent_path !~ ('^' || v_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$')
  ) THEN RETURN FALSE; END IF;

  IF v_current_status = 'processing' AND v_claimed_at IS NOT NULL
     AND (v_now - v_claimed_at) < make_interval(secs => p_claim_timeout_seconds) THEN
    RETURN FALSE;
  END IF;

  IF v_current_status IN ('pending', 'failed')
     AND v_next_attempt IS NOT NULL AND v_next_attempt > v_now THEN
    RETURN FALSE;
  END IF;

  UPDATE public.telefun_history
  SET scoring_status = 'processing',
      scoring_claimed_at = v_now,
      scoring_claim_token_hash = p_claim_token_hash,
      scoring_claim_owner = p_claim_owner,
      scoring_attempt_count = COALESCE(scoring_attempt_count, 0) + 1,
      scoring_last_error = NULL,
      scoring_next_attempt_at = NULL
  WHERE id = p_session_id;

  RETURN FOUND;
END;
$function$;

-- public.claim_telefun_scoring(uuid,integer)
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
  INTO v_current_status, v_claimed_at, v_next_attempt,
       v_transport, v_session_status, v_scoring_ready_at,
       v_agent_path, v_user_id
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN RETURN FALSE; END IF;
  IF v_current_status = 'completed' THEN RETURN FALSE; END IF;
  -- Phase 4 durable-lifecycle guard (same as tokenized claim): WebRTC rows
  -- are claimable only when the session completed with an owned seekable
  -- agent path and scoring is ready.
  IF v_transport = 'openai-webrtc' AND (
    v_session_status <> 'completed'
    OR v_scoring_ready_at IS NULL
    OR v_agent_path IS NULL
    OR v_agent_path !~ ('^' || v_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$')
  ) THEN RETURN FALSE; END IF;
  IF v_current_status = 'processing' AND v_claimed_at IS NOT NULL
     AND (v_now - v_claimed_at) < make_interval(secs => v_effective_timeout) THEN
    RETURN FALSE;
  END IF;
  IF v_current_status IN ('pending', 'failed')
     AND v_next_attempt IS NOT NULL AND v_next_attempt > v_now THEN
    RETURN FALSE;
  END IF;

  UPDATE public.telefun_history
  SET scoring_status = 'processing',
      scoring_claimed_at = v_now,
      scoring_claim_token_hash = NULL,
      scoring_claim_owner = 'legacy-scoring-worker',
      scoring_attempt_count = COALESCE(scoring_attempt_count, 0) + 1,
      scoring_last_error = NULL,
      scoring_next_attempt_at = NULL
  WHERE id = p_session_id;

  RETURN FOUND;
END;
$function$;

-- public.cleanup_pdkt_mailbox_subject_intents()
CREATE OR REPLACE FUNCTION public.cleanup_pdkt_mailbox_subject_intents()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  deleted_count INTEGER;
BEGIN
  PERFORM app_internal.assert_service_role();

  DELETE FROM public.pdkt_mailbox_subject_intents
   WHERE consumed_at IS NOT NULL
      OR expires_at <= clock_timestamp();

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$function$;

-- public.complete_telefun_realtime_orphan(uuid,uuid,text,boolean,boolean,text)
CREATE OR REPLACE FUNCTION public.complete_telefun_realtime_orphan(p_lease_id uuid, p_attempt_id uuid, p_outcome text, p_provider_closed boolean, p_sideband_closed boolean, p_error_code text DEFAULT NULL::text)
 RETURNS TABLE(applied boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user_id UUID; v_session_id UUID;
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_outcome <> 'orphaned' OR p_error_code IS NOT NULL AND char_length(p_error_code) > 128 THEN
    RETURN QUERY SELECT false, 'invalid_orphan'::text; RETURN;
  END IF;
  IF NOT p_provider_closed OR NOT p_sideband_closed THEN
    UPDATE public.telefun_realtime_leases
    SET state = 'active',
        expires_at = now() + make_interval(secs => 30.0),
        last_error = COALESCE(
          p_error_code,
          CASE
            WHEN NOT p_provider_closed THEN 'provider_close_failed'
            ELSE 'sideband_close_failed'
          END
        ),
        updated_at = now()
    WHERE id = p_lease_id AND attempt_id = p_attempt_id AND state = 'cleanup_claimed';
    IF FOUND THEN
      RETURN QUERY SELECT false, 'cleanup_incomplete'::text;
      RETURN;
    END IF;
  END IF;
  UPDATE public.telefun_realtime_leases
  SET state = 'orphaned', terminal_outcome = 'orphaned', last_error = p_error_code,
      updated_at = now()
  WHERE id = p_lease_id AND attempt_id = p_attempt_id AND state = 'cleanup_claimed'
  RETURNING user_id, session_id INTO v_user_id, v_session_id;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'lease_not_found'::text; RETURN;
  END IF;
  UPDATE public.telefun_realtime_attempts
  SET state = 'ended', requested_outcome = 'orphaned', outcome = 'orphaned',
      orphaned_at = COALESCE(orphaned_at, now()), ended_at = COALESCE(ended_at, now()),
      last_error = COALESCE(p_error_code, 'orphan_cleanup'), updated_at = now()
  WHERE id = p_attempt_id AND user_id = v_user_id AND state <> 'ended';
  UPDATE public.telefun_history
  SET status = 'failed', duration_seconds = COALESCE(duration_seconds, 0)
  WHERE id = v_session_id AND user_id = v_user_id AND status IN ('pending', 'active');
  RETURN QUERY SELECT true, 'orphaned'::text;
END;
$function$;

-- public.complete_telefun_scoring(uuid,numeric,jsonb,text)
CREATE OR REPLACE FUNCTION public.complete_telefun_scoring(p_session_id uuid, p_score numeric, p_voice_assessment jsonb, p_claim_token_hash text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_claim_token_hash TEXT;
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_claim_token_hash IS NULL OR p_claim_token_hash = '' THEN
    RETURN FALSE;
  END IF;

  SELECT h.id,
         h.user_id,
         h.status,
         h.telefun_transport,
         h.recording_status,
         h.recording_error,
         h.scoring_status,
         h.scoring_ready_at,
         h.agent_recording_path,
         h.scoring_claim_token_hash
  INTO v_id,
       v_user_id,
       v_status,
       v_transport,
       v_recording_status,
       v_recording_error,
       v_scoring_status,
       v_scoring_ready_at,
       v_agent_recording_path,
       v_claim_token_hash
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_id IS NULL OR v_scoring_status <> 'processing' THEN
    RETURN FALSE;
  END IF;

  -- Fencing: only the current claim owner may complete.
  IF v_claim_token_hash IS DISTINCT FROM p_claim_token_hash THEN
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
      voice_assessment = COALESCE(p_voice_assessment, voice_assessment),
      scoring_claim_token_hash = NULL,
      scoring_claim_owner = NULL
  WHERE id = p_session_id
    AND scoring_status = 'processing'
    AND scoring_claim_token_hash IS NOT DISTINCT FROM p_claim_token_hash;

  RETURN FOUND;
END;
$function$;

-- public.complete_telefun_scoring(uuid,numeric,jsonb)
CREATE OR REPLACE FUNCTION public.complete_telefun_scoring(p_session_id uuid, p_score numeric, p_voice_assessment jsonb DEFAULT NULL::jsonb)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  v_claim_token_hash TEXT;
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT h.id,
         h.user_id,
         h.status,
         h.telefun_transport,
         h.recording_status,
         h.recording_error,
         h.scoring_status,
         h.scoring_ready_at,
         h.agent_recording_path,
         h.scoring_claim_token_hash
  INTO v_id,
       v_user_id,
       v_status,
       v_transport,
       v_recording_status,
       v_recording_error,
       v_scoring_status,
       v_scoring_ready_at,
       v_agent_recording_path,
       v_claim_token_hash
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND OR v_id IS NULL OR v_scoring_status <> 'processing' THEN
    RETURN FALSE;
  END IF;

  -- Legacy path must not clobber a tokenized claim.
  IF v_claim_token_hash IS NOT NULL THEN
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
      voice_assessment = COALESCE(p_voice_assessment, voice_assessment),
      scoring_claim_token_hash = NULL,
      scoring_claim_owner = NULL
  WHERE id = p_session_id
    AND scoring_status = 'processing'
    AND scoring_claim_token_hash IS NULL;
  RETURN FOUND;
END;
$function$;

-- public.consume_telefun_realtime_rate_limit(text,uuid,uuid,text,integer,integer)
CREATE OR REPLACE FUNCTION public.consume_telefun_realtime_rate_limit(p_scope_key text, p_user_id uuid, p_session_id uuid, p_provider text, p_window_seconds integer, p_request_limit integer)
 RETURNS TABLE(allowed boolean, remaining integer, reset_at timestamp with time zone, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_start TIMESTAMPTZ;
  v_count INTEGER;
  v_id UUID;
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_scope_key IS NULL OR char_length(p_scope_key) > 256
     OR p_provider NOT IN ('openai-webrtc', 'gemini-live', 'openai-websocket')
     OR p_window_seconds NOT BETWEEN 1 AND 3600
     OR p_request_limit NOT BETWEEN 1 AND 10000 THEN
    RETURN QUERY SELECT false, 0, v_now, 'invalid_rate_limit_request'::text; RETURN;
  END IF;
  v_start := to_timestamp(
    floor(extract(epoch FROM v_now) / p_window_seconds) * p_window_seconds
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('telefun-rate:' || p_scope_key || ':' || v_start::text, 0));
  INSERT INTO public.telefun_realtime_rate_limits (
    scope_key, window_start, window_seconds, request_count, request_limit,
    user_id, session_id, provider
  ) VALUES (
    p_scope_key, v_start, p_window_seconds, 1, p_request_limit,
    p_user_id, p_session_id, p_provider
  )
  ON CONFLICT (scope_key, window_start) DO UPDATE
    SET request_count = public.telefun_realtime_rate_limits.request_count + 1,
        request_limit = EXCLUDED.request_limit,
        updated_at = v_now
  RETURNING id, request_count INTO v_id, v_count;
  RETURN QUERY SELECT v_count <= p_request_limit,
    GREATEST(0, p_request_limit - v_count),
    v_start + make_interval(secs => p_window_seconds::double precision),
    CASE WHEN v_count <= p_request_limit THEN 'allowed' ELSE 'rate_limited' END;
END;
$function$;

-- public.delete_monitoring_history(text,uuid)
CREATE OR REPLACE FUNCTION public.delete_monitoring_history(p_module text, p_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_module TEXT := lower(trim(p_module));
  v_deleted INTEGER := 0;
  v_source TEXT;
BEGIN
  PERFORM app_internal.assert_service_role();
  -- Security guard: only service_role can execute
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  CASE v_module
    WHEN 'ketik' THEN
      -- Delete KETIK children first
      DELETE FROM public.ketik_session_reviews WHERE session_id = p_id;
      DELETE FROM public.ketik_typo_findings WHERE session_id = p_id;
      DELETE FROM public.ketik_review_jobs WHERE session_id = p_id;
      -- Delete KETIK history
      DELETE FROM public.ketik_history WHERE id = p_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_source := 'ketik_history';

    WHEN 'pdkt' THEN
      -- Delete PDKT history
      DELETE FROM public.pdkt_history WHERE id = p_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;
      v_source := 'pdkt_history';

    WHEN 'telefun' THEN
      -- Delete Telefun history (children like coaching_summary and replay_annotations are ON DELETE CASCADE)
      DELETE FROM public.telefun_history WHERE id = p_id;
      GET DIAGNOSTICS v_deleted = ROW_COUNT;

      IF v_deleted > 0 THEN
        v_source := 'telefun_history';
      ELSIF to_regclass('public.results') IS NOT NULL THEN
        -- Support legacy Telefun data in results table
        EXECUTE
          'DELETE FROM public.results WHERE id = $1 AND module = ''telefun'''
          USING p_id;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;
        v_source := 'results';
      END IF;

    ELSE
      RAISE EXCEPTION 'unsupported monitoring module';
  END CASE;

  -- Ensure exactly one row was deleted
  IF v_deleted <> 1 THEN
    RAISE EXCEPTION 'monitoring history not found';
  END IF;

  RETURN jsonb_build_object(
    'module', v_module,
    'id', p_id,
    'source', v_source,
    'deleted', true
  );
END;
$function$;

-- public.enqueue_telefun_scoring(uuid)
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
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;
  IF v_transport = 'openai-webrtc' AND (
    v_status <> 'completed'
    OR v_scoring_ready_at IS NULL
    OR v_agent_path IS NULL
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

-- public.fail_telefun_realtime_session_without_attempt(uuid,uuid)
CREATE OR REPLACE FUNCTION public.fail_telefun_realtime_session_without_attempt(p_session_id uuid, p_user_id uuid)
 RETURNS TABLE(applied boolean, terminal boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_history public.telefun_history%ROWTYPE;
  v_attempt_state TEXT;
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT h.* INTO v_history
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 'session_not_found'::text;
    RETURN;
  END IF;
  IF v_history.user_id <> p_user_id
     OR v_history.telefun_transport IS DISTINCT FROM 'openai-webrtc' THEN
    RETURN QUERY SELECT false, false, 'session_rejected'::text;
    RETURN;
  END IF;
  -- The attempt row is the lifecycle authority. Check it before trusting a
  -- terminal history status because history and attempt state are not tied by
  -- a database invariant.
  SELECT a.state INTO v_attempt_state
  FROM public.telefun_realtime_attempts a
  WHERE a.session_id = p_session_id
  FOR UPDATE;
  IF FOUND THEN
    RETURN QUERY SELECT false, v_attempt_state = 'ended',
      CASE WHEN v_attempt_state = 'ended'
        THEN 'attempt_exists_terminal'
        ELSE 'attempt_exists_active'
      END;
    RETURN;
  END IF;

  IF v_history.status IN ('completed', 'failed') THEN
    RETURN QUERY SELECT false, true, 'already_terminal'::text;
    RETURN;
  END IF;
  IF v_history.status <> 'active' THEN
    RETURN QUERY SELECT false, false, 'session_not_active'::text;
    RETURN;
  END IF;

  UPDATE public.telefun_history
  SET status = 'failed', duration_seconds = 0,
      messages = COALESCE(messages, '[]'::jsonb)
  WHERE id = p_session_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, 'session_write_failed'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, true, 'failed_without_attempt'::text;
END;
$function$;

-- public.fail_telefun_scoring(uuid,text,text)
CREATE OR REPLACE FUNCTION public.fail_telefun_scoring(p_session_id uuid, p_error text, p_claim_token_hash text)
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
      scoring_claim_token_hash = NULL,
      scoring_claim_owner = NULL
  WHERE id = p_session_id
    AND scoring_status = 'processing'
    AND p_claim_token_hash IS NOT NULL
    AND scoring_claim_token_hash IS NOT DISTINCT FROM p_claim_token_hash;

  RETURN FOUND;
END;
$function$;

-- public.fail_telefun_scoring(uuid,text)
CREATE OR REPLACE FUNCTION public.fail_telefun_scoring(p_session_id uuid, p_error text)
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
      scoring_claim_token_hash = NULL,
      scoring_claim_owner = NULL
  WHERE id = p_session_id
    AND scoring_status = 'processing'
    AND scoring_claim_token_hash IS NULL;
  RETURN FOUND;
END;
$function$;

-- public.finalize_telefun_realtime_attempt_p5(uuid,uuid,uuid,text,integer)
CREATE OR REPLACE FUNCTION public.finalize_telefun_realtime_attempt_p5(p_attempt_id uuid, p_user_id uuid, p_finalization_key uuid, p_final_outcome text, p_duration_seconds integer)
 RETURNS TABLE(applied boolean, idempotent boolean, attempt_state text, session_status text, transcript_count bigint, usage_status text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_history public.telefun_history%ROWTYPE;
  v_messages JSONB;
  v_count BIGINT;
  v_outcome TEXT := p_final_outcome;
  v_history_status TEXT;
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_final_outcome NOT IN ('completed', 'failed', 'network_lost', 'orphaned')
     OR p_duration_seconds IS NULL OR p_duration_seconds < 0 OR p_duration_seconds > 86400 THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, 0::bigint, NULL::text, 'invalid_finalization'::text; RETURN;
  END IF;
  SELECT a.* INTO v_attempt FROM public.telefun_realtime_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, 0::bigint, NULL::text, 'attempt_not_found'::text; RETURN;
  END IF;
  IF v_attempt.finalization_key <> p_finalization_key THEN
    RETURN QUERY SELECT false, false, v_attempt.state, NULL::text, 0::bigint, v_attempt.usage_status, 'finalization_key_conflict'::text; RETURN;
  END IF;
  IF v_attempt.state = 'ended' THEN
    IF v_attempt.outcome IS DISTINCT FROM p_final_outcome THEN
      RETURN QUERY SELECT false, false, v_attempt.state, NULL::text, v_attempt.transcript_checkpoint_seq, v_attempt.usage_status, 'terminal_conflict'::text; RETURN;
    END IF;
    SELECT h.* INTO v_history FROM public.telefun_history h WHERE h.id = v_attempt.session_id;
    RETURN QUERY SELECT true, true, v_attempt.state, v_history.status, v_attempt.transcript_checkpoint_seq, v_attempt.usage_status, 'already_ended'::text; RETURN;
  END IF;
  IF v_attempt.state <> 'ending' THEN
    RETURN QUERY SELECT false, false, v_attempt.state, NULL::text, v_attempt.transcript_checkpoint_seq, v_attempt.usage_status, 'finalization_not_started'::text; RETURN;
  END IF;
  SELECT h.* INTO v_history FROM public.telefun_history h WHERE h.id = v_attempt.session_id FOR UPDATE;
  IF NOT FOUND OR v_history.user_id <> p_user_id THEN
    RETURN QUERY SELECT false, false, v_attempt.state, NULL::text, v_attempt.transcript_checkpoint_seq, v_attempt.usage_status, 'session_not_found'::text; RETURN;
  END IF;
  IF v_history.status <> 'active' THEN
    RETURN QUERY SELECT false, false, v_attempt.state, v_history.status, v_attempt.transcript_checkpoint_seq, v_attempt.usage_status, 'session_not_active'::text; RETURN;
  END IF;
  SELECT count(*) INTO v_count FROM public.telefun_realtime_transcript_events e WHERE e.attempt_id = p_attempt_id;
  IF v_count <> v_attempt.transcript_checkpoint_seq THEN
    RETURN QUERY SELECT false, false, v_attempt.state, v_history.status, v_count, v_attempt.usage_status, 'transcript_incomplete'::text; RETURN;
  END IF;
  IF v_attempt.requested_outcome IN ('failed', 'network_lost', 'orphaned') THEN
    v_outcome := v_attempt.requested_outcome;
  END IF;
  v_history_status := CASE WHEN v_outcome = 'completed' THEN 'completed' ELSE 'failed' END;
  SELECT COALESCE(jsonb_agg(jsonb_build_object('speaker', e.speaker, 'text', e.text, 'startMs', e.start_ms) ORDER BY e.sequence), '[]'::jsonb)
  INTO v_messages FROM public.telefun_realtime_transcript_events e WHERE e.attempt_id = p_attempt_id;
  UPDATE public.telefun_history SET status = v_history_status, duration_seconds = p_duration_seconds, messages = v_messages
  WHERE id = v_attempt.session_id AND status = 'active';
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, v_attempt.state, v_history.status, v_count, v_attempt.usage_status, 'session_write_failed'::text; RETURN;
  END IF;
  UPDATE public.telefun_realtime_attempts SET state = 'ended', outcome = v_outcome,
    ended_at = COALESCE(ended_at, now()), orphaned_at = CASE WHEN v_outcome = 'orphaned' THEN COALESCE(orphaned_at, now()) ELSE orphaned_at END,
    updated_at = now() WHERE id = p_attempt_id;
  RETURN QUERY SELECT true, false, 'ended'::text, v_history_status, v_count, v_attempt.usage_status, 'finalized'::text;
END;
$function$;

-- public.finalize_telefun_realtime_attempt(uuid,uuid,uuid,text,integer)
CREATE OR REPLACE FUNCTION public.finalize_telefun_realtime_attempt(p_attempt_id uuid, p_user_id uuid, p_finalization_key uuid, p_final_outcome text, p_duration_seconds integer)
 RETURNS TABLE(applied boolean, idempotent boolean, attempt_state text, session_status text, transcript_count bigint, usage_status text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_history public.telefun_history%ROWTYPE;
  v_messages JSONB;
  v_transcript_count BIGINT;
  v_outcome TEXT := p_final_outcome;
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_final_outcome NOT IN ('completed', 'failed')
     OR p_duration_seconds IS NULL
     OR p_duration_seconds < 0
     OR p_duration_seconds > 86400 THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, 0::bigint, NULL::text, 'invalid_finalization';
    RETURN;
  END IF;

  SELECT a.* INTO v_attempt
  FROM public.telefun_realtime_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::text, NULL::text, 0::bigint, NULL::text, 'attempt_not_found';
    RETURN;
  END IF;
  IF v_attempt.finalization_key <> p_finalization_key THEN
    RETURN QUERY SELECT false, false, v_attempt.state, NULL::text, 0::bigint, v_attempt.usage_status, 'finalization_key_conflict';
    RETURN;
  END IF;
  IF v_attempt.state = 'ended' THEN
    IF v_attempt.outcome IS DISTINCT FROM p_final_outcome THEN
      RETURN QUERY SELECT false, false, v_attempt.state, NULL::text, v_attempt.transcript_checkpoint_seq, v_attempt.usage_status, 'terminal_conflict';
      RETURN;
    ELSE
      SELECT h.* INTO v_history
      FROM public.telefun_history h
      WHERE h.id = v_attempt.session_id;
      RETURN QUERY SELECT true, true, v_attempt.state, v_history.status, v_attempt.transcript_checkpoint_seq, v_attempt.usage_status, 'already_ended';
      RETURN;
    END IF;
  END IF;
  IF v_attempt.state <> 'ending' THEN
    RETURN QUERY SELECT false, false, v_attempt.state, NULL::text, v_attempt.transcript_checkpoint_seq, v_attempt.usage_status, 'finalization_not_started';
    RETURN;
  END IF;

  SELECT h.* INTO v_history
  FROM public.telefun_history h
  WHERE h.id = v_attempt.session_id
  FOR UPDATE;
  IF NOT FOUND OR v_history.user_id <> p_user_id THEN
    RETURN QUERY SELECT false, false, v_attempt.state, NULL::text, v_attempt.transcript_checkpoint_seq, v_attempt.usage_status, 'session_not_found';
    RETURN;
  END IF;
  IF v_history.status <> 'active' THEN
    RETURN QUERY SELECT false, false, v_attempt.state, v_history.status, v_attempt.transcript_checkpoint_seq, v_attempt.usage_status, 'session_not_active';
    RETURN;
  END IF;

  SELECT count(*) INTO v_transcript_count
  FROM public.telefun_realtime_transcript_events e
  WHERE e.attempt_id = p_attempt_id;
  IF v_transcript_count <> v_attempt.transcript_checkpoint_seq
     OR EXISTS (
       SELECT 1
       FROM generate_series(1, v_attempt.transcript_checkpoint_seq) AS expected(sequence)
       WHERE NOT EXISTS (
         SELECT 1
         FROM public.telefun_realtime_transcript_events e
         WHERE e.attempt_id = p_attempt_id AND e.sequence = expected.sequence
       )
     ) THEN
    RETURN QUERY SELECT false, false, v_attempt.state, v_history.status, v_transcript_count, v_attempt.usage_status, 'transcript_incomplete';
    RETURN;
  END IF;

  IF v_attempt.requested_outcome = 'failed' OR v_outcome = 'failed' THEN
    v_outcome := 'failed';
  END IF;
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object('speaker', e.speaker, 'text', e.text, 'startMs', e.start_ms)
      ORDER BY e.sequence
    ),
    '[]'::jsonb
  ) INTO v_messages
  FROM public.telefun_realtime_transcript_events e
  WHERE e.attempt_id = p_attempt_id;

  UPDATE public.telefun_history
  SET status = v_outcome,
      duration_seconds = p_duration_seconds,
      messages = v_messages
  WHERE id = v_attempt.session_id AND status = 'active';

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, v_attempt.state, v_history.status, v_transcript_count, v_attempt.usage_status, 'session_write_failed';
    RETURN;
  END IF;

  UPDATE public.telefun_realtime_attempts
  SET state = 'ended',
      outcome = v_outcome,
      ended_at = COALESCE(ended_at, now()),
      updated_at = now()
  WHERE id = p_attempt_id;

  RETURN QUERY SELECT true, false, 'ended'::text, v_outcome, v_transcript_count, v_attempt.usage_status, 'finalized'::text;
END;
$function$;

-- public.get_leader_scope_snapshot(uuid,text)
CREATE OR REPLACE FUNCTION public.get_leader_scope_snapshot(p_leader_user_id uuid, p_module text)
 RETURNS TABLE(request_ids uuid[], peserta_ids uuid[], batch_names text[], tims text[], service_types text[])
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM app_internal.assert_service_role();
  RETURN QUERY
with approved_requests as (
  select lar.id
  from public.leader_access_requests lar
  where lar.leader_user_id = p_leader_user_id
    and lar.status = 'approved'
    and (lar.module = p_module or lar.module = 'all')
),
group_ids as (
  select distinct larg.access_group_id
  from public.leader_access_request_groups larg
  join approved_requests ar on ar.id = larg.request_id
),
scope_items as (
  select agi.field_name, agi.field_value
  from public.access_group_items agi
  join public.access_groups ag
    on ag.id = agi.access_group_id
   and ag.is_active = true
  join group_ids gid
    on gid.access_group_id = agi.access_group_id
  where agi.is_active = true
),
expanded_ids as (
  select field_value::uuid as peserta_id
  from scope_items
  where field_name = 'peserta_id'
    and field_value ~* '^[0-9a-f-]{36}$'
  union
  select pp.id
  from public.profiler_peserta pp
  join scope_items si
    on si.field_name = 'batch_name'
   and si.field_value = pp.batch_name
  union
  select pp.id
  from public.profiler_peserta pp
  join scope_items si
    on si.field_name = 'tim'
   and si.field_value = pp.tim
)
select
  coalesce((select array_agg(distinct id order by id) from approved_requests), '{}'::uuid[]),
  coalesce((select array_agg(distinct peserta_id order by peserta_id) from expanded_ids), '{}'::uuid[]),
  coalesce((select array_agg(distinct field_value order by field_value) from scope_items where field_name = 'batch_name'), '{}'::text[]),
  coalesce((select array_agg(distinct field_value order by field_value) from scope_items where field_name = 'tim'), '{}'::text[]),
  coalesce((select array_agg(distinct field_value order by field_value) from scope_items where field_name = 'service_type' and field_value in ('call','chat','email','cso','pencatatan','bko','slik')), '{}'::text[]);
END;
$function$;

-- public.get_profiler_folder_counts(uuid[])
CREATE OR REPLACE FUNCTION public.get_profiler_folder_counts(p_accessible_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS TABLE(batch_name text, peserta_count bigint)
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
BEGIN
  PERFORM app_internal.assert_service_role();
  RETURN QUERY
  select
    pp.batch_name,
    count(*)::bigint as peserta_count
  from public.profiler_peserta pp
  where p_accessible_ids is null
     or pp.id = any(p_accessible_ids)
  group by pp.batch_name
  order by pp.batch_name;
END;
$function$;

-- public.mark_telefun_realtime_sideband_connected(uuid,uuid)
CREATE OR REPLACE FUNCTION public.mark_telefun_realtime_sideband_connected(p_attempt_id uuid, p_user_id uuid)
 RETURNS TABLE(accepted boolean, state text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_state TEXT;
  v_hash TEXT;
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT a.state, a.provider_call_id_hash
  INTO v_state, v_hash
  FROM public.telefun_realtime_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id
  FOR UPDATE;

  IF v_state IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'attempt_not_found';
    RETURN;
  END IF;
  IF v_state IN ('ending', 'ended') THEN
    RETURN QUERY SELECT false, v_state, 'attempt_terminalizing';
    RETURN;
  END IF;
  IF v_hash IS NULL THEN
    RETURN QUERY SELECT false, v_state, 'provider_not_bound';
    RETURN;
  END IF;
  IF v_state = 'sideband_connected' THEN
    RETURN QUERY SELECT true, v_state, 'idempotent';
    RETURN;
  END IF;
  IF v_state <> 'brokered' THEN
    RETURN QUERY SELECT false, v_state, 'invalid_attempt_state';
    RETURN;
  END IF;

  UPDATE public.telefun_realtime_attempts
  SET state = 'sideband_connected',
      sideband_connected_at = COALESCE(sideband_connected_at, now()),
      updated_at = now()
  WHERE id = p_attempt_id;

  RETURN QUERY SELECT true, 'sideband_connected'::text, 'connected'::text;
END;
$function$;

-- public.mark_telefun_realtime_usage(uuid,uuid,text,text)
CREATE OR REPLACE FUNCTION public.mark_telefun_realtime_usage(p_attempt_id uuid, p_user_id uuid, p_usage_status text, p_error text DEFAULT NULL::text)
 RETURNS TABLE(applied boolean, idempotent boolean, usage_request_id text, usage_status text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_usage_user UUID;
  v_usage_provider TEXT;
  v_usage_model TEXT;
  v_usage_module TEXT;
  v_usage_status TEXT;
  v_safe_error TEXT := left(regexp_replace(coalesce(p_error, ''), '\s+', ' ', 'g'), 512);
BEGIN
  PERFORM app_internal.assert_service_role();
  SELECT a.* INTO v_attempt
  FROM public.telefun_realtime_attempts a
  WHERE a.id = p_attempt_id AND a.user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, false, NULL::text, 'failed'::text, 'attempt_not_found';
    RETURN;
  END IF;
  IF p_usage_status NOT IN ('persisted', 'incomplete', 'failed') THEN
    RETURN QUERY SELECT false, false, v_attempt.usage_request_id, v_attempt.usage_status, 'invalid_usage_status';
    RETURN;
  END IF;

  IF p_usage_status = 'failed' THEN
    RETURN QUERY SELECT false, false, v_attempt.usage_request_id, 'failed'::text, 'usage_audit_unavailable';
    RETURN;
  END IF;

  SELECT l.user_id, l.provider, l.model_id, l.module, l.status
  INTO v_usage_user, v_usage_provider, v_usage_model, v_usage_module, v_usage_status
  FROM public.ai_usage_logs l
  WHERE l.request_id = v_attempt.usage_request_id;

  IF p_usage_status = 'persisted' THEN
    IF v_usage_user = p_user_id
       AND v_usage_provider = 'openai'
       AND v_usage_model = v_attempt.model_id
       AND v_usage_module = 'telefun'
       AND v_usage_status = 'success' THEN
      UPDATE public.telefun_realtime_attempts
      SET usage_status = 'persisted', usage_updated_at = now(), updated_at = now()
      WHERE id = p_attempt_id;
      RETURN QUERY SELECT true, v_attempt.usage_status = 'persisted', v_attempt.usage_request_id, 'persisted'::text, 'persisted'::text;
      RETURN;
    END IF;
    IF v_usage_user IS NOT NULL THEN
      RETURN QUERY SELECT false, false, v_attempt.usage_request_id, v_attempt.usage_status, 'usage_request_conflict';
      RETURN;
    END IF;
    RETURN QUERY SELECT false, false, v_attempt.usage_request_id, v_attempt.usage_status, 'usage_row_missing';
    RETURN;
  END IF;

  -- Missing/unpriceable usage is a non-billable failed audit row. A repeated
  -- identical audit is idempotent; a row belonging to another context fails.
  IF v_usage_user IS NOT NULL THEN
    IF v_usage_user = p_user_id
       AND v_usage_provider = 'openai'
       AND v_usage_model = v_attempt.model_id
       AND v_usage_module = 'telefun'
       AND v_usage_status = 'failed' THEN
      UPDATE public.telefun_realtime_attempts
      SET usage_status = 'incomplete', usage_updated_at = now(),
          last_error = NULLIF(v_safe_error, ''), updated_at = now()
      WHERE id = p_attempt_id;
      RETURN QUERY SELECT true, v_attempt.usage_status = 'incomplete', v_attempt.usage_request_id, 'incomplete'::text, 'audit_exists'::text;
      RETURN;
    END IF;
    RETURN QUERY SELECT false, false, v_attempt.usage_request_id, v_attempt.usage_status, 'usage_request_conflict';
    RETURN;
  END IF;

  INSERT INTO public.ai_usage_logs (
    request_id, user_id, provider, model_id, module, action,
    input_tokens, output_tokens, total_tokens,
    input_price_usd_per_million, output_price_usd_per_million,
    usd_to_idr_rate, estimated_cost_usd, estimated_cost_idr,
    status, error_message, raw_usage_metadata
  ) VALUES (
    v_attempt.usage_request_id, p_user_id, 'openai', v_attempt.model_id, 'telefun', 'voice_live',
    0, 0, 0, 0, 0, 0, 0, 0, 'failed',
    NULLIF(v_safe_error, ''),
    jsonb_build_object('billing_model', 'openai_realtime_per_response_v1', 'status', 'failed')
  );

  UPDATE public.telefun_realtime_attempts
  SET usage_status = 'incomplete', usage_updated_at = now(),
      last_error = NULLIF(v_safe_error, ''), updated_at = now()
  WHERE id = p_attempt_id;
  RETURN QUERY SELECT true, false, v_attempt.usage_request_id, 'incomplete'::text, 'audit_inserted'::text;
EXCEPTION
  WHEN unique_violation THEN
    RETURN QUERY SELECT false, false, v_attempt.usage_request_id, 'failed'::text, 'usage_request_conflict';
END;
$function$;

-- public.mark_telefun_recording_ready(uuid,uuid,text,text)
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
  SELECT h.* INTO v_session
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'pending'::text, false, false, NULL::timestamptz, 'pending'::text, 'session_not_found';
    RETURN;
  END IF;
  IF v_session.user_id <> p_user_id THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'not_owner';
    RETURN;
  END IF;
  -- A failed capture is a latch. Remux may not turn an agent-only survivor
  -- into scoring-ready until a later explicit successful upload transition
  -- clears the failure through mark_telefun_recording_uploaded.
  IF v_session.recording_status = 'failed' OR v_session.recording_error IS NOT NULL THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'capture_failed';
    RETURN;
  END IF;
  IF p_recording_path IS NOT NULL
     AND p_recording_path !~ ('^' || p_user_id::text || '/' || p_session_id::text || '/full_call\.seekable\.webm$') THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'invalid_seekable_path';
    RETURN;
  END IF;
  IF p_agent_recording_path IS NOT NULL
     AND p_agent_recording_path !~ ('^' || p_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$') THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'invalid_seekable_path';
    RETURN;
  END IF;
  IF p_recording_path IS NOT NULL
     AND v_session.recording_path IS NOT NULL
     AND p_recording_path <> v_session.recording_path
     AND NOT (
       v_session.recording_path = p_user_id::text || '/' || p_session_id::text || '/full_call.webm'
       AND p_recording_path = p_user_id::text || '/' || p_session_id::text || '/full_call.seekable.webm'
     ) THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'path_conflict';
    RETURN;
  END IF;
  IF p_agent_recording_path IS NOT NULL
     AND v_session.agent_recording_path IS NOT NULL
     AND p_agent_recording_path <> v_session.agent_recording_path
     AND NOT (
       v_session.agent_recording_path = p_user_id::text || '/' || p_session_id::text || '/agent_only.webm'
       AND p_agent_recording_path = p_user_id::text || '/' || p_session_id::text || '/agent_only.seekable.webm'
     ) THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'path_conflict';
    RETURN;
  END IF;

  v_recording_path := COALESCE(p_recording_path, v_session.recording_path);
  v_agent_recording_path := COALESCE(p_agent_recording_path, v_session.agent_recording_path);
  IF v_recording_path IS NULL AND v_agent_recording_path IS NULL THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, v_session.scoring_ready_at, COALESCE(v_session.scoring_status, 'pending'), 'recording_required';
    RETURN;
  END IF;

  v_recording_status := CASE
    WHEN v_recording_path ~ ('^' || p_user_id::text || '/' || p_session_id::text || '/full_call\.seekable\.webm$')
      AND v_agent_recording_path ~ ('^' || p_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$')
      THEN 'ready'
    ELSE 'partial'
  END;
  v_scoring_status := COALESCE(v_session.scoring_status, 'pending');
  v_scoring_ready_at := v_session.scoring_ready_at;

  IF v_session.status = 'completed'
     AND v_agent_recording_path ~ ('^' || p_user_id::text || '/' || p_session_id::text || '/agent_only\.seekable\.webm$') THEN
    v_scoring_ready_at := COALESCE(v_scoring_ready_at, v_now);
    IF v_scoring_status NOT IN ('processing', 'completed') THEN
      v_scoring_status := 'pending';
    END IF;
  END IF;

  UPDATE public.telefun_history
  SET recording_path = v_recording_path,
      agent_recording_path = v_agent_recording_path,
      recording_status = v_recording_status,
      recording_ready_at = COALESCE(recording_ready_at, v_now),
      recording_error = NULL,
      scoring_ready_at = v_scoring_ready_at,
      scoring_status = v_scoring_status,
      scoring_next_attempt_at = CASE
        WHEN v_scoring_ready_at IS NOT NULL AND v_scoring_status = 'pending'
          THEN COALESCE(scoring_next_attempt_at, v_now)
        ELSE scoring_next_attempt_at
      END
  WHERE id = p_session_id;

  RETURN QUERY SELECT true,
    v_recording_status,
    true,
    v_scoring_ready_at IS NOT NULL,
    v_scoring_ready_at,
    v_scoring_status,
    'ready'::text;
END;
$function$;

-- public.mark_telefun_recording_uploaded(uuid,uuid,text,text,text)
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
  SELECT h.* INTO v_session
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'pending'::text, false, false, 'pending'::text, 'session_not_found';
    RETURN;
  END IF;
  IF v_session.user_id <> p_user_id THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'not_owner';
    RETURN;
  END IF;
  IF p_capture_status NOT IN ('ready', 'failed') THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'invalid_capture_status';
    RETURN;
  END IF;
  IF p_recording_path IS NOT NULL
     AND p_recording_path !~ ('^' || p_user_id::text || '/' || p_session_id::text || '/full_call\.[A-Za-z0-9]+$') THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, COALESCE(v_session.scoring_status, 'pending'), 'invalid_recording_path';
    RETURN;
  END IF;
  IF p_agent_recording_path IS NOT NULL
     AND p_agent_recording_path !~ ('^' || p_user_id::text || '/' || p_session_id::text || '/agent_only\.[A-Za-z0-9]+$') THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, COALESCE(v_session.scoring_status, 'pending'), 'invalid_recording_path';
    RETURN;
  END IF;
  IF p_recording_path IS NOT NULL
     AND v_session.recording_path IS NOT NULL
     AND p_recording_path <> v_session.recording_path THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'path_conflict';
    RETURN;
  END IF;
  IF p_agent_recording_path IS NOT NULL
     AND v_session.agent_recording_path IS NOT NULL
     AND p_agent_recording_path <> v_session.agent_recording_path THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'path_conflict';
    RETURN;
  END IF;

  v_recording_path := COALESCE(p_recording_path, v_session.recording_path);
  v_agent_recording_path := COALESCE(p_agent_recording_path, v_session.agent_recording_path);
  IF p_capture_status = 'ready' AND v_recording_path IS NULL AND v_agent_recording_path IS NULL THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, COALESCE(v_session.scoring_status, 'pending'), 'recording_required';
    RETURN;
  END IF;

  v_scoring_status := COALESCE(v_session.scoring_status, 'pending');
  IF p_capture_status = 'failed' THEN
    v_recording_status := 'failed';
    IF v_session.telefun_transport = 'openai-webrtc'
       AND v_scoring_status = 'processing' THEN
      v_scoring_status := 'failed';
    END IF;
  ELSIF v_session.recording_status IN ('partial', 'ready') THEN
    v_recording_status := v_session.recording_status;
  ELSE
    v_recording_status := 'uploaded';
  END IF;

  -- A failed WebRTC processing capture applies scoring_status = 'failed',
  -- scoring_claimed_at = NULL, and scoring_last_error = 'Recording capture failed'.
  UPDATE public.telefun_history
  SET recording_path = v_recording_path,
      agent_recording_path = v_agent_recording_path,
      recording_status = v_recording_status,
      recording_error = CASE
        WHEN p_capture_status = 'failed' THEN 'Recording capture failed'
        ELSE NULL
      END,
      scoring_status = CASE
        WHEN p_capture_status = 'failed'
             AND v_session.telefun_transport = 'openai-webrtc'
             AND v_session.scoring_status = 'processing'
          THEN 'failed'
        ELSE COALESCE(v_session.scoring_status, 'pending')
      END,
      scoring_claimed_at = CASE
        WHEN p_capture_status = 'failed'
             AND v_session.telefun_transport = 'openai-webrtc'
             AND v_session.scoring_status = 'processing'
          THEN NULL
        ELSE v_session.scoring_claimed_at
      END,
      scoring_last_error = CASE
        WHEN p_capture_status = 'failed'
             AND v_session.telefun_transport = 'openai-webrtc'
          THEN 'Recording capture failed'
        ELSE v_session.scoring_last_error
      END,
      scoring_ready_at = CASE WHEN p_capture_status = 'failed' THEN NULL ELSE v_session.scoring_ready_at END,
      scoring_next_attempt_at = CASE WHEN p_capture_status = 'failed' THEN NULL ELSE v_session.scoring_next_attempt_at END
  WHERE id = p_session_id;

  RETURN QUERY SELECT true,
    v_recording_status,
    (v_session.recording_ready_at IS NOT NULL
      OR v_recording_path IS NOT NULL
      OR v_agent_recording_path IS NOT NULL)
      AND v_recording_status IN ('partial', 'ready'),
    CASE WHEN p_capture_status = 'failed' THEN false ELSE v_session.scoring_ready_at IS NOT NULL END,
    v_scoring_status,
    CASE WHEN p_capture_status = 'failed' THEN 'capture_failed' ELSE 'uploaded' END;
END;
$function$;

-- public.record_telefun_realtime_metric(text,text,text,uuid,uuid,bigint,jsonb)
CREATE OR REPLACE FUNCTION public.record_telefun_realtime_metric(p_metric_name text, p_provider text DEFAULT 'openai-webrtc'::text, p_user_id_hash text DEFAULT NULL::text, p_session_id uuid DEFAULT NULL::uuid, p_attempt_id uuid DEFAULT NULL::uuid, p_value bigint DEFAULT NULL::bigint, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS TABLE(recorded boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_provider <> 'openai-webrtc'
     OR p_metric_name NOT IN ('cost_reconciliation', 'sideband_disconnect', 'duplicate_write', 'missing_usage', 'orphan', 'session_cap')
     OR p_user_id_hash IS NOT NULL AND p_user_id_hash !~ '^[a-f0-9]{64}$'
     OR p_value IS NOT NULL AND p_value < 0
     OR octet_length(COALESCE(p_metadata, '{}'::jsonb)::text) > 4096 THEN
    RETURN QUERY SELECT false, 'invalid_metric'::text; RETURN;
  END IF;
  INSERT INTO public.telefun_realtime_metrics (
    metric_name, provider, user_id_hash, session_id, attempt_id, value, metadata
  ) VALUES (
    p_metric_name, p_provider, p_user_id_hash, p_session_id, p_attempt_id, p_value,
    COALESCE(p_metadata, '{}'::jsonb)
  );
  IF p_attempt_id IS NOT NULL THEN
    IF p_metric_name = 'sideband_disconnect' THEN
      UPDATE public.telefun_realtime_attempts
      SET sideband_disconnect_count = sideband_disconnect_count + 1,
          updated_at = now()
      WHERE id = p_attempt_id;
    ELSIF p_metric_name = 'duplicate_write' THEN
      UPDATE public.telefun_realtime_attempts
      SET duplicate_write_count = duplicate_write_count + 1,
          updated_at = now()
      WHERE id = p_attempt_id;
    ELSIF p_metric_name = 'missing_usage' THEN
      UPDATE public.telefun_realtime_attempts
      SET missing_usage_count = missing_usage_count + 1,
          updated_at = now()
      WHERE id = p_attempt_id;
    END IF;
  END IF;
  RETURN QUERY SELECT true, 'recorded'::text;
END;
$function$;

-- public.refresh_mv_qa_period_summary()
CREATE OR REPLACE FUNCTION public.refresh_mv_qa_period_summary()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  PERFORM app_internal.assert_service_role();
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_qa_period_summary;
END;
$function$;

-- public.release_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,text)
CREATE OR REPLACE FUNCTION public.release_telefun_realtime_lease(p_lease_id uuid, p_user_id uuid, p_session_id uuid, p_attempt_id uuid, p_lease_token_hash text, p_outcome text)
 RETURNS TABLE(released boolean, idempotent boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_outcome NOT IN ('completed', 'failed', 'network_lost', 'orphaned') THEN
    RETURN QUERY SELECT false, false, 'invalid_outcome'::text; RETURN;
  END IF;
  UPDATE public.telefun_realtime_leases
  SET state = CASE WHEN p_outcome = 'orphaned' THEN 'orphaned' ELSE 'released' END,
      terminal_outcome = p_outcome, updated_at = now()
  WHERE id = p_lease_id AND user_id = p_user_id AND session_id = p_session_id
    AND attempt_id = p_attempt_id AND lease_token_hash = p_lease_token_hash
    AND state = 'active';
  IF FOUND THEN
    RETURN QUERY SELECT true, false, 'released'::text; RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.telefun_realtime_leases
    WHERE id = p_lease_id AND user_id = p_user_id AND attempt_id = p_attempt_id
      AND state IN ('released', 'orphaned')
  ) THEN
    RETURN QUERY SELECT true, true, 'idempotent'::text; RETURN;
  END IF;
  RETURN QUERY SELECT false, false, 'lease_not_found'::text;
END;
$function$;

-- public.renew_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,integer)
CREATE OR REPLACE FUNCTION public.renew_telefun_realtime_lease(p_lease_id uuid, p_user_id uuid, p_session_id uuid, p_attempt_id uuid, p_lease_token_hash text, p_ttl_ms integer)
 RETURNS TABLE(renewed boolean, expires_at timestamp with time zone, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_next TIMESTAMPTZ;
  v_lease public.telefun_realtime_leases%ROWTYPE;
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_ttl_ms NOT BETWEEN 1000 AND 120000 THEN
    RETURN QUERY SELECT false, v_now, 'invalid_ttl'::text;
    RETURN;
  END IF;

  SELECT lease.* INTO v_lease
  FROM public.telefun_realtime_leases AS lease
  WHERE lease.id = p_lease_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, v_now, 'lease_not_found'::text;
    RETURN;
  END IF;

  v_now := clock_timestamp();
  IF v_lease.user_id IS DISTINCT FROM p_user_id
     OR v_lease.session_id IS DISTINCT FROM p_session_id
     OR v_lease.attempt_id IS DISTINCT FROM p_attempt_id
     OR v_lease.lease_token_hash IS DISTINCT FROM p_lease_token_hash THEN
    RETURN QUERY SELECT false, v_now, 'owner_mismatch'::text;
    RETURN;
  END IF;
  IF v_lease.state IS DISTINCT FROM 'active' THEN
    RETURN QUERY SELECT false, v_lease.expires_at, 'inactive'::text;
    RETURN;
  END IF;
  IF v_lease.expires_at <= v_now THEN
    RETURN QUERY SELECT false, v_lease.expires_at, 'expired'::text;
    RETURN;
  END IF;

  v_next := v_now + make_interval(
    secs => p_ttl_ms::double precision / 1000.0
  );
  UPDATE public.telefun_realtime_leases AS lease
  SET expires_at = v_next,
      heartbeat_at = v_now,
      updated_at = v_now
  WHERE lease.id = p_lease_id
    AND lease.user_id = p_user_id
    AND lease.session_id = p_session_id
    AND lease.attempt_id = p_attempt_id
    AND lease.lease_token_hash = p_lease_token_hash
    AND lease.state = 'active'
    AND lease.expires_at > v_now;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, v_now, 'renewal_conflict'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_next, 'renewed'::text;
END;
$function$;

-- public.reschedule_telefun_scoring(uuid,text,timestamptz,text)
CREATE OR REPLACE FUNCTION public.reschedule_telefun_scoring(p_session_id uuid, p_error text, p_next_attempt_at timestamp with time zone, p_claim_token_hash text)
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
      scoring_next_attempt_at = p_next_attempt_at,
      scoring_claim_token_hash = NULL,
      scoring_claim_owner = NULL
  WHERE id = p_session_id
    AND scoring_status = 'processing'
    AND p_claim_token_hash IS NOT NULL
    AND scoring_claim_token_hash IS NOT DISTINCT FROM p_claim_token_hash;

  RETURN FOUND;
END;
$function$;

-- public.reschedule_telefun_scoring(uuid,text,timestamptz)
CREATE OR REPLACE FUNCTION public.reschedule_telefun_scoring(p_session_id uuid, p_error text, p_next_attempt_at timestamp with time zone)
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
      scoring_next_attempt_at = p_next_attempt_at,
      scoring_claim_token_hash = NULL,
      scoring_claim_owner = NULL
  WHERE id = p_session_id
    AND scoring_status = 'processing'
    AND scoring_claim_token_hash IS NULL;
  RETURN FOUND;
END;
$function$;

-- public.store_telefun_realtime_provider_call_reference(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.store_telefun_realtime_provider_call_reference(p_attempt_id uuid, p_user_id uuid, p_provider_call_reference text)
 RETURNS TABLE(accepted boolean, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
BEGIN
  PERFORM app_internal.assert_service_role();
  IF p_provider_call_reference IS NULL OR char_length(p_provider_call_reference) > 16384 THEN
    RETURN QUERY SELECT false, 'invalid_reference'::text;
    RETURN;
  END IF;
  UPDATE public.telefun_realtime_attempts
  SET provider_call_reference = p_provider_call_reference, updated_at = now()
  WHERE id = p_attempt_id AND user_id = p_user_id AND state <> 'ended';
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'attempt_not_found'::text;
    RETURN;
  END IF;
  UPDATE public.telefun_realtime_leases
  SET provider_call_reference = p_provider_call_reference, updated_at = now()
  WHERE attempt_id = p_attempt_id AND user_id = p_user_id;
  RETURN QUERY SELECT true, 'stored'::text;
END;
$function$;

ALTER FUNCTION public.get_leader_approved_scope_items(uuid,text) SET SCHEMA app_internal;
REVOKE ALL ON FUNCTION app_internal.get_leader_approved_scope_items(uuid,text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.begin_telefun_realtime_finalization_p5(uuid,uuid,uuid,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.begin_telefun_realtime_finalization(uuid,uuid,uuid,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.bind_telefun_realtime_provider_call(uuid,uuid,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_telefun_realtime_transcript(uuid,uuid,bigint,text,text,text,integer,boolean) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_telefun_realtime_attempt(uuid,uuid,uuid,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_telefun_realtime_lease(uuid,uuid,uuid,text,text,integer,integer,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_telefun_realtime_orphans(integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring(uuid,integer,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring(uuid,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_pdkt_mailbox_subject_intents() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_telefun_realtime_orphan(uuid,uuid,text,boolean,boolean,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring(uuid,numeric,jsonb,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring(uuid,numeric,jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_telefun_realtime_rate_limit(text,uuid,uuid,text,integer,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_monitoring_history(text,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_telefun_scoring(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_telefun_realtime_session_without_attempt(uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_telefun_scoring(uuid,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fail_telefun_scoring(uuid,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_telefun_realtime_attempt_p5(uuid,uuid,uuid,text,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_telefun_realtime_attempt(uuid,uuid,uuid,text,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_leader_scope_snapshot(uuid,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_profiler_folder_counts(uuid[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_telefun_realtime_sideband_connected(uuid,uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_telefun_realtime_usage(uuid,uuid,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_telefun_recording_ready(uuid,uuid,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_telefun_recording_uploaded(uuid,uuid,text,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_telefun_realtime_metric(text,text,text,uuid,uuid,bigint,jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.renew_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_telefun_scoring(uuid,text,timestamptz,text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_telefun_scoring(uuid,text,timestamptz) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.store_telefun_realtime_provider_call_reference(uuid,uuid,text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

DO $check$
DECLARE
  v_signature text;
  v_oid oid;
  v_source text;
BEGIN
  FOR v_signature IN SELECT signature FROM (VALUES
      ('public.begin_telefun_realtime_finalization_p5(uuid,uuid,uuid,text)'),
      ('public.begin_telefun_realtime_finalization(uuid,uuid,uuid,text)'),
      ('public.bind_telefun_realtime_provider_call(uuid,uuid,text)'),
      ('public.checkpoint_telefun_realtime_transcript(uuid,uuid,bigint,text,text,text,integer,boolean)'),
      ('public.claim_telefun_realtime_attempt(uuid,uuid,uuid,text,text)'),
      ('public.claim_telefun_realtime_lease(uuid,uuid,uuid,text,text,integer,integer,integer)'),
      ('public.claim_telefun_realtime_orphans(integer)'),
      ('public.claim_telefun_scoring(uuid,integer,text,text)'),
      ('public.claim_telefun_scoring(uuid,integer)'),
      ('public.cleanup_pdkt_mailbox_subject_intents()'),
      ('public.complete_telefun_realtime_orphan(uuid,uuid,text,boolean,boolean,text)'),
      ('public.complete_telefun_scoring(uuid,numeric,jsonb,text)'),
      ('public.complete_telefun_scoring(uuid,numeric,jsonb)'),
      ('public.consume_telefun_realtime_rate_limit(text,uuid,uuid,text,integer,integer)'),
      ('public.delete_monitoring_history(text,uuid)'),
      ('public.enqueue_telefun_scoring(uuid)'),
      ('public.fail_telefun_realtime_session_without_attempt(uuid,uuid)'),
      ('public.fail_telefun_scoring(uuid,text,text)'),
      ('public.fail_telefun_scoring(uuid,text)'),
      ('public.finalize_telefun_realtime_attempt_p5(uuid,uuid,uuid,text,integer)'),
      ('public.finalize_telefun_realtime_attempt(uuid,uuid,uuid,text,integer)'),
      ('public.get_leader_scope_snapshot(uuid,text)'),
      ('public.get_profiler_folder_counts(uuid[])'),
      ('public.mark_telefun_realtime_sideband_connected(uuid,uuid)'),
      ('public.mark_telefun_realtime_usage(uuid,uuid,text,text)'),
      ('public.mark_telefun_recording_ready(uuid,uuid,text,text)'),
      ('public.mark_telefun_recording_uploaded(uuid,uuid,text,text,text)'),
      ('public.record_telefun_realtime_metric(text,text,text,uuid,uuid,bigint,jsonb)'),
      ('public.refresh_mv_qa_period_summary()'),
      ('public.release_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,text)'),
      ('public.renew_telefun_realtime_lease(uuid,uuid,uuid,uuid,text,integer)'),
      ('public.reschedule_telefun_scoring(uuid,text,timestamptz,text)'),
      ('public.reschedule_telefun_scoring(uuid,text,timestamptz)'),
      ('public.store_telefun_realtime_provider_call_reference(uuid,uuid,text)')
    ) AS expected(signature)
  LOOP
    v_oid := to_regprocedure(v_signature);
    IF v_oid IS NULL OR NOT has_function_privilege('anon', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('authenticated', v_oid, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_oid, 'EXECUTE') THEN
      RAISE EXCEPTION 'Group A missing function or EXECUTE: %', v_signature;
    END IF;
    SELECT prosrc INTO v_source FROM pg_proc
      WHERE oid = v_oid AND prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
        AND prosecdef AND proowner = 'postgres'::regrole;
    IF v_source IS NULL THEN
      RAISE EXCEPTION 'Group A must be plpgsql SECURITY DEFINER owned by postgres: %', v_signature;
    END IF;
    v_source := regexp_replace(v_source, '^\s*#variable_conflict\s+\w+\s*', '', 'i');
    v_source := regexp_replace(v_source, '^\s*DECLARE\M.*?\mBEGIN\M', 'BEGIN', 'is');
    IF v_source !~* '^\s*BEGIN\s+PERFORM app_internal\.assert_service_role\(\);' THEN
      RAISE EXCEPTION 'Group A missing first-statement guard: %', v_signature;
    END IF;
  END LOOP;
  IF has_schema_privilege('anon', 'app_internal', 'USAGE')
     OR has_schema_privilege('authenticated', 'app_internal', 'USAGE')
     OR EXISTS (
       SELECT 1 FROM pg_namespace n,
         LATERAL aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner))) a
       WHERE n.nspname = 'app_internal' AND a.grantee = 0
         AND a.privilege_type = 'USAGE'
     ) THEN
    RAISE EXCEPTION 'app_internal must deny client/PUBLIC USAGE';
  END IF;
  IF has_function_privilege('anon', 'app_internal.assert_service_role()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app_internal.assert_service_role()', 'EXECUTE')
     OR has_function_privilege('anon', 'app_internal.get_leader_approved_scope_items(uuid,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'app_internal.get_leader_approved_scope_items(uuid,text)', 'EXECUTE')
     OR EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
         LATERAL aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
       WHERE n.nspname = 'app_internal' AND p.proname IN ('assert_service_role', 'get_leader_approved_scope_items')
         AND a.grantee = 0 AND a.privilege_type = 'EXECUTE'
     ) THEN
    RAISE EXCEPTION 'app_internal guard/moved function must deny client/PUBLIC EXECUTE';
  END IF;
  IF to_regprocedure('public.get_leader_approved_scope_items(uuid,text)') IS NOT NULL
     OR to_regprocedure('app_internal.get_leader_approved_scope_items(uuid,text)') IS NULL THEN
    RAISE EXCEPTION 'Q3 function must reside only in app_internal';
  END IF;
END
$check$;
