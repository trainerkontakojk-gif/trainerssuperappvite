-- Rollback for 20260611201000_telefun_scoring_retry_queue.sql
-- Hapus RPC baru, kembalikan claim RPC ke versi sebelumnya (tanpa next_attempt_at),
-- hapus index dan kolom.

-- Hapus RPC baru
DROP FUNCTION IF EXISTS public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.enqueue_telefun_scoring(UUID);

-- Kembalikan claim RPC ke versi P1.1 (tanpa next_attempt_at)
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
  FROM telefun_history
  WHERE id = p_session_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_current_status = 'completed' THEN
    RETURN FALSE;
  END IF;

  IF v_current_status = 'processing' THEN
    IF v_claimed_at IS NOT NULL AND
       (v_now - v_claimed_at) < make_interval(secs => p_claim_timeout_seconds) THEN
      RETURN FALSE;
    END IF;
  END IF;

  UPDATE telefun_history
  SET
    scoring_status = 'processing',
    scoring_claimed_at = v_now,
    scoring_attempt_count = COALESCE(scoring_attempt_count, 0) + 1,
    scoring_last_error = NULL
  WHERE id = p_session_id;

  RETURN TRUE;
END;
$$;

-- Revoke grant on dropped RPCs
REVOKE ALL ON FUNCTION public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ) FROM public, anon;
REVOKE ALL ON FUNCTION public.enqueue_telefun_scoring(UUID) FROM public, anon;

-- Hapus index
DROP INDEX IF EXISTS public.idx_telefun_scoring_retry_queue;

-- Hapus kolom
ALTER TABLE telefun_history
  DROP COLUMN IF EXISTS scoring_next_attempt_at;
