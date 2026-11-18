-- Keep generated consumer replies outside the transcript until reveal.
BEGIN;

ALTER TABLE public.ketik_session_responses
  DROP CONSTRAINT IF EXISTS ketik_session_responses_status_check,
  ADD CONSTRAINT ketik_session_responses_status_check
    CHECK (status IN ('processing', 'failed', 'held', 'retry_ready', 'completed', 'superseded')),
  ADD COLUMN IF NOT EXISTS held_messages jsonb,
  ADD COLUMN IF NOT EXISTS typing_chars integer,
  ADD COLUMN IF NOT EXISTS closing boolean,
  ADD COLUMN IF NOT EXISTS closes_consumer boolean;

DROP INDEX IF EXISTS public.ketik_session_one_processing_response;
CREATE UNIQUE INDEX ketik_session_one_processing_response
  ON public.ketik_session_responses(session_id)
  WHERE status IN ('processing', 'held', 'retry_ready');

-- Existing owner RLS applies to pacing metadata. Payloads remain service-role only.
GRANT SELECT (context_agent_version, typing_chars, closing)
  ON public.ketik_session_responses TO authenticated;

CREATE OR REPLACE FUNCTION public.transition_ketik_session_status(
  p_user_id uuid,
  p_session_id uuid,
  p_event text,
  p_request_id uuid DEFAULT NULL,
  p_lease uuid DEFAULT NULL,
  p_lease_seconds integer DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  s public.ketik_sessions%ROWTYPE;
  t public.ketik_session_turns%ROWTYPE;
  r public.ketik_session_responses%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.ketik_sessions
  WHERE id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Session not found';
  END IF;
  IF p_event IN ('turn_reclaim', 'response_claim') AND (
    p_lease IS NULL OR (p_lease_seconds BETWEEN 30 AND 600) IS NOT TRUE
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Invalid transition lease';
  END IF;

  CASE p_event
    -- active -> ended | discarded. History and transcript changes are atomic
    -- with the caller's INSERT; terminal sessions never transition again.
    WHEN 'session_end', 'session_discard' THEN
      UPDATE public.ketik_sessions
      SET state = CASE p_event WHEN 'session_end' THEN 'ended' ELSE 'discarded' END,
          history_id = CASE p_event WHEN 'session_end' THEN s.id ELSE history_id END,
          messages = NULL
      WHERE id = s.id AND state = 'active'
        AND (p_event = 'session_discard' OR EXISTS (
          SELECT 1 FROM public.ketik_history h
          WHERE h.id = s.id AND h.user_id = p_user_id
        ));

      IF NOT FOUND THEN
        RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Session transition conflict';
      END IF;
      PERFORM public.transition_ketik_session_status(
        p_user_id, s.id, 'response_cancel_hold'
      );
      RETURN true;

    -- Consumer closing is monotonic and owned by this transition.
    WHEN 'consumer_close' THEN
      UPDATE public.ketik_sessions
      SET consumer_closed = true
      WHERE id = s.id AND state = 'active' AND NOT consumer_closed;
      RETURN FOUND;

    -- failed -> processing, or expired processing -> processing with a new
    -- fencing token. The caller has already checked the immutable payload.
    WHEN 'turn_reclaim' THEN
      SELECT * INTO t FROM public.ketik_session_turns
      WHERE session_id = s.id AND request_id = p_request_id FOR UPDATE;
      UPDATE public.ketik_session_turns
      SET status = 'processing', lease = p_lease,
          lease_expires_at = pg_catalog.clock_timestamp()
            + pg_catalog.make_interval(secs => p_lease_seconds)
      WHERE session_id = s.id AND request_id = p_request_id
        AND status = t.status
        AND (t.status = 'failed' OR (
          t.status = 'processing' AND lease_expires_at <= pg_catalog.clock_timestamp()
        ))
        AND s.state = 'active' AND NOT s.consumer_closed
        AND s.expires_at > pg_catalog.clock_timestamp();

    -- processing -> completed, only for the current, unexpired turn lease.
    WHEN 'turn_publish' THEN
      UPDATE public.ketik_session_turns
      SET status = 'completed', lease = NULL, lease_expires_at = NULL
      WHERE session_id = s.id AND request_id = p_request_id
        AND status = 'processing' AND lease = p_lease
        AND lease_expires_at > pg_catalog.clock_timestamp()
        AND s.state = 'active' AND s.version = expected_version + 1
        AND s.expires_at > pg_catalog.clock_timestamp();

    -- A stale provider failure or terminal-session cancellation is a no-op.
    WHEN 'turn_fail', 'turn_cancel' THEN
      UPDATE public.ketik_session_turns
      SET status = 'failed', lease = NULL, lease_expires_at = NULL
      WHERE session_id = s.id AND status = 'processing'
        AND (
          (p_event = 'turn_fail' AND request_id = p_request_id AND lease = p_lease)
          OR (p_event = 'turn_cancel' AND s.state IN ('ended', 'discarded'))
        );
      RETURN FOUND;

    -- Claim leases new provider work from a retry-ready or failed response.
    WHEN 'response_claim' THEN
      SELECT * INTO r FROM public.ketik_session_responses
      WHERE session_id = s.id AND request_id = p_request_id FOR UPDATE;
      UPDATE public.ketik_session_responses
      SET status = 'processing', context_agent_version = s.agent_version,
          lease = p_lease,
          lease_expires_at = pg_catalog.clock_timestamp()
            + pg_catalog.make_interval(secs => p_lease_seconds),
          updated_at = pg_catalog.clock_timestamp()
      WHERE session_id = s.id AND request_id = p_request_id
        AND status = r.status AND r.status IN ('failed', 'retry_ready')
        AND s.state = 'active' AND NOT s.consumer_closed;

    -- No provider work is owed: failed/expired processing -> completed.
    WHEN 'response_noop' THEN
      SELECT * INTO r FROM public.ketik_session_responses
      WHERE session_id = s.id AND request_id = p_request_id FOR UPDATE;
      UPDATE public.ketik_session_responses
      SET status = 'completed', lease = NULL, lease_expires_at = NULL,
          updated_at = pg_catalog.clock_timestamp()
      WHERE session_id = s.id AND request_id = p_request_id AND status = r.status
        AND (r.status = 'failed' OR (
          r.status = 'processing' AND lease_expires_at <= pg_catalog.clock_timestamp()
        ))
        AND s.state = 'active' AND NOT s.consumer_closed;

    -- Provider output is fenced by the lease, then held without a lease.
    WHEN 'response_hold' THEN
      UPDATE public.ketik_session_responses
      SET status = 'held', lease = NULL, lease_expires_at = NULL,
          updated_at = pg_catalog.clock_timestamp()
      WHERE session_id = s.id AND request_id = p_request_id
        AND status = 'processing' AND lease = p_lease
        AND lease_expires_at > pg_catalog.clock_timestamp()
        AND s.state = 'active' AND NOT s.consumer_closed;

    -- A first context change consumes the turn's one regeneration allowance.
    WHEN 'response_requeue', 'response_publish', 'response_retire' THEN
      UPDATE public.ketik_session_responses
      SET status = CASE p_event
            WHEN 'response_requeue' THEN 'retry_ready'
            WHEN 'response_publish' THEN 'completed'
            ELSE 'superseded' END,
          retry_count = CASE WHEN p_event = 'response_requeue' THEN 1 ELSE retry_count END,
          held_messages = NULL, typing_chars = NULL, closing = NULL,
          closes_consumer = NULL,
          updated_at = pg_catalog.clock_timestamp()
      WHERE session_id = s.id AND request_id = p_request_id
        AND status = 'held' AND s.state = 'active' AND NOT s.consumer_closed
        AND (
          (p_event = 'response_requeue'
            AND context_agent_version <> s.agent_version AND retry_count = 0)
          OR (p_event = 'response_publish'
            AND (context_agent_version = s.agent_version OR retry_count = 1))
          OR (p_event = 'response_retire'
            AND NOT closing AND s.expires_at <= pg_catalog.clock_timestamp())
        );

    -- processing -> failed. Only expiry/cancellation may affect several rows;
    -- a provider failure must still own its request's current fencing token.
    WHEN 'response_fail', 'response_expire', 'response_cancel' THEN
      UPDATE public.ketik_session_responses
      SET status = 'failed', lease = NULL, lease_expires_at = NULL,
          closing = NULL, updated_at = pg_catalog.clock_timestamp()
      WHERE session_id = s.id AND status = 'processing'
        AND (
          (p_event = 'response_fail' AND request_id = p_request_id AND lease = p_lease)
          OR (p_event = 'response_expire'
            AND lease_expires_at <= pg_catalog.clock_timestamp())
          OR (p_event = 'response_cancel' AND s.state IN ('ended', 'discarded'))
        );
      RETURN FOUND;
    -- Rollback uses the same guarded transition with chat writes stopped.
    WHEN 'response_cancel_hold', 'response_rollback_hold' THEN
      SELECT * INTO r FROM public.ketik_session_responses
      WHERE session_id = s.id AND status IN ('held', 'retry_ready') FOR UPDATE;
      UPDATE public.ketik_session_responses
      SET status = 'superseded', held_messages = NULL, typing_chars = NULL,
          closing = NULL, closes_consumer = NULL, updated_at = pg_catalog.clock_timestamp()
      WHERE session_id = s.id AND request_id = r.request_id AND status = r.status
        AND (p_event = 'response_rollback_hold' OR s.state IN ('ended', 'discarded'));
      RETURN FOUND;
    ELSE
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Unknown session transition';
  END CASE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Session transition conflict';
  END IF;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ketik_session_response(
  p_user_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_lease_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.ketik_sessions%ROWTYPE;
  r public.ketik_session_responses%ROWTYPE;
  v_lease uuid := gen_random_uuid();
  v_last_sender text;
  v_closing boolean;
BEGIN
  SELECT * INTO s
  FROM public.ketik_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Session not found';
  END IF;

  SELECT * INTO r
  FROM public.ketik_session_responses
  WHERE session_id = s.id AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF r.status IN ('completed', 'superseded', 'held') THEN
      RETURN jsonb_build_object('session', to_jsonb(s), 'replay', true, 'noop', false);
    END IF;
    IF r.status = 'processing' AND r.lease_expires_at > clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Response busy';
    END IF;
  END IF;

  IF s.state <> 'active' OR s.consumer_closed THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Session ended';
  END IF;
  -- After expiry the claim is the consumer's one closing reply, owed even
  -- when the consumer spoke last.
  v_closing := s.expires_at <= clock_timestamp();
  IF p_lease_seconds NOT BETWEEN 30 AND 600 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Invalid response lease';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ketik_session_turns
    WHERE session_id = s.id AND status <> 'completed'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Legacy turn busy';
  END IF;

  SELECT item->>'sender' INTO v_last_sender
  FROM jsonb_array_elements(s.messages) WITH ORDINALITY AS entries(item, position)
  WHERE item->>'sender' <> 'system'
  ORDER BY position DESC
  LIMIT 1;
  IF NOT v_closing AND v_last_sender IS DISTINCT FROM 'agent' THEN
    IF r.request_id IS NULL THEN
      INSERT INTO public.ketik_session_responses(
        session_id, request_id, context_agent_version, retry_count, status
      ) VALUES (s.id, p_request_id, s.agent_version, 0, 'completed');
    ELSE
      PERFORM public.transition_ketik_session_status(
        p_user_id, s.id, 'response_noop', p_request_id
      );
    END IF;
    RETURN jsonb_build_object('session', to_jsonb(s), 'replay', false, 'noop', true);
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.ketik_session_responses
    WHERE session_id = s.id AND request_id <> p_request_id
      AND status IN ('held', 'retry_ready')
  ) THEN
    RETURN jsonb_build_object('session', to_jsonb(s), 'replay', true, 'noop', false);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ketik_session_responses
    WHERE session_id = s.id AND request_id <> p_request_id
      AND status = 'processing' AND lease_expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Response busy';
  END IF;
  PERFORM public.transition_ketik_session_status(p_user_id, s.id, 'response_expire');

  IF r.request_id IS NULL THEN
    INSERT INTO public.ketik_session_responses(
      session_id, request_id, context_agent_version, retry_count, status,
      lease, lease_expires_at, closing
    ) VALUES (
      s.id, p_request_id, s.agent_version, 0, 'processing',
      v_lease, clock_timestamp() + make_interval(secs => p_lease_seconds), v_closing
    );
  ELSE
    PERFORM public.transition_ketik_session_status(
      p_user_id, s.id, 'response_claim', p_request_id, v_lease, p_lease_seconds
    );
    UPDATE public.ketik_session_responses SET closing = v_closing
    WHERE session_id = s.id AND request_id = p_request_id AND status = 'processing';
  END IF;

  RETURN jsonb_build_object(
    'session', to_jsonb(s),
    'lease', v_lease,
    'replay', false,
    'noop', false,
    'closing', v_closing
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_ketik_session_turn(
  p_user_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_expected_version integer,
  p_text text,
  p_lease_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.ketik_sessions%ROWTYPE;
  t public.ketik_session_turns%ROWTYPE;
  v_lease uuid := gen_random_uuid();
BEGIN
  SELECT * INTO s
  FROM public.ketik_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Session not found';
  END IF;
  SELECT * INTO t
  FROM public.ketik_session_turns
  WHERE session_id = s.id AND request_id = p_request_id
  FOR UPDATE;
  IF FOUND THEN
    IF t.agent_text <> p_text OR t.expected_version <> p_expected_version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Request payload changed';
    END IF;
    IF t.status = 'completed' THEN
      RETURN jsonb_build_object('session', to_jsonb(s), 'replay', true);
    END IF;
    IF t.status = 'processing' AND t.lease_expires_at > clock_timestamp() THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Turn busy';
    END IF;
  END IF;
  IF s.state <> 'active' OR s.consumer_closed THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Session ended';
  END IF;
  IF s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = 'PT410', MESSAGE = 'Session expired';
  END IF;
  IF p_lease_seconds NOT BETWEEN 30 AND 600
    OR length(p_text) NOT BETWEEN 1 AND 20000 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Invalid turn';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ketik_session_responses
    WHERE session_id = s.id
      AND (status = 'processing' AND lease_expires_at > clock_timestamp()
        OR status IN ('held', 'retry_ready'))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Response busy';
  END IF;
  IF t.request_id IS NULL THEN
    IF s.version <> p_expected_version
      OR s.version >= 200
      OR EXISTS(
        SELECT 1 FROM public.ketik_session_turns
        WHERE session_id = s.id AND status <> 'completed'
      ) THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Turn version conflict';
    END IF;
    INSERT INTO public.ketik_session_turns(
      session_id, request_id, expected_version, agent_text, status,
      lease, lease_expires_at
    ) VALUES (
      s.id, p_request_id, p_expected_version, p_text, 'processing',
      v_lease, clock_timestamp() + make_interval(secs => p_lease_seconds)
    );
    UPDATE public.ketik_sessions
    SET messages = messages || jsonb_build_array(
          jsonb_build_object(
            'id', p_request_id,
            'sender', 'agent',
            'text', p_text,
            'timestamp', clock_timestamp(),
            'status', 'sent'
          )
        ),
        version = version + 1,
        agent_version = agent_version + 1
    WHERE id = s.id
    RETURNING * INTO s;
  ELSE
    IF s.version <> p_expected_version + 1 THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Retry version conflict';
    END IF;
    PERFORM public.transition_ketik_session_status(
      p_user_id, s.id, 'turn_reclaim', p_request_id, v_lease, p_lease_seconds
    );
  END IF;
  RETURN jsonb_build_object(
    'session', to_jsonb(s),
    'lease', v_lease,
    'replay', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_ketik_session_response(
  p_user_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_lease uuid,
  p_messages jsonb,
  p_closed boolean,
  p_lease_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.ketik_sessions%ROWTYPE;
  r public.ketik_session_responses%ROWTYPE;
BEGIN
  SELECT * INTO s
  FROM public.ketik_sessions
  WHERE id = p_session_id AND user_id = p_user_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Session not found';
  END IF;
  SELECT * INTO r
  FROM public.ketik_session_responses
  WHERE session_id = s.id AND request_id = p_request_id
  FOR UPDATE;
  IF r.status IS DISTINCT FROM 'processing'
    OR r.lease IS DISTINCT FROM p_lease
    OR r.lease_expires_at <= clock_timestamp()
    OR s.state <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Response lease lost';
  END IF;
  IF (p_lease_seconds BETWEEN 30 AND 600) IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Invalid response lease';
  END IF;
  PERFORM public.transition_ketik_session_status(
    p_user_id, s.id, 'response_hold', p_request_id, p_lease
  );
  UPDATE public.ketik_session_responses
  SET held_messages = p_messages, closes_consumer = p_closed,
      closing = COALESCE(r.closing, false),
      typing_chars = (
        SELECT COALESCE(sum(length(item->>'text')), 0)
        FROM jsonb_array_elements(p_messages) item
      )
  WHERE session_id = s.id AND request_id = p_request_id AND status = 'held';
  RETURN to_jsonb(s);
END;
$$;

CREATE OR REPLACE FUNCTION public.reveal_ketik_session_response(
  p_user_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_expected_agent_version integer,
  p_expected_retry_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  s public.ketik_sessions%ROWTYPE;
  r public.ketik_session_responses%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.ketik_sessions
  WHERE id = p_session_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Session not found';
  END IF;
  SELECT * INTO r FROM public.ketik_session_responses
  WHERE session_id = s.id AND request_id = p_request_id FOR UPDATE;

  -- Only the version the browser paced for can publish. Replay is a read.
  IF r.status IS DISTINCT FROM 'held' OR s.state <> 'active'
    OR s.consumer_closed OR s.agent_version IS DISTINCT FROM p_expected_agent_version
    OR r.retry_count IS DISTINCT FROM p_expected_retry_count THEN
    RETURN to_jsonb(s);
  END IF;
  IF NOT r.closing AND s.expires_at <= pg_catalog.clock_timestamp() THEN
    PERFORM public.transition_ketik_session_status(
      p_user_id, s.id, 'response_retire', p_request_id
    );
  ELSIF r.context_agent_version <> s.agent_version AND r.retry_count = 0 THEN
    PERFORM public.transition_ketik_session_status(
      p_user_id, s.id, 'response_requeue', p_request_id
    );
  ELSE
    PERFORM public.transition_ketik_session_status(
      p_user_id, s.id, 'response_publish', p_request_id
    );
    UPDATE public.ketik_sessions
    SET messages = messages || r.held_messages, version = version + 1
    WHERE id = s.id;
    IF r.closes_consumer OR r.closing THEN
      PERFORM public.transition_ketik_session_status(p_user_id, s.id, 'consumer_close');
    END IF;
    SELECT * INTO s FROM public.ketik_sessions WHERE id = s.id;
  END IF;
  RETURN to_jsonb(s);
END;
$$;

REVOKE ALL ON FUNCTION public.transition_ketik_session_status(uuid,uuid,text,uuid,uuid,integer),
  public.claim_ketik_session_response(uuid,uuid,uuid,integer),
  public.claim_ketik_session_turn(uuid,uuid,uuid,integer,text,integer),
  public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer),
  public.reveal_ketik_session_response(uuid,uuid,uuid,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_ketik_session_status(uuid,uuid,text,uuid,uuid,integer),
  public.claim_ketik_session_response(uuid,uuid,uuid,integer),
  public.claim_ketik_session_turn(uuid,uuid,uuid,integer,text,integer),
  public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer),
  public.reveal_ketik_session_response(uuid,uuid,uuid,integer,integer) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
