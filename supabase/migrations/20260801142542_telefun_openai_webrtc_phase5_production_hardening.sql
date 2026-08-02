BEGIN;

-- Phase 5 is additive. Existing Gemini and legacy OpenAI WebSocket tables and
-- behavior remain unchanged; these objects are used only by the WebRTC broker.
ALTER TABLE public.telefun_realtime_attempts
  ADD COLUMN IF NOT EXISTS lease_id UUID,
  ADD COLUMN IF NOT EXISTS lease_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS provider_call_reference TEXT,
  ADD COLUMN IF NOT EXISTS recovery_boundary_id UUID,
  ADD COLUMN IF NOT EXISTS sideband_disconnect_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duplicate_write_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_usage_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS orphaned_at TIMESTAMPTZ;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.telefun_realtime_attempts'::regclass
      AND conname = 'telefun_realtime_attempts_requested_outcome_check'
  ) THEN
    ALTER TABLE public.telefun_realtime_attempts
      DROP CONSTRAINT telefun_realtime_attempts_requested_outcome_check;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.telefun_realtime_attempts'::regclass
      AND conname = 'telefun_realtime_attempts_outcome_check'
  ) THEN
    ALTER TABLE public.telefun_realtime_attempts
      DROP CONSTRAINT telefun_realtime_attempts_outcome_check;
  END IF;
  ALTER TABLE public.telefun_realtime_attempts
    ADD CONSTRAINT telefun_realtime_attempts_requested_outcome_check
      CHECK (requested_outcome IS NULL OR requested_outcome IN ('completed', 'failed', 'network_lost', 'orphaned')),
    ADD CONSTRAINT telefun_realtime_attempts_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('completed', 'failed', 'network_lost', 'orphaned'));
END
$$;

