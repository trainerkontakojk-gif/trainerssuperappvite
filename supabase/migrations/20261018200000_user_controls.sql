-- Kontrol pengguna fase 5 (plans/markdown/kontrol-user-fase-5.md):
-- 1. revoke_user_sessions: end every open login of one account (service role).
-- 2. KETIK re-score limit: agent and leader may re-score a reviewed session once.
-- Safe to reapply (ketik-review-worker-api.spec.ts reapplies it after its rollback test).
BEGIN;

CREATE OR REPLACE FUNCTION public.revoke_user_sessions(p_user uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ended integer;
BEGIN
  -- Refresh tokens are removed with their session (ON DELETE CASCADE).
  DELETE FROM auth.sessions WHERE user_id = p_user;
  GET DIAGNOSTICS ended = ROW_COUNT;
  RETURN ended;
END $$;
REVOKE ALL ON FUNCTION public.revoke_user_sessions(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_sessions(uuid) TO service_role;

-- Re-scores started by an agent or leader. ketik_history has no UPDATE policy
-- for owners, so only the service role changes it.
ALTER TABLE public.ketik_history
  ADD COLUMN IF NOT EXISTS rerun_count integer NOT NULL DEFAULT 0 CHECK (rerun_count >= 0);

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
REVOKE ALL ON FUNCTION public.enqueue_ketik_review(uuid,uuid,uuid,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_ketik_review(uuid,uuid,uuid,boolean) TO service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
