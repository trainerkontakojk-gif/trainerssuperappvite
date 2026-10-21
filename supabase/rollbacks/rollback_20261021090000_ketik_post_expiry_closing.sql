-- Restores the RPCs from 20261020160000: appends and replies stop at expiry or consumer close.
BEGIN;

CREATE OR REPLACE FUNCTION public.append_ketik_session_message(
  p_user_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_expected_agent_version integer,
  p_text text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  s public.ketik_sessions%ROWTYPE;
  t public.ketik_session_turns%ROWTYPE;
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
    IF t.agent_text <> p_text OR t.expected_version <> p_expected_agent_version THEN
      RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Request payload changed';
    END IF;
    RETURN to_jsonb(s);
  END IF;

  IF s.state <> 'active' OR s.consumer_closed THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Session ended';
  END IF;
  IF s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = 'PT410', MESSAGE = 'Session expired';
  END IF;
  IF length(p_text) NOT BETWEEN 1 AND 20000 OR s.version >= 200 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Invalid message';
  END IF;
  IF s.agent_version <> p_expected_agent_version THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Agent version conflict';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.ketik_session_turns
    WHERE session_id = s.id AND status <> 'completed'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Legacy turn busy';
  END IF;

  INSERT INTO public.ketik_session_turns(
    session_id, request_id, expected_version, agent_text, status,
    lease, lease_expires_at
  ) VALUES (
    s.id, p_request_id, p_expected_agent_version, p_text, 'completed',
    NULL, NULL
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

  RETURN to_jsonb(s);
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
  IF s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = 'PT410', MESSAGE = 'Session expired';
  END IF;
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
  IF v_last_sender IS DISTINCT FROM 'agent' THEN
    IF r.request_id IS NULL THEN
      INSERT INTO public.ketik_session_responses(
        session_id, request_id, context_agent_version, retry_count, status
      ) VALUES (s.id, p_request_id, s.agent_version, 0, 'completed')
      ON CONFLICT (session_id, request_id) DO UPDATE
        SET status = 'completed', lease = NULL, lease_expires_at = NULL,
            updated_at = clock_timestamp();
    ELSE
      UPDATE public.ketik_session_responses
      SET status = 'completed', lease = NULL, lease_expires_at = NULL,
          updated_at = clock_timestamp()
      WHERE session_id = s.id AND request_id = p_request_id;
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
  UPDATE public.ketik_session_responses
  SET status = 'failed', lease = NULL, lease_expires_at = NULL,
      updated_at = clock_timestamp()
  WHERE session_id = s.id
    AND status = 'processing'
    AND lease_expires_at <= clock_timestamp();

  IF r.request_id IS NULL THEN
    INSERT INTO public.ketik_session_responses(
      session_id, request_id, context_agent_version, retry_count, status,
      lease, lease_expires_at
    ) VALUES (
      s.id, p_request_id, s.agent_version, 0, 'processing',
      v_lease, clock_timestamp() + make_interval(secs => p_lease_seconds)
    );
  ELSE
    UPDATE public.ketik_session_responses
    SET context_agent_version = s.agent_version,
        retry_count = 0,
        status = 'processing',
        lease = v_lease,
        lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
        updated_at = clock_timestamp()
    WHERE session_id = s.id AND request_id = p_request_id;
  END IF;

  RETURN jsonb_build_object(
    'session', to_jsonb(s),
    'lease', v_lease,
    'replay', false,
    'noop', false
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
  IF s.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION USING ERRCODE = 'PT410', MESSAGE = 'Session expired';
  END IF;
  IF p_lease_seconds NOT BETWEEN 30 AND 600 THEN
    RAISE EXCEPTION USING ERRCODE = 'PT409', MESSAGE = 'Invalid response lease';
  END IF;

  IF s.agent_version <> r.context_agent_version THEN
    IF r.retry_count = 0 THEN
      UPDATE public.ketik_session_responses
      SET context_agent_version = s.agent_version,
          retry_count = 1,
          lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
          updated_at = clock_timestamp()
      WHERE session_id = s.id AND request_id = p_request_id;
      RETURN jsonb_build_object('action', 'retry', 'session', to_jsonb(s));
    END IF;
    UPDATE public.ketik_session_responses
    SET status = 'superseded', lease = NULL, lease_expires_at = NULL,
        updated_at = clock_timestamp()
    WHERE session_id = s.id AND request_id = p_request_id;
    RETURN jsonb_build_object('action', 'superseded', 'session', to_jsonb(s));
  END IF;

  UPDATE public.ketik_sessions
  SET messages = messages || p_messages,
      version = version + 1,
      consumer_closed = p_closed
  WHERE id = s.id
  RETURNING * INTO s;
  UPDATE public.ketik_session_responses
  SET status = 'completed', lease = NULL, lease_expires_at = NULL,
      updated_at = clock_timestamp()
  WHERE session_id = s.id AND request_id = p_request_id;
  RETURN jsonb_build_object('action', 'published', 'session', to_jsonb(s));
END;
$$;

REVOKE ALL ON FUNCTION public.append_ketik_session_message(uuid,uuid,uuid,integer,text),
  public.claim_ketik_session_response(uuid,uuid,uuid,integer),
  public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_ketik_session_message(uuid,uuid,uuid,integer,text),
  public.claim_ketik_session_response(uuid,uuid,uuid,integer),
  public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer)
  TO service_role;

COMMIT;
