-- Centralize durable review transitions. Existing RPC signatures/JSON stay
-- compatible with the current API; no API deployment ordering dependency.
BEGIN;

-- Closed events over the CHECK-constrained queued|processing|completed|failed
-- union. Every entry locks history before job, including direct service calls.
CREATE OR REPLACE FUNCTION public.transition_ketik_review_job(
  p_session uuid,
  p_event text,
  p_request uuid DEFAULT NULL,
  p_token uuid DEFAULT NULL,
  p_worker text DEFAULT NULL,
  p_lease_seconds integer DEFAULT NULL
)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  h public.ketik_history;
  j public.ketik_review_jobs;
  changed integer;
BEGIN
  IF p_event IS NULL OR p_event NOT IN ('enqueue','claim','exhaust','release','fail_attempt','complete') THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Unknown review transition';
  END IF;
  SELECT * INTO h FROM public.ketik_history WHERE id=p_session FOR UPDATE;
  IF NOT FOUND THEN
    IF p_event='enqueue' THEN
      RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Review transition conflict';
    END IF;
    RETURN false;
  END IF;
  SELECT * INTO j FROM public.ketik_review_jobs WHERE session_id=p_session FOR UPDATE;

  CASE p_event
    WHEN 'enqueue' THEN
      IF p_request IS NULL THEN
        RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Invalid review transition request';
      END IF;
      IF j.id IS NULL THEN
        -- The history lock serializes initialization; no unguarded conflict UPDATE.
        INSERT INTO public.ketik_review_jobs(session_id,status,request_id,attempt_count,available_at)
          VALUES(p_session,'queued',p_request,0,clock_timestamp());
      ELSE
        UPDATE public.ketik_review_jobs SET status='queued',request_id=p_request,attempt_count=0,
          available_at=clock_timestamp(),lease_token=NULL,lease_owner=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=clock_timestamp()
          WHERE id=j.id AND status=j.status AND j.status IN ('completed','failed');
      END IF;
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed<>1 THEN
        RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Review transition conflict';
      END IF;

    WHEN 'claim', 'exhaust' THEN
      IF p_event='claim' AND (p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 600 AND 3600
        OR p_worker IS NULL OR length(p_worker) NOT BETWEEN 1 AND 120) THEN
        RAISE EXCEPTION 'Invalid worker claim' USING ERRCODE='22023';
      END IF;
      UPDATE public.ketik_review_jobs
        SET status=CASE WHEN p_event='claim' THEN 'processing' ELSE 'failed' END,
          attempt_count=attempt_count+CASE WHEN p_event='claim' THEN 1 ELSE 0 END,
          lease_owner=CASE WHEN p_event='claim' THEN p_worker ELSE NULL END,
          lease_token=CASE WHEN p_event='claim' THEN gen_random_uuid() ELSE NULL END,
          lease_expires_at=CASE WHEN p_event='claim' THEN clock_timestamp()+make_interval(secs=>p_lease_seconds) ELSE NULL END,
          error_message=CASE WHEN p_event='exhaust' THEN 'REVIEW_FAILED' ELSE NULL END,
          updated_at=clock_timestamp()
        WHERE id=j.id AND status=j.status
          AND ((status='queued' AND available_at<=clock_timestamp()) OR
            (status='processing' AND (lease_expires_at IS NULL OR lease_expires_at<clock_timestamp())))
          AND ((p_event='claim' AND attempt_count<3) OR (p_event='exhaust' AND attempt_count>=3));
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed<>1 THEN RETURN false; END IF;

    WHEN 'release', 'fail_attempt', 'complete' THEN
      UPDATE public.ketik_review_jobs
        SET status=CASE WHEN p_event='complete' THEN 'completed'
              WHEN p_event='release' OR attempt_count<3 THEN 'queued' ELSE 'failed' END,
          available_at=CASE WHEN p_event='complete' THEN available_at ELSE clock_timestamp()+interval '2 seconds' END,
          error_message=CASE WHEN p_event='fail_attempt' THEN 'REVIEW_FAILED' ELSE NULL END,
          lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,updated_at=clock_timestamp()
        WHERE id=j.id AND status='processing' AND lease_token=p_token
          AND lease_expires_at>clock_timestamp();
      GET DIAGNOSTICS changed = ROW_COUNT;
      IF changed<>1 THEN RETURN false; END IF;
  END CASE;

  -- Published results remain authoritative throughout a rerun. Nullable history
  -- status is legacy: IS NOT DISTINCT FROM is the null-safe expected-status CAS.
  IF p_event='enqueue' AND (h.review_status IS DISTINCT FROM 'completed'
      OR NOT EXISTS(SELECT 1 FROM public.ketik_session_reviews WHERE session_id=p_session)) THEN
    UPDATE public.ketik_history SET review_status='processing'
      WHERE id=p_session AND review_status IS NOT DISTINCT FROM h.review_status;
  ELSIF (p_event='exhaust' OR (p_event='fail_attempt' AND j.attempt_count>=3))
      AND h.review_status IS DISTINCT FROM 'completed' THEN
    UPDATE public.ketik_history SET review_status='failed'
      WHERE id=p_session AND review_status IS NOT DISTINCT FROM h.review_status;
  ELSIF p_event='complete' THEN
    UPDATE public.ketik_history SET review_status='completed'
      WHERE id=p_session AND review_status IS NOT DISTINCT FROM h.review_status;
  ELSE
    RETURN true;
  END IF;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed<>1 THEN
    RAISE EXCEPTION USING ERRCODE='PT409', MESSAGE='Review history transition conflict';
  END IF;
  RETURN true;