CREATE TABLE IF NOT EXISTS public.telefun_realtime_leases (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  attempt_id UUID NOT NULL,
  session_id UUID NOT NULL,
  user_id UUID NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openai-webrtc',
  lease_token_hash TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  terminal_outcome TEXT,
  provider_call_reference TEXT,
  sideband_connected BOOLEAN NOT NULL DEFAULT FALSE,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telefun_realtime_leases_pkey PRIMARY KEY (id),
  CONSTRAINT telefun_realtime_leases_attempt_key UNIQUE (attempt_id),
  CONSTRAINT telefun_realtime_leases_attempt_fkey
    FOREIGN KEY (attempt_id) REFERENCES public.telefun_realtime_attempts(id) ON DELETE CASCADE,
  CONSTRAINT telefun_realtime_leases_session_fkey
    FOREIGN KEY (session_id) REFERENCES public.telefun_history(id) ON DELETE CASCADE,
  CONSTRAINT telefun_realtime_leases_user_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT telefun_realtime_leases_provider_check CHECK (provider = 'openai-webrtc'),
  CONSTRAINT telefun_realtime_leases_state_check
    CHECK (state IN ('active', 'released', 'orphaned', 'cleanup_claimed')),
  CONSTRAINT telefun_realtime_leases_outcome_check
    CHECK (terminal_outcome IS NULL OR terminal_outcome IN ('completed', 'failed', 'network_lost', 'orphaned')),
  CONSTRAINT telefun_realtime_leases_token_check
    CHECK (lease_token_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT telefun_realtime_leases_error_check
    CHECK (last_error IS NULL OR char_length(last_error) <= 128)
);

CREATE INDEX IF NOT EXISTS idx_telefun_realtime_leases_active_expiry
  ON public.telefun_realtime_leases(provider, state, expires_at);
CREATE INDEX IF NOT EXISTS idx_telefun_realtime_leases_user_active
  ON public.telefun_realtime_leases(user_id, provider, state, expires_at);

CREATE TABLE IF NOT EXISTS public.telefun_realtime_rate_limits (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  scope_key TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  window_seconds INTEGER NOT NULL,
  request_count INTEGER NOT NULL DEFAULT 0,
  request_limit INTEGER NOT NULL,
  user_id UUID,
  session_id UUID,
  provider TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telefun_realtime_rate_limits_pkey PRIMARY KEY (id),
  CONSTRAINT telefun_realtime_rate_limits_scope_key UNIQUE (scope_key, window_start),
  CONSTRAINT telefun_realtime_rate_limits_window_check CHECK (window_seconds BETWEEN 1 AND 3600),
  CONSTRAINT telefun_realtime_rate_limits_count_check CHECK (request_count >= 0),
  CONSTRAINT telefun_realtime_rate_limits_limit_check CHECK (request_limit BETWEEN 1 AND 10000),
  CONSTRAINT telefun_realtime_rate_limits_provider_check
    CHECK (provider IN ('openai-webrtc', 'gemini-live', 'openai-websocket'))
);

CREATE INDEX IF NOT EXISTS idx_telefun_realtime_rate_limits_expiry
  ON public.telefun_realtime_rate_limits(window_start);

CREATE TABLE IF NOT EXISTS public.telefun_realtime_metrics (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'openai-webrtc',
  user_id_hash TEXT,
  session_id UUID,
  attempt_id UUID,
  value BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT telefun_realtime_metrics_pkey PRIMARY KEY (id),
  CONSTRAINT telefun_realtime_metrics_name_check CHECK (
    metric_name IN ('cost_reconciliation', 'sideband_disconnect', 'duplicate_write', 'missing_usage', 'orphan', 'session_cap')
  ),
  CONSTRAINT telefun_realtime_metrics_provider_check CHECK (provider = 'openai-webrtc'),
  CONSTRAINT telefun_realtime_metrics_user_hash_check
    CHECK (user_id_hash IS NULL OR user_id_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT telefun_realtime_metrics_value_check CHECK (value IS NULL OR value >= 0),
  CONSTRAINT telefun_realtime_metrics_metadata_check CHECK (octet_length(metadata::text) <= 4096)
);

CREATE INDEX IF NOT EXISTS idx_telefun_realtime_metrics_name_created
  ON public.telefun_realtime_metrics(metric_name, created_at);

ALTER TABLE public.telefun_realtime_leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telefun_realtime_rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telefun_realtime_metrics ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.telefun_realtime_leases FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.telefun_realtime_rate_limits FROM public, anon, authenticated;
REVOKE ALL ON TABLE public.telefun_realtime_metrics FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telefun_realtime_leases TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telefun_realtime_rate_limits TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.telefun_realtime_metrics TO service_role;

-- Provider call references are encrypted by the Telefun process. They are
-- never returned to a browser and are available only to the cleanup worker.
CREATE OR REPLACE FUNCTION public.store_telefun_realtime_provider_call_reference(
  p_attempt_id UUID,
  p_user_id UUID,
  p_provider_call_reference TEXT
) RETURNS TABLE(accepted BOOLEAN, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.claim_telefun_realtime_lease(
  p_user_id UUID,
  p_session_id UUID,
  p_attempt_id UUID,
  p_provider TEXT,
  p_lease_token_hash TEXT,
  p_ttl_ms INTEGER,
  p_max_user_sessions INTEGER,
  p_max_provider_sessions INTEGER
) RETURNS TABLE(
  granted BOOLEAN,
  lease_id UUID,
  expires_at TIMESTAMPTZ,
  active_count INTEGER,
  reason TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_expires TIMESTAMPTZ;
  v_user_count INTEGER;
  v_provider_count INTEGER;
  v_existing public.telefun_realtime_leases%ROWTYPE;
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_id UUID;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.renew_telefun_realtime_lease(
  p_lease_id UUID,
  p_user_id UUID,
  p_session_id UUID,
  p_attempt_id UUID,
  p_lease_token_hash TEXT,
  p_ttl_ms INTEGER
) RETURNS TABLE(renewed BOOLEAN, expires_at TIMESTAMPTZ, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_now TIMESTAMPTZ := clock_timestamp(); v_next TIMESTAMPTZ;
BEGIN
  IF p_ttl_ms NOT BETWEEN 1000 AND 120000 THEN
    RETURN QUERY SELECT false, v_now, 'invalid_ttl'::text; RETURN;
  END IF;
  v_next := v_now + make_interval(secs => p_ttl_ms::double precision / 1000.0);
  UPDATE public.telefun_realtime_leases
  SET expires_at = v_next, heartbeat_at = v_now, updated_at = v_now
  WHERE id = p_lease_id AND user_id = p_user_id AND session_id = p_session_id
    AND attempt_id = p_attempt_id AND lease_token_hash = p_lease_token_hash
    AND state = 'active' AND expires_at > v_now;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, v_now, 'expired'::text;
    RETURN;
  END IF;
  RETURN QUERY SELECT true, v_next, 'renewed'::text;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_telefun_realtime_lease(
  p_lease_id UUID,
  p_user_id UUID,
  p_session_id UUID,
  p_attempt_id UUID,
  p_lease_token_hash TEXT,
  p_outcome TEXT
) RETURNS TABLE(released BOOLEAN, idempotent BOOLEAN, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.consume_telefun_realtime_rate_limit(
  p_scope_key TEXT,
  p_user_id UUID,
  p_session_id UUID,
  p_provider TEXT,
  p_window_seconds INTEGER,
  p_request_limit INTEGER
) RETURNS TABLE(allowed BOOLEAN, remaining INTEGER, reset_at TIMESTAMPTZ, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_start TIMESTAMPTZ;
  v_count INTEGER;
  v_id UUID;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.claim_telefun_realtime_orphans(
  p_limit INTEGER DEFAULT 25
) RETURNS TABLE(
  lease_id UUID,
  attempt_id UUID,
  session_id UUID,
  user_id UUID,
  provider TEXT,
  provider_call_reference TEXT,
  sideband_connected BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.complete_telefun_realtime_orphan(
  p_lease_id UUID,
  p_attempt_id UUID,
  p_outcome TEXT,
  p_provider_closed BOOLEAN,
  p_sideband_closed BOOLEAN,
  p_error_code TEXT DEFAULT NULL
) RETURNS TABLE(applied BOOLEAN, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_user_id UUID; v_session_id UUID;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.record_telefun_realtime_metric(
  p_metric_name TEXT,
  p_provider TEXT DEFAULT 'openai-webrtc',
  p_user_id_hash TEXT DEFAULT NULL,
  p_session_id UUID DEFAULT NULL,
  p_attempt_id UUID DEFAULT NULL,
  p_value BIGINT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
) RETURNS TABLE(recorded BOOLEAN, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
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
$$;

-- Preserve the Phase 4 finalization contract while adding precise terminal
-- attempt outcomes. History remains binary for existing scoring/recording code.
CREATE OR REPLACE FUNCTION public.begin_telefun_realtime_finalization_p5(
  p_attempt_id UUID,
  p_user_id UUID,
  p_finalization_key UUID,
  p_requested_outcome TEXT
) RETURNS TABLE(accepted BOOLEAN, should_finalize BOOLEAN, state TEXT, requested_outcome TEXT, reason TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_attempt public.telefun_realtime_attempts%ROWTYPE; v_outcome TEXT := p_requested_outcome;
BEGIN
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
$$;

CREATE OR REPLACE FUNCTION public.finalize_telefun_realtime_attempt_p5(
  p_attempt_id UUID,
  p_user_id UUID,
  p_finalization_key UUID,
  p_final_outcome TEXT,
  p_duration_seconds INTEGER
) RETURNS TABLE(
  applied BOOLEAN, idempotent BOOLEAN, attempt_state TEXT, session_status TEXT,
  transcript_count BIGINT, usage_status TEXT, reason TEXT
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_attempt public.telefun_realtime_attempts%ROWTYPE;
  v_history public.telefun_history%ROWTYPE;
  v_messages JSONB;
  v_count BIGINT;
  v_outcome TEXT := p_final_outcome;
  v_history_status TEXT;
BEGIN
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
$$;

REVOKE ALL ON FUNCTION public.store_telefun_realtime_provider_call_reference(UUID, UUID, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_telefun_realtime_lease(UUID, UUID, UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, INTEGER) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_telefun_realtime_rate_limit(TEXT, UUID, UUID, TEXT, INTEGER, INTEGER) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_telefun_realtime_orphans(INTEGER) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_telefun_realtime_orphan(UUID, UUID, TEXT, BOOLEAN, BOOLEAN, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_telefun_realtime_metric(TEXT, TEXT, TEXT, UUID, UUID, BIGINT, JSONB) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_telefun_realtime_finalization_p5(UUID, UUID, UUID, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_telefun_realtime_attempt_p5(UUID, UUID, UUID, TEXT, INTEGER) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.store_telefun_realtime_provider_call_reference(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_telefun_realtime_lease(UUID, UUID, UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.renew_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_telefun_realtime_rate_limit(TEXT, UUID, UUID, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_telefun_realtime_orphans(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_telefun_realtime_orphan(UUID, UUID, TEXT, BOOLEAN, BOOLEAN, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_telefun_realtime_metric(TEXT, TEXT, TEXT, UUID, UUID, BIGINT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_telefun_realtime_finalization_p5(UUID, UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finalize_telefun_realtime_attempt_p5(UUID, UUID, UUID, TEXT, INTEGER) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
