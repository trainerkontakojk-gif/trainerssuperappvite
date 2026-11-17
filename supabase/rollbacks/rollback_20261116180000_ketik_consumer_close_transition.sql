-- Restore the three session functions from 20261116160000.
BEGIN;

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

CREATE OR REPLACE FUNCTION public.publish_ketik_session_turn(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_lease uuid,p_messages jsonb,p_closed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE s public.ketik_sessions%ROWTYPE; t public.ketik_session_turns%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.ketik_sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Session not found'; END IF;
  SELECT * INTO t FROM public.ketik_session_turns WHERE session_id=s.id AND request_id=p_request_id FOR UPDATE;
  IF t.lease IS DISTINCT FROM p_lease OR t.status<>'processing' OR t.lease_expires_at<=clock_timestamp() OR s.state<>'active' OR s.version<>t.expected_version+1 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Turn lease lost'; END IF;
  IF s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='Session expired'; END IF;
  PERFORM public.transition_ketik_session_status(p_user_id,s.id,'turn_publish',p_request_id,p_lease);
  UPDATE public.ketik_sessions SET messages=messages||p_messages,version=version+1,consumer_closed=p_closed WHERE id=s.id RETURNING * INTO s;
  RETURN to_jsonb(s);
END; $$;

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
      version = version + 1,
      -- Whatever the consumer says after expiry is its last word.
      consumer_closed = p_closed OR expires_at <= clock_timestamp()
  WHERE id = s.id
  RETURNING * INTO s;
  RETURN jsonb_build_object('action', 'published', 'session', to_jsonb(s));
END;
$$;

REVOKE ALL ON FUNCTION public.transition_ketik_session_status(uuid,uuid,text,uuid,uuid,integer),
  public.publish_ketik_session_turn(uuid,uuid,uuid,uuid,jsonb,boolean),
  public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_ketik_session_status(uuid,uuid,text,uuid,uuid,integer),
  public.publish_ketik_session_turn(uuid,uuid,uuid,uuid,jsonb,boolean),
  public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
