BEGIN;
ALTER TABLE public.ketik_history ADD COLUMN transcript_provenance text NOT NULL DEFAULT 'legacy'
  CHECK (transcript_provenance IN ('legacy','server_v1'));
CREATE TABLE public.ketik_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  start_request_id uuid NOT NULL,
  snapshot jsonb NOT NULL,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active','ended','discarded')),
  version integer NOT NULL DEFAULT 0,
  messages jsonb DEFAULT '[]'::jsonb,
  consumer_closed boolean NOT NULL DEFAULT false,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  history_id uuid UNIQUE REFERENCES public.ketik_history(id) ON DELETE CASCADE,
  UNIQUE(user_id,start_request_id),
  CHECK ((state='active' AND messages IS NOT NULL) OR (state<>'active' AND messages IS NULL))
);
CREATE TABLE public.ketik_session_turns (
  session_id uuid NOT NULL REFERENCES public.ketik_sessions(id) ON DELETE CASCADE,
  request_id uuid NOT NULL,
  expected_version integer NOT NULL,
  agent_text text NOT NULL CHECK (length(agent_text) BETWEEN 1 AND 20000),
  status text NOT NULL CHECK(status IN ('processing','failed','completed')),
  lease uuid,
  lease_expires_at timestamptz,
  PRIMARY KEY(session_id,request_id)
);
CREATE UNIQUE INDEX ketik_session_one_unresolved_turn ON public.ketik_session_turns(session_id)
  WHERE status<>'completed';
ALTER TABLE public.ketik_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ketik_session_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ketik_sessions,public.ketik_session_turns FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.ketik_sessions,public.ketik_session_turns TO authenticated;
GRANT ALL ON public.ketik_sessions,public.ketik_session_turns TO service_role;
CREATE POLICY ketik_session_owner_read ON public.ketik_sessions FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY ketik_turn_owner_read ON public.ketik_session_turns FOR SELECT TO authenticated
  USING(EXISTS(SELECT 1 FROM public.ketik_sessions s WHERE s.id=session_id AND s.user_id=auth.uid()));

