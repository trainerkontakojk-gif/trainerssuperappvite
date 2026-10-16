BEGIN;
ALTER TABLE public.ketik_review_jobs
  ADD COLUMN lease_token uuid,
  ADD COLUMN request_id uuid,
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now();
-- Existing table-wide SELECT would expose the newly added fencing token through owner RLS.
REVOKE SELECT ON public.ketik_review_jobs FROM PUBLIC,anon,authenticated;
GRANT SELECT(id,session_id,status,lease_owner,lease_expires_at,attempt_count,error_message,created_at,updated_at)
  ON public.ketik_review_jobs TO authenticated;
CREATE INDEX ketik_review_jobs_eligible_idx ON public.ketik_review_jobs(available_at,created_at)
  WHERE status IN ('queued','processing');

-- Backend supplies actor from verified JWT. SQL rechecks active role and ownership.
CREATE FUNCTION public.can_access_ketik_review(p_actor uuid,p_session uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT EXISTS (
   SELECT 1 FROM public.profiles p JOIN public.ketik_history h ON h.id=p_session
   WHERE p.id=p_actor AND p.role IN ('admin','trainer','leader','agent') AND p.status IN ('active','approved') AND NOT coalesce(p.is_deleted,false)
   AND (h.user_id=p_actor OR p.role='admin' OR (p.role='trainer' AND EXISTS (
     SELECT 1 FROM public.ketik_configuration_assignments a JOIN public.profiles recipient ON recipient.id=a.recipient_id
     WHERE a.recipient_id=h.user_id AND a.assigned_by=p_actor
       AND recipient.role IN ('agent','leader') AND recipient.status IN ('active','approved') AND NOT coalesce(recipient.is_deleted,false)
   )))
 )
$$;
CREATE FUNCTION public.enqueue_ketik_review(p_actor uuid,p_session uuid,p_request uuid,p_rerun boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE h public.ketik_history; j public.ketik_review_jobs;
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
  IF h.review_status='completed' AND NOT p_rerun AND EXISTS(SELECT 1 FROM public.ketik_session_reviews WHERE session_id=p_session) THEN
    RETURN jsonb_build_object('status','completed');
  END IF;
  INSERT INTO public.ketik_review_jobs(session_id,status,request_id,attempt_count,available_at)
    VALUES(p_session,'queued',p_request,0,clock_timestamp())
    ON CONFLICT(session_id) DO UPDATE SET status='queued',request_id=p_request,attempt_count=0,
      available_at=clock_timestamp(),lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=clock_timestamp();
  -- Published results remain authoritative throughout a rerun.
  UPDATE public.ketik_history SET review_status='processing' WHERE id=p_session AND (review_status IS DISTINCT FROM 'completed' OR NOT EXISTS(SELECT 1 FROM public.ketik_session_reviews WHERE session_id=p_session));
  RETURN jsonb_build_object('status','queued');
END $$;

CREATE FUNCTION public.claim_ketik_review(p_worker text,p_lease_seconds integer,p_session uuid DEFAULT NULL)
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

CREATE FUNCTION public.settle_ketik_review(p_session uuid,p_token uuid,p_result jsonb DEFAULT NULL,p_release boolean DEFAULT false)
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
  IF to_regclass('public.results') IS NOT NULL THEN
    EXECUTE 'UPDATE public.results SET score=$1,status=''completed'' WHERE session_id=$2 AND module=''ketik'''
      USING (scores->>'final')::numeric,p_session;
  END IF;
  UPDATE public.ketik_review_jobs SET status='completed',lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=clock_timestamp() WHERE id=j.id;
  RETURN true;
END $$;
CREATE FUNCTION public.read_ketik_review(p_actor uuid,p_session uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('history',to_jsonb(h),
   'job',CASE WHEN j.id IS NULL THEN NULL ELSE jsonb_build_object('status',j.status,'attempt_count',j.attempt_count,'error_message',j.error_message) END,
   'review',(SELECT to_jsonb(r) FROM public.ketik_session_reviews r WHERE r.session_id=h.id ORDER BY r.created_at DESC,r.id LIMIT 1),
   'typos',coalesce((SELECT jsonb_agg(t ORDER BY t.created_at,t.id) FROM public.ketik_typo_findings t WHERE t.session_id=h.id),'[]'::jsonb))
 FROM public.ketik_history h LEFT JOIN public.ketik_review_jobs j ON j.session_id=h.id
 WHERE h.id=p_session AND public.can_access_ketik_review(p_actor,p_session)
$$;
REVOKE ALL ON FUNCTION public.read_ketik_review(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.read_ketik_review(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.can_access_ketik_review(uuid,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.enqueue_ketik_review(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.claim_ketik_review(text,integer,uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.settle_ketik_review(uuid,uuid,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_ketik_review(uuid,uuid),public.enqueue_ketik_review(uuid,uuid,uuid,boolean),public.claim_ketik_review(text,integer,uuid),public.settle_ketik_review(uuid,uuid,jsonb,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
