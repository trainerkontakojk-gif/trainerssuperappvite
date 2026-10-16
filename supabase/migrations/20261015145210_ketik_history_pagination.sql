BEGIN;
CREATE INDEX ketik_history_owner_date_id_idx ON public.ketik_history(user_id, date DESC, id DESC);

-- Backend supplies the authenticated owner. No user-callable cross-owner RPC.
CREATE FUNCTION public.ketik_history_page(
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
NOTIFY pgrst,'reload schema';
COMMIT;
