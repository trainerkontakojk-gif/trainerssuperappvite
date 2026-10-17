-- Restores the 20261016000935 body of settle_ketik_review, which also writes
-- the legacy `results` table when it exists. With `results` present (local
-- after 20261017130300, and prod) every KETIK review publish fails again.
-- No data loss.

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
  IF to_regclass('public.results') IS NOT NULL THEN
    EXECUTE 'UPDATE public.results SET score=$1,status=''completed'' WHERE session_id=$2 AND module=''ketik'''
      USING (scores->>'final')::numeric,p_session;
  END IF;
  UPDATE public.ketik_review_jobs SET status='completed',lease_owner=NULL,lease_token=NULL,lease_expires_at=NULL,error_message=NULL,updated_at=clock_timestamp() WHERE id=j.id;
  RETURN true;
END $$;

NOTIFY pgrst, 'reload schema';