END $$;

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
  -- The candidate snapshot may predate a committed claim/settle. History locks
  -- alone do not refresh the joined job: recheck the now-locked row.
  IF NOT FOUND OR NOT ((j.status='queued' AND j.available_at<=clock_timestamp()) OR
    (j.status='processing' AND (j.lease_expires_at IS NULL OR j.lease_expires_at<clock_timestamp()))) THEN
    RETURN NULL;
  END IF;
  IF j.attempt_count>=3 THEN
    IF NOT public.transition_ketik_review_job(sid,'exhaust') THEN RETURN NULL; END IF;
    RETURN jsonb_build_object('status','failed','sessionId',sid);
  END IF;
  IF NOT public.transition_ketik_review_job(sid,'claim',p_worker=>p_worker,p_lease_seconds=>p_lease_seconds) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO j FROM public.ketik_review_jobs WHERE session_id=sid;
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
    RETURN public.transition_ketik_review_job(p_session,CASE WHEN p_release THEN 'release' ELSE 'fail_attempt' END,p_token=>p_token);
  END IF;
  scores=p_result->'scores'; review=p_result->'review';
  IF jsonb_typeof(scores) IS DISTINCT FROM 'object' OR jsonb_typeof(review) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Invalid review result' USING ERRCODE='22023';
  END IF;
  -- Transition before business writes so a fence miss returns false with no
  -- publication. Later failures still roll back status and results together.
  IF NOT public.transition_ketik_review_job(p_session,'complete',p_token=>p_token) THEN RETURN false; END IF;
  DELETE FROM public.ketik_session_reviews WHERE session_id=p_session;
  INSERT INTO public.ketik_session_reviews(session_id,ai_summary,strengths,weaknesses,coaching_focus,education)
    VALUES(p_session,review->>'summary',review->'strengths',review->'weaknesses',review->'coachingFocus',review->'education');
  DELETE FROM public.ketik_typo_findings WHERE session_id=p_session;
  INSERT INTO public.ketik_typo_findings(session_id,message_id,original_word,corrected_word,severity)
    SELECT p_session,t->>'messageId',t->>'originalWord',t->>'correctedWord',t->>'severity'
    FROM jsonb_array_elements(coalesce(p_result->'typos','[]'::jsonb)) t;
  UPDATE public.ketik_history SET final_score=(scores->>'final')::numeric,
    empathy_score=(scores->>'empathy')::numeric,probing_score=(scores->>'probing')::numeric,
    resolution_score=(scores->>'resolution')::numeric,typo_score=(scores->>'typo')::numeric,
    compliance_score=(scores->>'compliance')::numeric WHERE id=p_session;
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
  PERFORM public.transition_ketik_review_job(p_session,'enqueue',p_request=>p_request);
  RETURN jsonb_build_object('status','queued');
END $$;

REVOKE ALL ON FUNCTION public.transition_ketik_review_job(uuid,text,uuid,uuid,text,integer),
  public.claim_ketik_review(text,integer,uuid),
  public.settle_ketik_review(uuid,uuid,jsonb,boolean),
  public.enqueue_ketik_review(uuid,uuid,uuid,boolean)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.transition_ketik_review_job(uuid,text,uuid,uuid,text,integer),
  public.claim_ketik_review(text,integer,uuid),
  public.settle_ketik_review(uuid,uuid,jsonb,boolean),
  public.enqueue_ketik_review(uuid,uuid,uuid,boolean)
  TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
