BEGIN;

-- Phase 4 is additive. Existing history, scoring, usage, and storage contracts
-- remain available to Gemini and legacy OpenAI WebSocket sessions.
ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS recording_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS recording_ready_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recording_error TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS scoring_ready_at TIMESTAMPTZ DEFAULT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.telefun_history'::regclass
      AND conname = 'telefun_history_recording_status_check'
  ) THEN
    ALTER TABLE public.telefun_history
      ADD CONSTRAINT telefun_history_recording_status_check
      CHECK (recording_status IN ('pending', 'uploaded', 'partial', 'ready', 'failed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.telefun_history'::regclass
      AND conname = 'telefun_history_recording_error_check'
  ) THEN
    ALTER TABLE public.telefun_history
      ADD CONSTRAINT telefun_history_recording_error_check
      CHECK (recording_error IS NULL OR char_length(recording_error) <= 512);
  END IF;
END
$$;

-- Compatibility backfill is deliberately conservative: it only fills the new
-- readiness fields from paths that already existed before this migration.
UPDATE public.telefun_history
SET
  recording_status = CASE
    WHEN recording_path IS NOT NULL AND agent_recording_path IS NOT NULL THEN 'ready'
    WHEN recording_path IS NOT NULL OR agent_recording_path IS NOT NULL THEN 'partial'
    ELSE recording_status
  END,
  recording_ready_at = CASE
    WHEN recording_path IS NOT NULL OR agent_recording_path IS NOT NULL
      THEN COALESCE(recording_ready_at, COALESCE(created_at, now()))
    ELSE recording_ready_at
  END,
  scoring_ready_at = CASE
    WHEN status = 'completed' AND agent_recording_path IS NOT NULL
      THEN COALESCE(scoring_ready_at, COALESCE(created_at, now()))
    ELSE scoring_ready_at
  END
WHERE recording_status = 'pending'
   OR recording_ready_at IS NULL
   OR (status = 'completed' AND agent_recording_path IS NOT NULL AND scoring_ready_at IS NULL);

CREATE TABLE IF NOT EXISTS public.telefun_realtime_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  model_id TEXT NOT NULL,
  transport TEXT NOT NULL DEFAULT 'openai-webrtc',
  state TEXT NOT NULL DEFAULT 'claimed',
  requested_outcome TEXT DEFAULT NULL,
  outcome TEXT DEFAULT NULL,
  finalization_key UUID NOT NULL DEFAULT gen_random_uuid(),
  provider_call_id_hash TEXT DEFAULT NULL,
  usage_request_id TEXT NOT NULL,
  usage_status TEXT NOT NULL DEFAULT 'pending',
  transcript_checkpoint_seq BIGINT NOT NULL DEFAULT 0,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  brokered_at TIMESTAMPTZ DEFAULT NULL,
  sideband_connected_at TIMESTAMPTZ DEFAULT NULL,
  finalization_started_at TIMESTAMPTZ DEFAULT NULL,
  ended_at TIMESTAMPTZ DEFAULT NULL,
  transcript_checkpoint_at TIMESTAMPTZ DEFAULT NULL,
  usage_updated_at TIMESTAMPTZ DEFAULT NULL,
  last_error TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telefun_realtime_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT telefun_realtime_attempts_session_fkey
    FOREIGN KEY (session_id) REFERENCES public.telefun_history(id) ON DELETE CASCADE,
  CONSTRAINT telefun_realtime_attempts_user_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE(session_id),
  UNIQUE(finalization_key),
  UNIQUE(usage_request_id),
  CONSTRAINT telefun_realtime_attempts_model_check
    CHECK (model_id = 'gpt-realtime-2.1'),
  CONSTRAINT telefun_realtime_attempts_transport_check
    CHECK (transport = 'openai-webrtc'),
  CONSTRAINT telefun_realtime_attempts_state_check
    CHECK (state IN ('claimed', 'brokered', 'sideband_connected', 'ending', 'ended')),
  CONSTRAINT telefun_realtime_attempts_requested_outcome_check
    CHECK (requested_outcome IS NULL OR requested_outcome IN ('completed', 'failed')),
  CONSTRAINT telefun_realtime_attempts_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('completed', 'failed')),
  CONSTRAINT telefun_realtime_attempts_provider_hash_check
    CHECK (provider_call_id_hash IS NULL OR provider_call_id_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT telefun_realtime_attempts_usage_request_check
    CHECK (usage_request_id LIKE 'telefun-webrtc:%' AND char_length(usage_request_id) <= 128),
  CONSTRAINT telefun_realtime_attempts_usage_status_check
    CHECK (usage_status IN ('pending', 'persisted', 'incomplete', 'failed')),
  CONSTRAINT telefun_realtime_attempts_checkpoint_check
    CHECK (transcript_checkpoint_seq >= 0),
  CONSTRAINT telefun_realtime_attempts_last_error_check
    CHECK (last_error IS NULL OR char_length(last_error) <= 512)
);

