-- ═══════════════════════════════════════════════════════
-- Migration: Telefun Scoring Lifecycle
-- Tambahkan kolom lifecycle scoring pada telefun_history
-- untuk atomic claim, idempotensi, dan caching hasil scoring.
-- ═══════════════════════════════════════════════════════

-- 1. Add scoring lifecycle columns to telefun_history
ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS scoring_status TEXT DEFAULT 'pending'
    CHECK (scoring_status IN ('pending', 'processing', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS scoring_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scoring_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scoring_attempt_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scoring_last_error TEXT;

-- 2. Indexes for query stale processing
CREATE INDEX IF NOT EXISTS idx_telefun_scoring_status
  ON public.telefun_history(scoring_status);
CREATE INDEX IF NOT EXISTS idx_telefun_scoring_claimed_at
  ON public.telefun_history(scoring_claimed_at)
  WHERE scoring_status = 'processing';

-- 3. RPC atomik: claim_telefun_scoring
-- Transitions 'pending' or 'failed' (or stale 'processing') → 'processing'.
-- Returns true if claim succeeded, false if already completed or active processing.
-- Only service_role can mutate — authenticated can only read.
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
  v_now TIMESTAMPTZ := now();
BEGIN
  SELECT scoring_status, scoring_claimed_at
  INTO v_current_status, v_claimed_at
  FROM public.telefun_history
  WHERE id = p_session_id
  FOR UPDATE; -- Lock row for atomicity

  IF v_current_status IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Already completed — caller should use cached result
  IF v_current_status = 'completed' THEN
    RETURN FALSE;
  END IF;

  -- Active processing — check for stale claim
  IF v_current_status = 'processing' THEN
    IF v_claimed_at IS NOT NULL AND
       (v_now - v_claimed_at) < make_interval(secs => p_claim_timeout_seconds) THEN
      RETURN FALSE; -- Still within timeout
    END IF;
    -- Stale claim — proceed to reclaim
  END IF;

  -- Claim: pending, failed, or stale processing
  UPDATE public.telefun_history
  SET
    scoring_status = 'processing',
    scoring_claimed_at = v_now,
    scoring_attempt_count = COALESCE(scoring_attempt_count, 0) + 1,
    scoring_last_error = NULL
  WHERE id = p_session_id;

  RETURN TRUE;
END;
$$;

-- 4. RPC atomik: complete_telefun_scoring
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

-- 5. RPC atomik: fail_telefun_scoring
CREATE OR REPLACE FUNCTION public.fail_telefun_scoring(
  p_session_id UUID,
  p_error TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.telefun_history
  SET
    scoring_status = 'failed',
    scoring_last_error = p_error
  WHERE id = p_session_id
    AND scoring_status = 'processing';

  RETURN FOUND;
END;
$$;

-- 6. Grant permissions
-- Mutation RPCs: service_role ONLY (called from backend via createAdminClient)
-- authenticated can READ scoring_status via normal SELECT on telefun_history
REVOKE ALL ON FUNCTION public.claim_telefun_scoring(UUID, INT) FROM public, anon;
REVOKE ALL ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) FROM public, anon;
REVOKE ALL ON FUNCTION public.fail_telefun_scoring(UUID, TEXT) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_telefun_scoring(UUID, TEXT) TO service_role;
