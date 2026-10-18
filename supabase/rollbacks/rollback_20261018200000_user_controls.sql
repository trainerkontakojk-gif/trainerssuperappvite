-- Rollback for 20261018200000_user_controls.sql: restores enqueue_ketik_review
-- from 20261016000935, drops the re-score counter and revoke_user_sessions.
BEGIN;
CREATE OR REPLACE FUNCTION public.enqueue_ketik_review(p_actor uuid,p_session uuid,p_request uuid,p_rerun boolean DEFAULT false)
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
ALTER TABLE public.ketik_history DROP COLUMN IF EXISTS rerun_count;
DROP FUNCTION IF EXISTS public.revoke_user_sessions(uuid);
NOTIFY pgrst,'reload schema';
COMMIT;
