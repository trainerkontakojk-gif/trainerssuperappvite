-- Repair runtime ambiguity in distributed WebRTC lease renewal and return
-- bounded rejection reasons without exposing lease-token or row payload data.

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
  v_lease public.telefun_realtime_leases%ROWTYPE;
BEGIN
  IF p_ttl_ms NOT BETWEEN 1000 AND 120000 THEN
    RETURN QUERY SELECT false, v_now, 'invalid_ttl'::text;
    RETURN;
  END IF;

  SELECT lease.* INTO v_lease
  FROM public.telefun_realtime_leases AS lease
  WHERE lease.id = p_lease_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT false, v_now, 'lease_not_found'::text;
    RETURN;
  END IF;

  v_now := clock_timestamp();
  IF v_lease.user_id IS DISTINCT FROM p_user_id
     OR v_lease.session_id IS DISTINCT FROM p_session_id
     OR v_lease.attempt_id IS DISTINCT FROM p_attempt_id
     OR v_lease.lease_token_hash IS DISTINCT FROM p_lease_token_hash THEN
    RETURN QUERY SELECT false, v_now, 'owner_mismatch'::text;
    RETURN;
  END IF;
  IF v_lease.state IS DISTINCT FROM 'active' THEN
    RETURN QUERY SELECT false, v_lease.expires_at, 'inactive'::text;
    RETURN;
  END IF;
  IF v_lease.expires_at <= v_now THEN
    RETURN QUERY SELECT false, v_lease.expires_at, 'expired'::text;
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
    RETURN QUERY SELECT false, v_now, 'renewal_conflict'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT true, v_next, 'renewed'::text;
END;
$$;

REVOKE ALL ON FUNCTION public.renew_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_telefun_realtime_lease(UUID, UUID, UUID, UUID, TEXT, INTEGER)
  TO service_role;