CREATE INDEX IF NOT EXISTS idx_telefun_realtime_attempts_state_updated
  ON public.telefun_realtime_attempts(state, updated_at);
CREATE INDEX IF NOT EXISTS idx_telefun_realtime_attempts_active
  ON public.telefun_realtime_attempts(updated_at)
  WHERE state IN ('claimed', 'brokered', 'sideband_connected', 'ending');
CREATE INDEX IF NOT EXISTS idx_telefun_realtime_attempts_usage
  ON public.telefun_realtime_attempts(usage_status, updated_at);

CREATE TABLE IF NOT EXISTS public.telefun_realtime_transcript_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL,
  sequence BIGINT NOT NULL,
  dedupe_key TEXT NOT NULL,
  speaker TEXT NOT NULL,
  text TEXT NOT NULL,
  start_ms INTEGER NOT NULL DEFAULT 0,
  is_partial BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telefun_realtime_transcript_events_pkey PRIMARY KEY (id),
  CONSTRAINT telefun_realtime_transcript_events_attempt_fkey
    FOREIGN KEY (attempt_id) REFERENCES public.telefun_realtime_attempts(id) ON DELETE CASCADE,
  UNIQUE(attempt_id, dedupe_key),
  UNIQUE(attempt_id, sequence),
  CONSTRAINT telefun_realtime_transcript_events_sequence_check
    CHECK (sequence > 0),
  CONSTRAINT telefun_realtime_transcript_events_dedupe_key_check
    CHECK (char_length(dedupe_key) BETWEEN 1 AND 256),
  CONSTRAINT telefun_realtime_transcript_events_speaker_check
    CHECK (speaker IN ('agent', 'consumer')),
  CONSTRAINT telefun_realtime_transcript_events_text_check
    CHECK (char_length(btrim(text)) BETWEEN 1 AND 16000),
  CONSTRAINT telefun_realtime_transcript_events_start_check
    CHECK (start_ms >= 0)
);

CREATE INDEX IF NOT EXISTS idx_telefun_realtime_transcript_events_sequence
  ON public.telefun_realtime_transcript_events(attempt_id, sequence);

ALTER TABLE public.telefun_realtime_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telefun_realtime_transcript_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telefun_realtime_attempts FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.telefun_realtime_transcript_events FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telefun_realtime_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telefun_realtime_transcript_events TO service_role;

-- The attempt FK is intentionally cascading for terminal history cleanup, but
-- a trigger prevents that cascade from deleting a live WebRTC attempt. The
-- check runs in the same DELETE transaction as the history row lock.
CREATE OR REPLACE FUNCTION public.prevent_active_telefun_history_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.telefun_transport = 'openai-webrtc'
     AND (
       OLD.status IN ('pending', 'active')
       OR EXISTS (
         SELECT 1
         FROM public.telefun_realtime_attempts a
         WHERE a.session_id = OLD.id
           AND a.state <> 'ended'
       )
     ) THEN
    RAISE EXCEPTION 'Active WebRTC sessions must be terminalized before deletion'
      USING ERRCODE = '55006';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS telefun_history_block_active_webrtc_delete
  ON public.telefun_history;
CREATE TRIGGER telefun_history_block_active_webrtc_delete
  BEFORE DELETE ON public.telefun_history
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_active_telefun_history_delete();

CREATE OR REPLACE FUNCTION public.prevent_active_telefun_attempt_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.state <> 'ended' THEN
    RAISE EXCEPTION 'Active WebRTC attempts must be terminalized before deletion'
      USING ERRCODE = '55006';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS telefun_attempt_block_active_delete
  ON public.telefun_realtime_attempts;
