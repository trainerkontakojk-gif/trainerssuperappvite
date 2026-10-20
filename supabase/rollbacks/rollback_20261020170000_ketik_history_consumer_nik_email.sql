-- Drops stored NIK/email values; restore application compatibility before rollback.
BEGIN;

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
REVOKE ALL ON FUNCTION public.finish_ketik_session(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.finish_ketik_session(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.ketik_history_page(
  p_owner uuid, p_limit integer DEFAULT 20, p_query text DEFAULT '',
  p_status text DEFAULT 'all', p_before_date timestamptz DEFAULT NULL,
  p_before_id uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE result jsonb; page jsonb;
BEGIN
  IF p_owner IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_limit IS NULL
    OR p_query IS NULL OR length(p_query) > 120 OR p_status IS NULL
    OR p_status NOT IN ('all','completed','running','failed','not_started')
    OR (p_before_date IS NULL) <> (p_before_id IS NULL) THEN
    RAISE EXCEPTION 'Invalid history query' USING ERRCODE='22023';
  END IF;
  WITH matched AS (
    SELECT review_status, final_score FROM public.ketik_history
    WHERE user_id=p_owner AND (p_query='' OR
      strpos(lower(scenario_title),lower(p_query))>0 OR
      strpos(lower(consumer_name),lower(p_query))>0 OR
      strpos(lower(CASE simulation_subject_type WHEN 'self' THEN 'Anda'
        WHEN 'participant' THEN coalesce(simulation_subject_name,'Peserta')
        ELSE 'Tidak tercatat' END),lower(p_query))>0)
  )
  SELECT jsonb_build_object(
    'counts', jsonb_build_object('all',count(*),
      'completed',count(*) FILTER(WHERE review_status='completed'),
      'running',count(*) FILTER(WHERE review_status='processing'),
      'failed',count(*) FILTER(WHERE review_status='failed'),
      'not_started',count(*) FILTER(WHERE review_status IS NULL OR review_status='pending')),
    'reviewedCount',count(final_score) FILTER(WHERE review_status='completed'),
    'averageScore',round(avg(final_score) FILTER(WHERE review_status='completed'))
  ) INTO result FROM matched;
  SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.date DESC,r.id DESC),'[]'::jsonb) INTO page FROM (
    SELECT id,date,scenario_title,consumer_name,consumer_phone,consumer_city,
      simulation_duration,final_score,empathy_score,probing_score,resolution_score,
      typo_score,compliance_score,review_status,simulation_subject_type,
      simulation_subject_peserta_id,simulation_subject_name,simulation_subject_batch_name,
      simulation_subject_team
    FROM public.ketik_history
    WHERE user_id=p_owner AND (p_query='' OR
      strpos(lower(scenario_title),lower(p_query))>0 OR
      strpos(lower(consumer_name),lower(p_query))>0 OR
      strpos(lower(CASE simulation_subject_type WHEN 'self' THEN 'Anda'
        WHEN 'participant' THEN coalesce(simulation_subject_name,'Peserta')
        ELSE 'Tidak tercatat' END),lower(p_query))>0)
    AND (p_status='all' OR review_status=CASE p_status WHEN 'running' THEN 'processing'
      WHEN 'not_started' THEN 'pending' ELSE p_status END
      OR (p_status='not_started' AND review_status IS NULL))
    AND (p_before_date IS NULL OR (date,id)<(p_before_date,p_before_id))
    ORDER BY date DESC,id DESC LIMIT p_limit+1
  ) r;
  RETURN result || jsonb_build_object('items',page);
END $$;
REVOKE ALL ON FUNCTION public.ketik_history_page(uuid,integer,text,text,timestamptz,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ketik_history_page(uuid,integer,text,text,timestamptz,uuid) TO service_role;

ALTER TABLE public.ketik_history DROP COLUMN consumer_nik, DROP COLUMN consumer_email;
NOTIFY pgrst,'reload schema';
COMMIT;
