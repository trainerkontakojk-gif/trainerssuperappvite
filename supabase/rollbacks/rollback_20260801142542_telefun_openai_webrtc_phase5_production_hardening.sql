BEGIN;

-- Phase 5 rollback is additive: the original Phase 4 finalization RPCs remain
-- intact because precise network/orphan outcomes use the *_p5 overloads.
-- Preconditions: drain/resolve any Phase 5 rows with network_lost/orphaned
-- outcomes before this rollback; the restored Phase 4 outcome constraints only
-- allow completed/failed and therefore intentionally fail closed otherwise.
REVOKE ALL ON FUNCTION public.store_telefun_realtime_provider_call_reference(UUID, UUID, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_telefun_realtime_lease(UUID, UUID, UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.renew_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, INTEGER) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_telefun_realtime_rate_limit(TEXT, UUID, UUID, TEXT, INTEGER, INTEGER) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_telefun_realtime_orphans(INTEGER) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_telefun_realtime_orphan(UUID, UUID, TEXT, BOOLEAN, BOOLEAN, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_telefun_realtime_metric(TEXT, TEXT, TEXT, UUID, UUID, BIGINT, JSONB) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_telefun_realtime_finalization_p5(UUID, UUID, UUID, TEXT) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.finalize_telefun_realtime_attempt_p5(UUID, UUID, UUID, TEXT, INTEGER) FROM public, anon, authenticated;

DROP FUNCTION IF EXISTS public.store_telefun_realtime_provider_call_reference(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.claim_telefun_realtime_lease(UUID, UUID, UUID, TEXT, TEXT, INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.renew_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, INTEGER);
DROP FUNCTION IF EXISTS public.release_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.consume_telefun_realtime_rate_limit(TEXT, UUID, UUID, TEXT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.claim_telefun_realtime_orphans(INTEGER);
DROP FUNCTION IF EXISTS public.complete_telefun_realtime_orphan(UUID, UUID, TEXT, BOOLEAN, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.record_telefun_realtime_metric(TEXT, TEXT, TEXT, UUID, UUID, BIGINT, JSONB);
DROP FUNCTION IF EXISTS public.begin_telefun_realtime_finalization_p5(UUID, UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.finalize_telefun_realtime_attempt_p5(UUID, UUID, UUID, TEXT, INTEGER);

DROP TABLE IF EXISTS public.telefun_realtime_metrics;
DROP TABLE IF EXISTS public.telefun_realtime_rate_limits;
DROP TABLE IF EXISTS public.telefun_realtime_leases;

ALTER TABLE public.telefun_realtime_attempts
  DROP COLUMN IF EXISTS lease_id,
  DROP COLUMN IF EXISTS lease_token_hash,
  DROP COLUMN IF EXISTS provider_call_reference,
  DROP COLUMN IF EXISTS recovery_boundary_id,
  DROP COLUMN IF EXISTS sideband_disconnect_count,
  DROP COLUMN IF EXISTS duplicate_write_count,
  DROP COLUMN IF EXISTS missing_usage_count,
  DROP COLUMN IF EXISTS orphaned_at;

ALTER TABLE public.telefun_realtime_attempts
  DROP CONSTRAINT IF EXISTS telefun_realtime_attempts_requested_outcome_check,
  DROP CONSTRAINT IF EXISTS telefun_realtime_attempts_outcome_check,
  ADD CONSTRAINT telefun_realtime_attempts_requested_outcome_check
    CHECK (requested_outcome IS NULL OR requested_outcome IN ('completed', 'failed')),
  ADD CONSTRAINT telefun_realtime_attempts_outcome_check
    CHECK (outcome IS NULL OR outcome IN ('completed', 'failed'));

NOTIFY pgrst, 'reload schema';
COMMIT;
