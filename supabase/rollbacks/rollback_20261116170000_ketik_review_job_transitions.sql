-- DDL only: pause review mutations during rollback; current API stays compatible.
-- Restore the exact prior effective definitions. No rows, scores or jobs deleted.
BEGIN;

CREATE OR REPLACE FUNCTION public.claim_ketik_review(p_worker text,p_lease_seconds integer,p_session uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE sid uuid; j public.ketik_review_jobs;
BEGIN
  IF p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 600 AND 3600 OR p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'Invalid worker claim' USING ERRCODE='22023';
  END IF;
  -- All mutation RPCs lock history before job; SKIP LOCKED prevents competing workers blocking admission.
  SELECT h.id INTO sid FROM public.ketik_history h JOIN public.ketik_review_jobs jobs ON jobs.session_id=h.id
    WHERE (p_session IS NULL OR h.id=p_session) AND
      ((jobs.status='queued' AND jobs.available_at<=clock_timestamp()) OR
       (jobs.status='processing' AND (jobs.lease_expires_at IS NULL OR jobs.lease_expires_at<clock_timestamp())))
    ORDER BY jobs.available_at,jobs.created_at,jobs.id LIMIT 1 FOR UPDATE OF h SKIP LOCKED;
  IF sid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO j FROM public.ketik_review_jobs WHERE session_id=sid FOR UPDATE;
  IF j.attempt_count>=3 THEN
    UPDATE public.ketik_review_jobs SET status='failed',error_message='REVIEW_FAILED',lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id;
    UPDATE public.ketik_history SET review_status='failed' WHERE id=sid AND review_status IS DISTINCT FROM 'completed';
    RETURN jsonb_build_object('status','failed','sessionId',sid);
  END IF;
  UPDATE public.ketik_review_jobs SET status='processing',attempt_count=attempt_count+1,
    lease_owner=p_worker,lease_token=gen_random_uuid(),lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),
    error_message=NULL,updated_at=clock_timestamp() WHERE id=j.id RETURNING * INTO j;
  RETURN jsonb_build_object('status','processing','sessionId',sid,'token',j.lease_token,'attempt',j.attempt_count);
END $$;

CREATE OR REPLACE FUNCTION public.settle_ketik_review(p_session uuid,p_token uuid,p_result jsonb DEFAULT NULL,p_release boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.ketik_review_jobs; scores jsonb; review jsonb;
BEGIN
  IF p_release IS NULL THEN RAISE EXCEPTION 'Invalid review settlement' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM public.ketik_history WHERE id=p_session FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO j FROM public.ketik_review_jobs WHERE session_id=p_session FOR UPDATE;
  IF j.status IS DISTINCT FROM 'processing' OR j.lease_token IS DISTINCT FROM p_token OR p_token IS NULL OR j.lease_expires_at IS NULL OR j.lease_expires_at<=clock_timestamp() THEN
    RETURN false;
  END IF;
  IF p_result IS NULL THEN
    UPDATE public.ketik_review_jobs SET status=CASE WHEN p_release OR attempt_count<3 THEN 'queued' ELSE 'failed' END,
      available_at=clock_timestamp()+interval '2 seconds',error_message=CASE WHEN p_release THEN NULL ELSE 'REVIEW_FAILED' END,
      lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp() WHERE id=j.id;
    IF NOT p_release AND j.attempt_count>=3 THEN
      UPDATE public.ketik_history SET review_status='failed' WHERE id=p_session AND review_status IS DISTINCT FROM 'completed';
    END IF;
    RETURN true;
  END IF;
  scores=p_result->'scores'; review=p_result->'review';
  IF jsonb_typeof(scores) IS DISTINCT FROM 'object' OR jsonb_typeof(review) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid review result' USING ERRCODE='22023';
  END IF;
  DELETE FROM public.ketik_session_reviews WHERE session_id=p_session;
  INSERT INTO public.ketik_session_reviews(session_id,ai_summary,strengths,weaknesses,coaching_focus,education)
    VALUES(p_session,review->>'summary',review->'strengths',review->'weaknesses',review->'coachingFocus',review->'education');
  DELETE FROM public.ketik_typo_findings WHERE session_id=p_session;
  INSERT INTO public.ketik_typo_findings(session_id,message_id,original_word,corrected_word,severity)
    SELECT p_session,t->>'messageId',t->>'originalWord',t->>'correctedWord',t->>'severity'
    FROM jsonb_array_elements(coalesce(p_result->'typos','[]'::jsonb)) t;
  UPDATE public.ketik_history SET review_status='completed',final_score=(scores->>'final')::numeric,
    empathy_score=(scores->>'empathy')::numeric,probing_score=(scores->>'probing')::numeric,
    resolution_score=(scores->>'resolution')::numeric,typo_score=(scores->>'typo')::numeric,
    compliance_score=(scores->>'compliance')::numeric WHERE id=p_session;
  UPDATE public.ketik_review_jobs SET status='completed',lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=clock_timestamp() WHERE id=j.id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.enqueue_ketik_review(p_actor uuid,p_session uuid,p_request uuid,p_rerun boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE h public.ketik_history; j public.ketik_review_jobs; is_rerun boolean; limited boolean;
BEGIN
  IF p_request IS NULL OR p_rerun IS NULL THEN RAISE EXCEPTION 'Invalid review request' USING ERRCODE='22023'; END IF;
  SELECT * INTO h FROM public.ketik_history WHERE id=p_session FOR UPDATE;
  IF NOT FOUND OR NOT public.can_access_ketik_review(p_actor,p_session) THEN
    RAISE EXCEPTION 'REVIEW_NOT_FOUND' USING ERRCODE='P0001';
  END IF;
  SELECT * INTO j FROM public.ketik_review_jobs WHERE session_id=p_session FOR UPDATE;
  IF j.request_id=p_request OR j.status IN ('queued','processing') THEN
    RETURN jsonb_build_object('status',j.status);
  END IF;
  is_rerun := h.review_status='completed' AND EXISTS(SELECT 1 FROM public.ketik_session_reviews WHERE session_id=p_session);
  IF is_rerun AND NOT p_rerun THEN
    RETURN jsonb_build_object('status','completed');
  END IF;
  -- A retry after a failed first review is not a re-score and is not counted.
  SELECT p.role IN ('agent','leader') INTO limited FROM public.profiles p WHERE p.id=p_actor;
  IF is_rerun AND coalesce(limited,true) THEN
    IF h.rerun_count >= 1 THEN RAISE EXCEPTION 'RERUN_LIMIT' USING ERRCODE='P0001'; END IF;
    UPDATE public.ketik_history SET rerun_count=rerun_count+1 WHERE id=p_session;
  END IF;
  INSERT INTO public.ketik_review_jobs(session_id,status,request_id,attempt_count,available_at)
    VALUES(p_session,'queued',p_request,0,clock_timestamp())
    ON CONFLICT(session_id) DO UPDATE SET status='queued',request_id=p_request,attempt_count=0,
      available_at=clock_timestamp(),lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=clock_timestamp();
  -- Published results remain authoritative throughout a rerun.
  UPDATE public.ketik_history SET review_status='processing' WHERE id=p_session AND (review_status IS DISTINCT FROM 'completed' OR NOT EXISTS(SELECT 1 FROM public.ketik_session_reviews WHERE session_id=p_session));
  RETURN jsonb_build_object('status','queued');
END $$;

DROP FUNCTION public.transition_ketik_review_job(uuid,text,uuid,uuid,text,integer);
NOTIFY pgrst,'reload schema';
COMMIT;
