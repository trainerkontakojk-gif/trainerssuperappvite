BEGIN;

-- Restore the pre-Phase-4 scoring gates before removing the additive columns.
-- This is the exact completion contract from the latest pre-Phase-4 scoring
-- migration: no WebRTC readiness gate and no row lock.
CREATE OR REPLACE FUNCTION public.complete_telefun_scoring(
  p_session_id UUID,
  p_score NUMERIC,
  p_voice_assessment JSONB DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.telefun_history
  SET
    scoring_status = 'completed',
    scoring_completed_at = now(),
    score = p_score,
    voice_assessment = COALESCE(p_voice_assessment, voice_assessment)
  WHERE id = p_session_id
    AND scoring_status = 'processing';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_telefun_scoring(
  p_session_id UUID,
  p_claim_timeout_seconds INT DEFAULT 120
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_status TEXT;
  v_claimed_at TIMESTAMPTZ;
  v_next_attempt TIMESTAMPTZ;
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT scoring_status, scoring_claimed_at, scoring_next_attempt_at
  INTO v_current_status, v_claimed_at, v_next_attempt
  FROM public.telefun_history
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_current_status IS NULL OR v_current_status = 'completed' THEN
    RETURN FALSE;
  END IF;
  IF v_current_status = 'processing' THEN
    IF v_claimed_at IS NOT NULL AND
       (v_now - v_claimed_at) < make_interval(secs => p_claim_timeout_seconds) THEN
      RETURN FALSE;
    END IF;
  END IF;
  IF v_current_status IN ('pending', 'failed')
     AND v_next_attempt IS NOT NULL
     AND v_next_attempt > v_now THEN
    RETURN FALSE;
  END IF;

  UPDATE public.telefun_history
  SET scoring_status = 'processing',
      scoring_claimed_at = v_now,
      scoring_attempt_count = COALESCE(scoring_attempt_count, 0) + 1,
      scoring_last_error = NULL,
      scoring_next_attempt_at = NULL
  WHERE id = p_session_id;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_telefun_scoring(
  p_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.telefun_history
  SET scoring_status = 'pending',
      scoring_next_attempt_at = now()
  WHERE id = p_session_id
    AND scoring_status IS DISTINCT FROM 'completed'
    AND scoring_status IS DISTINCT FROM 'processing';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_telefun_scoring(UUID, INT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_telefun_scoring(UUID) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_telefun_scoring(UUID) TO service_role;

-- Remove only Phase 4 objects after the pre-Phase-4 scoring functions are back.
DROP TRIGGER IF EXISTS telefun_attempt_block_active_delete
  ON public.telefun_realtime_attempts;
DROP FUNCTION IF EXISTS public.prevent_active_telefun_attempt_delete();
DROP TRIGGER IF EXISTS telefun_history_block_active_webrtc_delete
  ON public.telefun_history;
DROP FUNCTION IF EXISTS public.prevent_active_telefun_history_delete();
DROP FUNCTION IF EXISTS public.fail_telefun_realtime_session_without_attempt(UUID, UUID);
DROP FUNCTION IF EXISTS public.claim_telefun_realtime_attempt(UUID, UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.bind_telefun_realtime_provider_call(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.mark_telefun_realtime_sideband_connected(UUID, UUID);
DROP FUNCTION IF EXISTS public.checkpoint_telefun_realtime_transcript(UUID, UUID, BIGINT, TEXT, TEXT, TEXT, INTEGER, BOOLEAN);
DROP FUNCTION IF EXISTS public.begin_telefun_realtime_finalization(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.finalize_telefun_realtime_attempt(UUID, UUID, UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.mark_telefun_realtime_usage(UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.mark_telefun_recording_uploaded(UUID, UUID, TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.mark_telefun_recording_ready(UUID, UUID, TEXT, TEXT);

REVOKE ALL ON TABLE public.telefun_realtime_transcript_events FROM public, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.telefun_realtime_attempts FROM public, anon, authenticated, service_role;
DROP TABLE IF EXISTS public.telefun_realtime_transcript_events;
DROP TABLE IF EXISTS public.telefun_realtime_attempts;

ALTER TABLE public.telefun_history
  DROP CONSTRAINT IF EXISTS telefun_history_recording_status_check,
  DROP CONSTRAINT IF EXISTS telefun_history_recording_error_check;
ALTER TABLE public.telefun_history
  DROP COLUMN IF EXISTS recording_status,
  DROP COLUMN IF EXISTS recording_ready_at,
  DROP COLUMN IF EXISTS recording_error,
  DROP COLUMN IF EXISTS scoring_ready_at;

NOTIFY pgrst, 'reload schema';
COMMIT;