CREATE FUNCTION public.start_ketik_session(p_user_id uuid,p_request_id uuid,p_snapshot jsonb,p_settings_version text,p_assignment_version uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE s public.ketik_sessions%ROWTYPE; v_role text; v_version timestamptz; v_assignment uuid;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id=p_user_id AND status IN ('active','approved') AND NOT COALESCE(is_deleted,false) FOR SHARE;
  IF v_role IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Session not found'; END IF;
  -- Serializes initial requests, including the absence of a settings/session row.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text,141400));
  SELECT * INTO s FROM public.ketik_sessions WHERE user_id=p_user_id AND start_request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF (s.snapshot->'simulationSubject'->>'type') IS DISTINCT FROM (p_snapshot->'simulationSubject'->>'type')
      OR (s.snapshot->'simulationSubject'->>'participantId') IS DISTINCT FROM (p_snapshot->'simulationSubject'->>'participantId') THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Start request conflict';
    END IF;
    RETURN to_jsonb(s);
  END IF;
  SELECT updated_at INTO v_version FROM public.user_settings WHERE user_id=p_user_id FOR SHARE;
  IF NOT(CASE WHEN p_settings_version='absent' THEN v_version IS NULL ELSE COALESCE(v_version=p_settings_version::timestamptz,false) END) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Settings changed';
  END IF;
  IF v_role IN ('agent','leader') THEN
    SELECT version INTO v_assignment FROM public.ketik_configuration_assignments WHERE recipient_id=p_user_id FOR SHARE;
    IF v_assignment IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT412',MESSAGE='Assignment required'; END IF;
    IF v_assignment IS DISTINCT FROM p_assignment_version THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Assignment changed'; END IF;
  END IF;
  INSERT INTO public.ketik_sessions(user_id,start_request_id,snapshot,expires_at,messages)
    VALUES(p_user_id,p_request_id,p_snapshot,clock_timestamp()+((p_snapshot#>>'{config,simulationDuration}')::double precision*interval '1 minute'),
      jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'sender','system','text','iMessage with '||(p_snapshot#>>'{config,identity,name}'),'timestamp',clock_timestamp())))
    RETURNING * INTO s;
  RETURN to_jsonb(s);
END; $$;

CREATE FUNCTION public.claim_ketik_session_turn(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_expected_version integer,p_text text,p_lease_seconds integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE s public.ketik_sessions%ROWTYPE; t public.ketik_session_turns%ROWTYPE; v_lease uuid:=gen_random_uuid();
BEGIN
  SELECT * INTO s FROM public.ketik_sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Session not found'; END IF;
  SELECT * INTO t FROM public.ketik_session_turns WHERE session_id=s.id AND request_id=p_request_id FOR UPDATE;
  IF FOUND THEN
    IF t.agent_text<>p_text OR t.expected_version<>p_expected_version THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Request payload changed'; END IF;
    IF t.status='completed' THEN RETURN jsonb_build_object('session',to_jsonb(s),'replay',true); END IF;
    IF t.status='processing' AND t.lease_expires_at>clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Turn busy'; END IF;
  END IF;
  IF s.state<>'active' OR s.consumer_closed THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Session ended'; END IF;
  IF s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='Session expired'; END IF;
  IF p_lease_seconds NOT BETWEEN 30 AND 600 OR length(p_text) NOT BETWEEN 1 AND 20000 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invalid turn'; END IF;
  IF t.request_id IS NULL THEN
    IF s.version<>p_expected_version OR s.version>=200 OR EXISTS(SELECT 1 FROM public.ketik_session_turns WHERE session_id=s.id AND status<>'completed') THEN
      RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Turn version conflict'; END IF;
    INSERT INTO public.ketik_session_turns(session_id,request_id,expected_version,agent_text,status,lease,lease_expires_at)
      VALUES(s.id,p_request_id,p_expected_version,p_text,'processing',v_lease,clock_timestamp()+make_interval(secs=>p_lease_seconds));
    UPDATE public.ketik_sessions SET messages=messages||jsonb_build_array(jsonb_build_object('id',p_request_id,'sender','agent','text',p_text,'timestamp',clock_timestamp(),'status','sent')),version=version+1 WHERE id=s.id RETURNING * INTO s;
  ELSE
    IF s.version<>p_expected_version+1 THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Retry version conflict'; END IF;
    UPDATE public.ketik_session_turns SET status='processing',lease=v_lease,lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds)
      WHERE session_id=s.id AND request_id=p_request_id;
  END IF;
  RETURN jsonb_build_object('session',to_jsonb(s),'lease',v_lease,'replay',false);
END; $$;

CREATE FUNCTION public.publish_ketik_session_turn(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_lease uuid,p_messages jsonb,p_closed boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE s public.ketik_sessions%ROWTYPE; t public.ketik_session_turns%ROWTYPE;
BEGIN
  SELECT * INTO s FROM public.ketik_sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Session not found'; END IF;
  SELECT * INTO t FROM public.ketik_session_turns WHERE session_id=s.id AND request_id=p_request_id FOR UPDATE;
  IF t.lease IS DISTINCT FROM p_lease OR t.status<>'processing' OR t.lease_expires_at<=clock_timestamp() OR s.state<>'active' OR s.version<>t.expected_version+1 THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Turn lease lost'; END IF;
  IF s.expires_at<=clock_timestamp() THEN RAISE EXCEPTION USING ERRCODE='PT410',MESSAGE='Session expired'; END IF;
  UPDATE public.ketik_sessions SET messages=messages||p_messages,version=version+1,consumer_closed=p_closed WHERE id=s.id RETURNING * INTO s;
  UPDATE public.ketik_session_turns SET status='completed',lease=NULL,lease_expires_at=NULL WHERE session_id=s.id AND request_id=p_request_id;
  RETURN to_jsonb(s);
END; $$;

CREATE FUNCTION public.finish_ketik_session(p_user_id uuid,p_session_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
DECLARE s public.ketik_sessions%ROWTYPE; h public.ketik_history%ROWTYPE; subject jsonb;
BEGIN
  SELECT * INTO s FROM public.ketik_sessions WHERE id=p_session_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Session not found'; END IF;
  IF s.state<>'active' THEN
    SELECT * INTO h FROM public.ketik_history WHERE id=s.history_id;
    RETURN CASE WHEN h.id IS NULL THEN 'null'::jsonb ELSE to_jsonb(h) END;
  END IF;
  IF s.expires_at>clock_timestamp() AND EXISTS(SELECT 1 FROM public.ketik_session_turns WHERE session_id=s.id AND status='processing' AND lease_expires_at>clock_timestamp()) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Turn busy'; END IF;
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
  RETURN to_jsonb(h);
END; $$;

REVOKE ALL ON FUNCTION public.start_ketik_session(uuid,uuid,jsonb,text,uuid),public.claim_ketik_session_turn(uuid,uuid,uuid,integer,text,integer),public.publish_ketik_session_turn(uuid,uuid,uuid,uuid,jsonb,boolean),public.finish_ketik_session(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.start_ketik_session(uuid,uuid,jsonb,text,uuid),public.claim_ketik_session_turn(uuid,uuid,uuid,integer,text,integer),public.publish_ketik_session_turn(uuid,uuid,uuid,uuid,jsonb,boolean),public.finish_ketik_session(uuid,uuid) TO service_role;
COMMIT;
