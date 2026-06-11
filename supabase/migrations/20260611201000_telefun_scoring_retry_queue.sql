-- ═══════════════════════════════════════════════════════
-- Migration: Telefun Scoring Retry Queue
-- Menambahkan kolom next_attempt_at, index worker polling,
-- update claim RPC (next_attempt_at aware), dan RPC baru
-- untuk reschedule + enqueue otomatis.
-- ═══════════════════════════════════════════════════════

-- 1. Add retry queue columns
ALTER TABLE telefun_history
  ADD COLUMN IF NOT EXISTS scoring_next_attempt_at TIMESTAMPTZ;

COMMENT ON COLUMN telefun_history.scoring_next_attempt_at
  IS 'Jadwal percobaan ulang berikutnya. NULL = segera diproses.';

-- 2. Index untuk worker polling (pending/failed jobs yang sudah jatuh tempo)
CREATE INDEX IF NOT EXISTS idx_telefun_scoring_retry_queue
  ON telefun_history (scoring_next_attempt_at)
  WHERE scoring_status IN ('pending', 'failed');

-- 3. Perbarui claim_telefun_scoring agar menghormati next_attempt_at
--    (hanya klaim job yang sudah jatuh tempo)
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
  FROM telefun_history
  WHERE id = p_session_id
  FOR UPDATE;

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
      RETURN FALSE;
    END IF;
    -- Stale claim — proceed to reclaim
  END IF;

  -- For pending/failed, respect next_attempt_at (not yet due)
  IF v_current_status IN ('pending', 'failed') THEN
    IF v_next_attempt IS NOT NULL AND v_next_attempt > v_now THEN
      RETURN FALSE; -- Not yet time to retry
    END IF;
  END IF;

  -- Claim: pending (due), failed (due), or stale processing
  UPDATE telefun_history
  SET
    scoring_status = 'processing',
    scoring_claimed_at = v_now,
    scoring_attempt_count = COALESCE(scoring_attempt_count, 0) + 1,
    scoring_last_error = NULL,
    scoring_next_attempt_at = NULL
  WHERE id = p_session_id;

  RETURN TRUE;
END;
$$;

-- 4. RPC: reschedule_telefun_scoring
--    Transient failure → jadwalkan ulang dengan next_attempt_at.
CREATE OR REPLACE FUNCTION public.reschedule_telefun_scoring(
  p_session_id UUID,
  p_error TEXT,
  p_next_attempt_at TIMESTAMPTZ
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE telefun_history
  SET
    scoring_status = 'failed',
    scoring_last_error = p_error,
    scoring_next_attempt_at = p_next_attempt_at
  WHERE id = p_session_id
    AND scoring_status IN ('processing', 'failed');

  RETURN FOUND;
END;
$$;

-- 5. RPC: enqueue_telefun_scoring
--    Set pending + next_attempt_at = now() untuk diproses worker.
CREATE OR REPLACE FUNCTION public.enqueue_telefun_scoring(
  p_session_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE telefun_history
  SET
    scoring_status = 'pending',
    scoring_next_attempt_at = now()
  WHERE id = p_session_id
    AND scoring_status IS DISTINCT FROM 'completed';

  RETURN FOUND;
END;
$$;

-- 6. Grant permissions (service_role only)
REVOKE ALL ON FUNCTION public.claim_telefun_scoring(UUID, INT) FROM public, anon;
REVOKE ALL ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) FROM public, anon;
REVOKE ALL ON FUNCTION public.fail_telefun_scoring(UUID, TEXT) FROM public, anon;
REVOKE ALL ON FUNCTION public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ) FROM public, anon;
REVOKE ALL ON FUNCTION public.enqueue_telefun_scoring(UUID) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_telefun_scoring(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_telefun_scoring(UUID) TO service_role;
