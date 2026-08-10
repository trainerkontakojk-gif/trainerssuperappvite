-- Fix mark_telefun_recording_uploaded scoring_status ambiguity; based on 20260801120000_telefun_openai_webrtc_phase4_durable_lifecycle.sql.

CREATE OR REPLACE FUNCTION public.mark_telefun_recording_uploaded(
  p_session_id UUID,
  p_user_id UUID,
  p_recording_path TEXT DEFAULT NULL,
  p_agent_recording_path TEXT DEFAULT NULL,
  p_capture_status TEXT DEFAULT 'ready'
) RETURNS TABLE(
  applied BOOLEAN,
  recording_status TEXT,
  recording_ready BOOLEAN,
  scoring_ready BOOLEAN,
  scoring_status TEXT,
  reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_session public.telefun_history%ROWTYPE;
  v_recording_status TEXT;
  v_recording_path TEXT;
  v_agent_recording_path TEXT;
  v_scoring_status TEXT;
BEGIN
  SELECT h.* INTO v_session
  FROM public.telefun_history h
  WHERE h.id = p_session_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'pending'::text, false, false, 'pending'::text, 'session_not_found';
    RETURN;
  END IF;
  IF v_session.user_id <> p_user_id THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'not_owner';
    RETURN;
  END IF;
  IF p_capture_status NOT IN ('ready', 'failed') THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'invalid_capture_status';
    RETURN;
  END IF;
  IF p_recording_path IS NOT NULL
     AND p_recording_path !~ ('^' || p_user_id::text || '/' || p_session_id::text || '/full_call\.[A-Za-z0-9]+$') THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, COALESCE(v_session.scoring_status, 'pending'), 'invalid_recording_path';
    RETURN;
  END IF;
  IF p_agent_recording_path IS NOT NULL
     AND p_agent_recording_path !~ ('^' || p_user_id::text || '/' || p_session_id::text || '/agent_only\.[A-Za-z0-9]+$') THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, COALESCE(v_session.scoring_status, 'pending'), 'invalid_recording_path';
    RETURN;
  END IF;
  IF p_recording_path IS NOT NULL
     AND v_session.recording_path IS NOT NULL
     AND p_recording_path <> v_session.recording_path THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'path_conflict';
    RETURN;
  END IF;
  IF p_agent_recording_path IS NOT NULL
     AND v_session.agent_recording_path IS NOT NULL
     AND p_agent_recording_path <> v_session.agent_recording_path THEN
    RETURN QUERY SELECT false, v_session.recording_status, v_session.recording_ready_at IS NOT NULL, v_session.scoring_ready_at IS NOT NULL, COALESCE(v_session.scoring_status, 'pending'), 'path_conflict';
    RETURN;
  END IF;

  v_recording_path := COALESCE(p_recording_path, v_session.recording_path);
  v_agent_recording_path := COALESCE(p_agent_recording_path, v_session.agent_recording_path);
  IF p_capture_status = 'ready' AND v_recording_path IS NULL AND v_agent_recording_path IS NULL THEN
    RETURN QUERY SELECT false, v_session.recording_status, false, false, COALESCE(v_session.scoring_status, 'pending'), 'recording_required';
    RETURN;
  END IF;

  v_scoring_status := COALESCE(v_session.scoring_status, 'pending');
  IF p_capture_status = 'failed' THEN
    v_recording_status := 'failed';
    IF v_session.telefun_transport = 'openai-webrtc'
       AND v_scoring_status = 'processing' THEN
      v_scoring_status := 'failed';
    END IF;
  ELSIF v_session.recording_status IN ('partial', 'ready') THEN
    v_recording_status := v_session.recording_status;
  ELSE
    v_recording_status := 'uploaded';
  END IF;

  -- A failed WebRTC processing capture applies scoring_status = 'failed',
  -- scoring_claimed_at = NULL, and scoring_last_error = 'Recording capture failed'.
  UPDATE public.telefun_history
  SET recording_path = v_recording_path,
      agent_recording_path = v_agent_recording_path,
      recording_status = v_recording_status,
      recording_error = CASE
        WHEN p_capture_status = 'failed' THEN 'Recording capture failed'
        ELSE NULL
      END,
      scoring_status = CASE
        WHEN p_capture_status = 'failed'
             AND v_session.telefun_transport = 'openai-webrtc'
             AND v_session.scoring_status = 'processing'
          THEN 'failed'
        ELSE COALESCE(v_session.scoring_status, 'pending')
      END,
      scoring_claimed_at = CASE
        WHEN p_capture_status = 'failed'
             AND v_session.telefun_transport = 'openai-webrtc'
             AND v_session.scoring_status = 'processing'
          THEN NULL
        ELSE v_session.scoring_claimed_at
      END,
      scoring_last_error = CASE
        WHEN p_capture_status = 'failed'
             AND v_session.telefun_transport = 'openai-webrtc'
          THEN 'Recording capture failed'
        ELSE v_session.scoring_last_error
      END,
      scoring_ready_at = CASE WHEN p_capture_status = 'failed' THEN NULL ELSE v_session.scoring_ready_at END,
      scoring_next_attempt_at = CASE WHEN p_capture_status = 'failed' THEN NULL ELSE v_session.scoring_next_attempt_at END
  WHERE id = p_session_id;

  RETURN QUERY SELECT true,
    v_recording_status,
    (v_session.recording_ready_at IS NOT NULL
      OR v_recording_path IS NOT NULL
      OR v_agent_recording_path IS NOT NULL)
      AND v_recording_status IN ('partial', 'ready'),
    CASE WHEN p_capture_status = 'failed' THEN false ELSE v_session.scoring_ready_at IS NOT NULL END,
    v_scoring_status,
    CASE WHEN p_capture_status = 'failed' THEN 'capture_failed' ELSE 'uploaded' END;
END;
$$;
