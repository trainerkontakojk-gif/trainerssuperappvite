-- ═══════════════════════════════════════════════════════
-- Migration: Repair Telefun Scoring Lifecycle Contract
-- Produksi mencatat migrasi scoring sebagai applied, tetapi
-- kolom dan RPC-nya hilang (42703 scoring_status does not exist).
-- Migration ini memulihkan kontrak secara idempoten.
-- ═══════════════════════════════════════════════════════

BEGIN;

-- 1. Scoring lifecycle columns (idempotent recovery)
ALTER TABLE public.telefun_history
  ADD COLUMN IF NOT EXISTS scoring_status TEXT DEFAULT 'pending'
    CHECK (scoring_status IN ('pending', 'processing', 'completed', 'failed')),
  ADD COLUMN IF NOT EXISTS scoring_claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scoring_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS scoring_attempt_count INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS scoring_last_error TEXT,
  ADD COLUMN IF NOT EXISTS scoring_next_attempt_at TIMESTAMPTZ;

-- ADD COLUMN IF NOT EXISTS tidak memperbaiki constraint yang hilang ketika
-- kolomnya masih ada. Pastikan constraint status juga pulih pada partial drift.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.telefun_history'::regclass
      AND conname = 'telefun_history_scoring_status_check'
  ) THEN
    ALTER TABLE public.telefun_history
      ADD CONSTRAINT telefun_history_scoring_status_check
      CHECK (scoring_status IN ('pending', 'processing', 'completed', 'failed'));
  END IF;
END
$$;

COMMENT ON COLUMN public.telefun_history.scoring_next_attempt_at
  IS 'Jadwal percobaan ulang berikutnya. NULL = segera diproses.';

-- 2. Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_telefun_scoring_status
  ON public.telefun_history(scoring_status);

CREATE INDEX IF NOT EXISTS idx_telefun_scoring_claimed_at
  ON public.telefun_history(scoring_claimed_at)
  WHERE scoring_status = 'processing';

CREATE INDEX IF NOT EXISTS idx_telefun_scoring_retry_queue
  ON public.telefun_history(scoring_next_attempt_at)
  WHERE scoring_status IN ('pending', 'failed');

-- 3. Bulk status recovery: sesi dengan score+voice_assessment → completed, sisanya pending
UPDATE public.telefun_history
SET
  scoring_status = 'completed',
  scoring_completed_at = COALESCE(scoring_completed_at, now())
WHERE score IS NOT NULL
  AND voice_assessment IS NOT NULL
  AND scoring_status IS DISTINCT FROM 'completed'
  AND scoring_status IS DISTINCT FROM 'processing';

UPDATE public.telefun_history
SET scoring_status = 'pending'
WHERE scoring_status IS NULL;

-- 4. RPC: claim_telefun_scoring (atomik, next_attempt_at aware, stale processing recovery)
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

  IF v_current_status IN ('pending', 'failed') THEN
    IF v_next_attempt IS NOT NULL AND v_next_attempt > v_now THEN
      RETURN FALSE;
    END IF;
  END IF;

  UPDATE public.telefun_history
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

-- 5. RPC: complete_telefun_scoring
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

-- 6. RPC: fail_telefun_scoring
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

-- 7. RPC: reschedule_telefun_scoring
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
  UPDATE public.telefun_history
  SET
    scoring_status = 'failed',
    scoring_last_error = p_error,
    scoring_next_attempt_at = p_next_attempt_at
  WHERE id = p_session_id
    AND scoring_status IN ('processing', 'failed');

  RETURN FOUND;
END;
$$;

-- 8. RPC: enqueue_telefun_scoring
-- Guard: jangan mengubah sesi 'processing' kembali menjadi 'pending'.
-- Hanya 'pending' (due), 'failed' (due), dan NULL yang boleh di-enqueue.
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
  SET
    scoring_status = 'pending',
    scoring_next_attempt_at = now()
  WHERE id = p_session_id
    AND scoring_status IS DISTINCT FROM 'completed'
    AND scoring_status IS DISTINCT FROM 'processing';

  RETURN FOUND;
END;
$$;

-- 9. Permission: revoke all client roles, grant only service_role
REVOKE ALL ON FUNCTION public.claim_telefun_scoring(UUID, INT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_telefun_scoring(UUID, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.enqueue_telefun_scoring(UUID) FROM public, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.claim_telefun_scoring(UUID, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_telefun_scoring(UUID, NUMERIC, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_telefun_scoring(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_telefun_scoring(UUID, TEXT, TIMESTAMPTZ) TO service_role;
GRANT EXECUTE ON FUNCTION public.enqueue_telefun_scoring(UUID) TO service_role;

-- 10. Reload schema cache agar PostgREST mendeteksi kolom baru
NOTIFY pgrst, 'reload schema';

COMMIT;