CREATE TRIGGER telefun_attempt_block_active_delete
  BEFORE DELETE ON public.telefun_realtime_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_active_telefun_attempt_delete();

-- An owner-bound DELETE can race the broker before an attempt is claimed. This
-- function terminalizes only the still-active, attempt-less pre-created row;
-- the history lock serializes it with claim_telefun_realtime_attempt.
CREATE OR REPLACE FUNCTION public.fail_telefun_realtime_session_without_attempt(
  p_session_id UUID,
  p_user_id UUID
) RETURNS TABLE(
  applied BOOLEAN,
  terminal BOOLEAN,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_history public.telefun_history%ROWTYPE;
  v_attempt_state TEXT;
BEGIN
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
$$;

-- Claim one pre-created, owned WebRTC session. The history row lock and the
-- unique session constraint make the one-attempt boundary atomic.
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
     OR p_model_id <> 'gpt-realtime-2.1'
     OR p_transport <> 'openai-webrtc'
     OR v_history_model_id <> 'gpt-realtime-2.1'
     OR v_history_transport <> 'openai-webrtc' THEN
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

-- Bind only a validated, hashed provider call reference. The raw provider ID
-- never crosses this database boundary.
CREATE OR REPLACE FUNCTION public.bind_telefun_realtime_provider_call(
  p_attempt_id UUID,
  p_user_id UUID,
  p_provider_call_id_hash TEXT
) RETURNS TABLE(accepted BOOLEAN, state TEXT, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.mark_telefun_realtime_sideband_connected(
  p_attempt_id UUID,
  p_user_id UUID
) RETURNS TABLE(accepted BOOLEAN, state TEXT, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_state TEXT;
  v_hash TEXT;
BEGIN
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
$$;

-- Persist canonical transcript checkpoints only. Provider frames and raw
-- payloads are intentionally not stored.
CREATE OR REPLACE FUNCTION public.checkpoint_telefun_realtime_transcript(
  p_attempt_id UUID,
  p_user_id UUID,
  p_sequence BIGINT,
  p_dedupe_key TEXT,
  p_speaker TEXT,
  p_text TEXT,
  p_start_ms INTEGER,
  p_is_partial BOOLEAN DEFAULT FALSE
) RETURNS TABLE(
  accepted BOOLEAN,
  operation TEXT,
  checkpoint_sequence BIGINT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_event public.telefun_realtime_transcript_events%ROWTYPE;
  v_text TEXT := btrim(p_text);
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.begin_telefun_realtime_finalization(
  p_attempt_id UUID,
  p_user_id UUID,
  p_finalization_key UUID,
  p_requested_outcome TEXT
) RETURNS TABLE(
  accepted BOOLEAN,
  should_finalize BOOLEAN,
  state TEXT,
  requested_outcome TEXT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_outcome TEXT := p_requested_outcome;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.finalize_telefun_realtime_attempt(
  p_attempt_id UUID,
  p_user_id UUID,
  p_finalization_key UUID,
  p_final_outcome TEXT,
  p_duration_seconds INTEGER
) RETURNS TABLE(
  applied BOOLEAN,
  idempotent BOOLEAN,
  attempt_state TEXT,
  session_status TEXT,
  transcript_count BIGINT,
  usage_status TEXT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_history public.telefun_history%ROWTYPE;
  v_messages JSONB;
  v_transcript_count BIGINT;
  v_outcome TEXT := p_final_outcome;
BEGIN
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
$$;

-- Usage is deduped by the existing ai_usage_logs.request_id unique key. The
-- RPC records only the audit state; token/cost values are never inferred.
CREATE OR REPLACE FUNCTION public.mark_telefun_realtime_usage(
  p_attempt_id UUID,
  p_user_id UUID,
  p_usage_status TEXT,
  p_error TEXT DEFAULT NULL
) RETURNS TABLE(
  applied BOOLEAN,
  idempotent BOOLEAN,
  usage_request_id TEXT,
  usage_status TEXT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_usage_user UUID;
  v_usage_provider TEXT;
  v_usage_model TEXT;
  v_usage_module TEXT;
  v_usage_status TEXT;
  v_safe_error TEXT := left(regexp_replace(coalesce(p_error, ''), '\s+', ' ', 'g'), 512);
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.mark_telefun_recording_uploaded(
  p_session_id UUID,
  p_user_id UUID,
  p_recording_path TEXT DEFAULT NULL,
  p_agent_recording_path TEXT DEFAULT NULL,
  p_capture_status TEXT DEFAULT 'ready'
) RETURNS TABLE(
  applied BOOLEAN,
  recording_status TEXT,
  recording_ready BOOLEAN,
  scoring_ready BOOLEAN,
  scoring_status TEXT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.telefun_history%ROWTYPE;
  v_recording_status TEXT;
  v_recording_path TEXT;
  v_agent_recording_path TEXT;
  v_scoring_status TEXT;
BEGIN
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
        ELSE COALESCE(scoring_status, 'pending')
      END,
      scoring_claimed_at = CASE
        WHEN p_capture_status = 'failed'
             AND v_session.telefun_transport = 'openai-webrtc'
             AND v_session.scoring_status = 'processing'
          THEN NULL
        ELSE scoring_claimed_at
      END,
      scoring_last_error = CASE
        WHEN p_capture_status = 'failed'
             AND v_session.telefun_transport = 'openai-webrtc'
          THEN 'Recording capture failed'
        ELSE scoring_last_error
      END,
      scoring_ready_at = CASE WHEN p_capture_status = 'failed' THEN NULL ELSE scoring_ready_at END,
      scoring_next_attempt_at = CASE WHEN p_capture_status = 'failed' THEN NULL ELSE scoring_next_attempt_at END
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
$$;

CREATE OR REPLACE FUNCTION public.mark_telefun_recording_ready(
  p_session_id UUID,
  p_user_id UUID,
  p_recording_path TEXT DEFAULT NULL,
  p_agent_recording_path TEXT DEFAULT NULL
) RETURNS TABLE(
  applied BOOLEAN,
  recording_status TEXT,
  recording_ready BOOLEAN,
  scoring_ready BOOLEAN,
  scoring_ready_at TIMESTAMPTZ,
  scoring_status TEXT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.telefun_history%ROWTYPE;
  v_recording_path TEXT;
  v_agent_recording_path TEXT;
  v_recording_status TEXT;
  v_scoring_status TEXT;
  v_scoring_ready_at TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
BEGIN
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
$$;

-- Completion is row-locked so a failed WebRTC capture and a stale worker
-- cannot both transition the same processing row.
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

-- WebRTC scoring uses the new seekable-agent gate. Legacy rows retain the old
-- raw-agent-path behavior through the transport branch.
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

CREATE OR REPLACE FUNCTION public.enqueue_telefun_scoring(
  p_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_transport TEXT;
  v_status TEXT;
  v_scoring_ready_at TIMESTAMPTZ;
  v_agent_path TEXT;
  v_user_id UUID;
BEGIN
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
$$;

-- Explicit service-role-only function grants. Existing scoring RPCs retain
-- their signatures; this migration only replaces their transport gate.
REVOKE ALL ON FUNCTION public.prevent_active_telefun_history_delete() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_active_telefun_attempt_delete() FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_telefun_realtime_session_without_attempt(UUID, UUID) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_telefun_realtime_attempt(UUID, UUID, UUID, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.bind_telefun_realtime_provider_call(UUID, UUID, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_telefun_realtime_sideband_connected(UUID, UUID) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.checkpoint_telefun_realtime_transcript(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_telefun_realtime_finalization(UUID, UUID, UUID, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_telefun_realtime_attempt(UUID, UUID, UUID, TEXT, INTEGER) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_telefun_realtime_usage(UUID, UUID, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_telefun_recording_uploaded(UUID, UUID, TEXT, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_telefun_recording_ready(UUID, UUID, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_telefun_scoring(UUID, INT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_telefun_scoring(UUID) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.fail_telefun_realtime_session_without_attempt(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_telefun_realtime_attempt(UUID, UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.bind_telefun_realtime_provider_call(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_telefun_realtime_sideband_connected(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.checkpoint_telefun_realtime_transcript(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_telefun_realtime_finalization(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_telefun_realtime_attempt(UUID, UUID, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_telefun_realtime_usage(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_telefun_recording_uploaded(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_telefun_recording_ready(UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_telefun_scoring(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
