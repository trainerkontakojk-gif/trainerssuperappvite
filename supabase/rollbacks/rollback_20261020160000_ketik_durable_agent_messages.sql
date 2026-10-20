-- Rollback for 20261020160000_ketik_durable_agent_messages.sql: restores the
-- single-turn lifecycle from 20261015140000_ketik_server_sessions.sql. Appended
-- agent messages remain in the transcript; only the response ledger and the
-- agent context counter disappear, so finish active sessions first and accept
-- that a discarded/retried reply is no longer visible.
BEGIN;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.ketik_sessions WHERE state='active') THEN
    RAISE EXCEPTION 'Finish or explicitly preserve active sessions before rollback';
  END IF;
END $$;

DROP FUNCTION public.fail_ketik_session_response(uuid,uuid,uuid,uuid);
DROP FUNCTION public.settle_ketik_session_response(uuid,uuid,uuid,uuid,jsonb,boolean,integer);
DROP FUNCTION public.claim_ketik_session_response(uuid,uuid,uuid,integer);
DROP FUNCTION public.append_ketik_session_message(uuid,uuid,uuid,integer,text);
DROP TABLE public.ketik_session_responses;

CREATE OR REPLACE FUNCTION public.claim_ketik_session_turn(p_user_id uuid,p_session_id uuid,p_request_id uuid,p_expected_version integer,p_text text,p_lease_seconds integer)
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

ALTER TABLE public.ketik_sessions DROP COLUMN agent_version;
COMMIT;
