-- Stop chat writes and restore the prior API before rolling back.
BEGIN;

-- The prior status union cannot represent unpublished work.
DO $$
DECLARE
  session_to_revert record;
BEGIN
  FOR session_to_revert IN
    SELECT s.id, s.user_id
    FROM public.ketik_sessions s
    JOIN public.ketik_session_responses r ON r.session_id = s.id
    WHERE r.status IN ('held', 'retry_ready')
  LOOP
    PERFORM public.transition_ketik_session_status(
      session_to_revert.user_id, session_to_revert.id, 'response_rollback_hold'
    );
  END LOOP;
END;
$$;

REVOKE SELECT (context_agent_version, typing_chars, closing)
  ON public.ketik_session_responses FROM authenticated;
ALTER TABLE public.ketik_session_responses
  DROP CONSTRAINT ketik_session_responses_status_check,
  ADD CONSTRAINT ketik_session_responses_status_check
    CHECK (status IN ('processing', 'failed', 'completed', 'superseded')),
  DROP COLUMN held_messages,
  DROP COLUMN typing_chars,
  DROP COLUMN closing,
  DROP COLUMN closes_consumer;

DROP INDEX public.ketik_session_one_processing_response;
CREATE UNIQUE INDEX ketik_session_one_processing_response
  ON public.ketik_session_responses(session_id) WHERE status = 'processing';

DROP FUNCTION public.reveal_ketik_session_response(uuid,uuid,uuid,integer,integer);

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
  IF p_event IN ('turn_reclaim', 'response_claim', 'response_retry') AND (
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

    -- claim first expires old processing rows; only failed rows can restart.
    WHEN 'response_claim' THEN
      UPDATE public.ketik_session_responses
      SET status = 'processing', context_agent_version = s.agent_version,
          retry_count = 0, lease = p_lease,
          lease_expires_at = pg_catalog.clock_timestamp()
            + pg_catalog.make_interval(secs => p_lease_seconds),
          updated_at = pg_catalog.clock_timestamp()
      WHERE session_id = s.id AND request_id = p_request_id AND status = 'failed'
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

    -- One bounded context refresh keeps processing and the same fencing token.
    WHEN 'response_retry' THEN
      UPDATE public.ketik_session_responses
      SET status = 'processing', context_agent_version = s.agent_version,
          retry_count = 1,
          lease_expires_at = pg_catalog.clock_timestamp()
            + pg_catalog.make_interval(secs => p_lease_seconds),
          updated_at = pg_catalog.clock_timestamp()
      WHERE session_id = s.id AND request_id = p_request_id
        AND status = 'processing' AND lease = p_lease
        AND lease_expires_at > pg_catalog.clock_timestamp()
        AND context_agent_version <> s.agent_version AND retry_count = 0
        AND s.state = 'active';

    -- processing -> completed with current context, or -> superseded after
    -- a second context change. Neither publishes using an expired/stale lease.
    WHEN 'response_publish', 'response_supersede' THEN
      UPDATE public.ketik_session_responses
      SET status = CASE p_event
            WHEN 'response_publish' THEN 'completed' ELSE 'superseded' END,
          lease = NULL, lease_expires_at = NULL,
          updated_at = pg_catalog.clock_timestamp()
      WHERE session_id = s.id AND request_id = p_request_id
        AND status = 'processing' AND lease = p_lease
        AND lease_expires_at > pg_catalog.clock_timestamp()
        AND s.state = 'active'
        AND (
          (p_event = 'response_publish' AND context_agent_version = s.agent_version)
          OR (p_event = 'response_supersede'
            AND context_agent_version <> s.agent_version AND retry_count = 1)
        );

    -- processing -> failed. Only expiry/cancellation may affect several rows;
    -- a provider failure must still own its request's current fencing token.
    WHEN 'response_fail', 'response_expire', 'response_cancel' THEN
      UPDATE public.ketik_session_responses
      SET status = 'failed', lease = NULL, lease_expires_at = NULL,
          updated_at = pg_catalog.clock_timestamp()
      WHERE session_id = s.id AND status = 'processing'
        AND (
          (p_event = 'response_fail' AND request_id = p_request_id AND lease = p_lease)
          OR (p_event = 'response_expire'
            AND lease_expires_at <= pg_catalog.clock_timestamp())
          OR (p_event = 'response_cancel' AND s.state IN ('ended', 'discarded'))
        );
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
    IF r.status IN ('completed', 'superseded') THEN
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
    SELECT 1
    FROM public.ketik_session_responses
    WHERE session_id = s.id
      AND request_id <> p_request_id
      AND status = 'processing'
      AND lease_expires_at > clock_timestamp()
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Response busy';
  END IF;
  PERFORM public.transition_ketik_session_status(p_user_id, s.id, 'response_expire');

  IF r.request_id IS NULL THEN
    INSERT INTO public.ketik_session_responses(
      session_id, request_id, context_agent_version, retry_count, status,
      lease, lease_expires_at
    ) VALUES (
      s.id, p_request_id, s.agent_version, 0, 'processing',
      v_lease, clock_timestamp() + make_interval(secs => p_lease_seconds)
    );
  ELSE
    PERFORM public.transition_ketik_session_status(
      p_user_id, s.id, 'response_claim', p_request_id, v_lease, p_lease_seconds
    );
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
      AND status = 'processing'
      AND lease_expires_at > clock_timestamp()
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
  IF r.lease IS DISTINCT FROM p_lease
    OR r.status <> 'processing'
    OR r.lease_expires_at <= clock_timestamp()
    OR s.state <> 'active' THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Response lease lost';
  END IF;
  IF p_lease_seconds NOT BETWEEN 30 AND 600 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Invalid response lease';
  END IF;

  IF s.agent_version <> r.context_agent_version THEN
    IF r.retry_count = 0 THEN
      PERFORM public.transition_ketik_session_status(
        p_user_id, s.id, 'response_retry', p_request_id, p_lease, p_lease_seconds
      );
      RETURN jsonb_build_object('action', 'retry', 'session', to_jsonb(s));
    END IF;
    PERFORM public.transition_ketik_session_status(
      p_user_id, s.id, 'response_supersede', p_request_id, p_lease
    );
    RETURN jsonb_build_object('action', 'superseded', 'session', to_jsonb(s));
  END IF;

  PERFORM public.transition_ketik_session_status(
    p_user_id, s.id, 'response_publish', p_request_id, p_lease
  );
  UPDATE public.ketik_sessions
  SET messages = messages || p_messages,
      version = version + 1
  WHERE id = s.id
  RETURNING * INTO s;
  -- Whatever the consumer says after expiry is its last word.
  IF p_closed OR s.expires_at <= clock_timestamp() THEN
    PERFORM public.transition_ketik_session_status(p_user_id, s.id, 'consumer_close');
    SELECT * INTO s FROM public.ketik_sessions WHERE id = s.id;
  END IF;
  RETURN jsonb_build_object('action', 'published', 'session', to_jsonb(s));
END;
$$;

REVOKE ALL ON FUNCTION public.transition_ketik_session_status(uuid,uuid,text,uuid,uuid,integer),
  public.claim_ketik_session_response(uuid,uuid,uuid,integer),
  public.claim_ketik_session_turn(uuid,uuid,uuid,integer,text,integer),
  public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_ketik_session_status(uuid,uuid,text,uuid,uuid,integer),
  public.claim_ketik_session_response(uuid,uuid,uuid,integer),
  public.claim_ketik_session_turn(uuid,uuid,uuid,integer,text,integer),
  public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
