BEGIN;

ALTER TABLE public.ketik_sessions
  ADD COLUMN agent_version integer NOT NULL DEFAULT 0 CHECK (agent_version >= 0);

CREATE TABLE public.ketik_session_responses (
  session_id uuid NOT NULL REFERENCES public.ketik_sessions(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  context_agent_version integer NOT NULL CHECK (context_agent_version >= 0),
  retry_count integer NOT NULL DEFAULT 0 CHECK (retry_count BETWEEN 0 AND 1),
  status text NOT NULL CHECK (status IN ('processing','failed','completed','superseded')),
  lease uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (session_id, request_id),
  CHECK (
    (status = 'processing' AND lease IS NOT NULL AND lease_expires_at IS NOT NULL)
    OR (status <> 'processing' AND lease IS NULL AND lease_expires_at IS NULL)
  )
);
CREATE UNIQUE INDEX ketik_session_one_processing_response
  ON public.ketik_session_responses(session_id)
  WHERE status = 'processing';

ALTER TABLE public.ketik_session_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ketik_session_responses FROM PUBLIC, anon, authenticated;
GRANT SELECT (
  session_id, request_id, status, retry_count, lease_expires_at,
  created_at, updated_at
) ON public.ketik_session_responses TO authenticated;
GRANT ALL ON public.ketik_session_responses TO service_role;
CREATE POLICY ketik_response_owner_read
  ON public.ketik_session_responses
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.ketik_sessions s
      WHERE s.id = session_id AND s.user_id = auth.uid()
    )
  );

CREATE FUNCTION public.append_ketik_session_message(
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

-- Rolling-deploy compatibility: legacy turns also advance agent_version and
-- cannot start while the split response lifecycle owns the session.
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
    UPDATE public.ketik_session_turns
    SET status = 'processing',
        lease = v_lease,
        lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
    WHERE session_id = s.id AND request_id = p_request_id;
  END IF;
  RETURN jsonb_build_object(
    'session', to_jsonb(s),
    'lease', v_lease,
    'replay', false
  );
END;
$$;

CREATE FUNCTION public.claim_ketik_session_response(
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

CREATE FUNCTION public.settle_ketik_session_response(
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

CREATE FUNCTION public.fail_ketik_session_response(
  p_user_id uuid,
  p_session_id uuid,
  p_request_id uuid,
  p_lease uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_changed integer;
BEGIN
  PERFORM 1
  FROM public.ketik_sessions
  WHERE id = p_session_id AND user_id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'PT404', MESSAGE = 'Session not found';
  END IF;
  UPDATE public.ketik_session_responses
  SET status = 'failed', lease = NULL, lease_expires_at = NULL,
      updated_at = clock_timestamp()
  WHERE session_id = p_session_id
    AND request_id = p_request_id
    AND lease = p_lease
    AND status = 'processing';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_ketik_session(p_user_id uuid,p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE s public.ketik_sessions%ROWTYPE; h public.ketik_history%ROWTYPE; subject jsonb;
BEGIN
  SELECT * INTO s FROM public.ketik_sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Session not found'; END IF;
  IF s.state<>'active' THEN
    SELECT * INTO h FROM public.ketik_history WHERE id=s.history_id;
    RETURN CASE WHEN h.id IS NULL THEN 'null'::jsonb ELSE to_jsonb(h) END;
  END IF;
  IF s.expires_at>clock_timestamp() AND (
    EXISTS(SELECT 1 FROM public.ketik_session_turns WHERE session_id=s.id AND status='processing' AND lease_expires_at>clock_timestamp())
    OR EXISTS(SELECT 1 FROM public.ketik_session_responses WHERE session_id=s.id AND status='processing' AND lease_expires_at>clock_timestamp())
  ) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Response busy';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.messages) m WHERE m->>'sender'='agent') THEN
    UPDATE public.ketik_sessions SET state='discarded',messages=NULL WHERE id=s.id;
    RETURN 'null'::jsonb;
  END IF;
  subject:=s.snapshot->'simulationSubject';
  INSERT INTO public.ketik_history(id,user_id,date,scenario_title,consumer_name,consumer_phone,consumer_city,messages,simulation_duration,
    simulation_subject_type,simulation_subject_peserta_id,simulation_subject_name,simulation_subject_batch_name,simulation_subject_team,transcript_provenance)
    VALUES(s.id,s.user_id,s.started_at,s.snapshot#>>'{scenario,title}',s.snapshot#>>'{config,identity,name}',s.snapshot#>>'{config,identity,phone}',s.snapshot#>>'{config,identity,city}',s.messages,(s.snapshot#>>'{config,simulationDuration}')::numeric,
    subject->>'type',(subject->>'participantId')::uuid,subject->>'displayName',subject->>'batchName',subject->>'team','server_v1') RETURNING * INTO h;
  UPDATE public.ketik_sessions SET state='ended',history_id=h.id,messages=NULL WHERE id=s.id;
  UPDATE public.ketik_session_turns SET status='failed',lease=NULL,lease_expires_at=NULL WHERE session_id=s.id AND status='processing';
  UPDATE public.ketik_session_responses SET status='failed',lease=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE session_id=s.id AND status='processing';
  RETURN to_jsonb(h);
END; $$;

REVOKE ALL ON FUNCTION public.append_ketik_session_message(uuid,uuid,uuid,integer,text),
  public.claim_ketik_session_response(uuid,uuid,uuid,integer),
  public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer),
  public.fail_ketik_session_response(uuid,uuid,uuid,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_ketik_session_message(uuid,uuid,uuid,integer,text),
  public.claim_ketik_session_response(uuid,uuid,uuid,integer),
  public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer),
  public.fail_ketik_session_response(uuid,uuid,uuid,uuid)
  TO service_role;

COMMIT;
