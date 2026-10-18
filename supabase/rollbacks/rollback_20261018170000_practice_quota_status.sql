-- Rollback: practice_quota_status
-- No data loss. Drops the status and limit helpers and restores the
-- self-contained consume_practice_quota from 20261018150000. Revert the API
-- first: GET /me/practice-quota fails without practice_quota_status.

DROP FUNCTION IF EXISTS public.practice_quota_status(uuid);

CREATE OR REPLACE FUNCTION public.consume_practice_quota(
  p_user_id uuid,
  p_module text,
  p_request_key text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Jakarta')::date;
  v_resets_at timestamptz := ((v_today + 1)::timestamp AT TIME ZONE 'Asia/Jakarta');
  v_role text;
  v_limit integer;
  v_limit_found boolean := false;
  v_used integer;
  v_existing public.practice_usage%ROWTYPE;
BEGIN
  IF p_module NOT IN ('ketik', 'pdkt', 'telefun') THEN
    RAISE EXCEPTION 'unknown practice module' USING ERRCODE = '22023';
  END IF;

  -- Serialize starts of one person in one module so two parallel requests
  -- cannot both take the last slot.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':' || p_module, 0));

  SELECT * INTO v_existing
  FROM public.practice_usage
  WHERE user_id = p_user_id AND module = p_module AND request_key = p_request_key;

  IF FOUND AND v_existing.refunded_at IS NULL THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'replayed',
      'resets_at', v_resets_at);
  END IF;

  SELECT o.daily_limit, true INTO v_limit, v_limit_found
  FROM public.practice_limit_overrides o
  WHERE o.user_id = p_user_id AND o.module = p_module
    AND (o.ends_on IS NULL OR o.ends_on >= v_today);

  IF NOT coalesce(v_limit_found, false) THEN
    SELECT lower(trim(p.role)) INTO v_role FROM public.profiles p WHERE p.id = p_user_id;
    SELECT r.daily_limit, true INTO v_limit, v_limit_found
    FROM public.practice_limit_rules r
    WHERE r.module = p_module AND r.role = v_role;
    -- Fail closed for a role without a rule.
    IF NOT coalesce(v_limit_found, false) THEN
      v_limit := 0;
    END IF;
  END IF;

  SELECT count(*) INTO v_used
  FROM public.practice_usage
  WHERE user_id = p_user_id AND module = p_module
    AND usage_date = v_today AND refunded_at IS NULL;

  IF v_limit = 0 THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'not_allowed',
      'limit', 0, 'used', v_used, 'resets_at', v_resets_at);
  END IF;
  IF v_limit IS NOT NULL AND v_used >= v_limit THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'exhausted',
      'limit', v_limit, 'used', v_used, 'resets_at', v_resets_at);
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.practice_usage
    SET refunded_at = NULL, usage_date = v_today, created_at = now()
    WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.practice_usage (user_id, module, usage_date, request_key)
    VALUES (p_user_id, p_module, v_today, p_request_key);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'reason', 'counted',
    'limit', v_limit, 'used', v_used + 1, 'resets_at', v_resets_at);
END;
$$;

DROP FUNCTION IF EXISTS public.resolve_practice_limit(uuid, text, date);

REVOKE ALL ON FUNCTION public.consume_practice_quota(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_practice_quota(uuid, text, text) TO service_role;
