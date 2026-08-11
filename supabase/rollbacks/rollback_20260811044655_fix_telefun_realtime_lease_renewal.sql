-- Safe rollback for the lease-renewal reason taxonomy. This intentionally
-- preserves qualified column references so rollback cannot restore the runtime
-- `expires_at` ambiguity that disconnected active calls.

CREATE OR REPLACE FUNCTION public.renew_telefun_realtime_lease(
  p_lease_id UUID,
  p_user_id UUID,
  p_session_id UUID,
  p_attempt_id UUID,
  p_lease_token_hash TEXT,
  p_ttl_ms INTEGER
) RETURNS TABLE(renewed BOOLEAN, expires_at TIMESTAMPTZ, reason TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_next TIMESTAMPTZ;
BEGIN
  IF p_ttl_ms NOT BETWEEN 1000 AND 120000 THEN
    RETURN QUERY SELECT false, v_now, 'invalid_ttl'::text;
    RETURN;
  END IF;

  v_next := v_now + make_interval(
    secs => p_ttl_ms::double precision / 1000.0
  );
  UPDATE public.telefun_realtime_leases AS lease
  SET expires_at = v_next,
      heartbeat_at = v_now,
      updated_at = v_now
  WHERE lease.id = p_lease_id
    AND lease.user_id = p_user_id
    AND lease.session_id = p_session_id
    AND lease.attempt_id = p_attempt_id
    AND lease.lease_token_hash = p_lease_token_hash
    AND lease.state = 'active'
    AND lease.expires_at > v_now;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, v_now, 'expired'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_next, 'renewed'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, INTEGER)
  TO service_role;
