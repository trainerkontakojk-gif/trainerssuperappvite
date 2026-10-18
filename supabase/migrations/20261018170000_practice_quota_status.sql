-- Remaining practice quota for the module pages (GET /me/practice-quota).
-- Plan: plans/markdown/kontrol-user-fase-3.md. The limit rule moves into one
-- helper so counting a start and showing what is left can never disagree.

CREATE OR REPLACE FUNCTION public.resolve_practice_limit(
  p_user_id uuid,
  p_module text,
  p_today date
) RETURNS TABLE (daily_limit integer, source text, ends_on date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN QUERY
  SELECT o.daily_limit, 'override'::text, o.ends_on
  FROM public.practice_limit_overrides o
  WHERE o.user_id = p_user_id AND o.module = p_module
    AND (o.ends_on IS NULL OR o.ends_on >= p_today);
  IF FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT r.daily_limit, 'role'::text, NULL::date
  FROM public.practice_limit_rules r
  JOIN public.profiles p ON lower(trim(p.role)) = r.role
  WHERE p.id = p_user_id AND r.module = p_module;
  IF FOUND THEN RETURN; END IF;

  -- Fail closed for a role without a rule.
  RETURN QUERY SELECT 0, 'role'::text, NULL::date;
END;
$$;

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
  v_limit integer;
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

  SELECT l.daily_limit INTO v_limit
  FROM public.resolve_practice_limit(p_user_id, p_module, v_today) l;

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

-- One row per module: the limit in force today, how many starts were counted
-- and when the count restarts.
CREATE OR REPLACE FUNCTION public.practice_quota_status(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH day AS (
    SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS today
  )
  SELECT jsonb_agg(jsonb_build_object(
    'module', m.module,
    'limit', l.daily_limit,
    'used', (
      SELECT count(*) FROM public.practice_usage u
      WHERE u.user_id = p_user_id AND u.module = m.module
        AND u.usage_date = day.today AND u.refunded_at IS NULL
    ),
    'source', l.source,
    'ends_on', l.ends_on,
    'resets_at', ((day.today + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
  ) ORDER BY m.ord)
  FROM day,
    (VALUES ('ketik', 1), ('pdkt', 2), ('telefun', 3)) AS m(module, ord),
    LATERAL public.resolve_practice_limit(p_user_id, m.module, day.today) l;
$$;

REVOKE ALL ON FUNCTION public.resolve_practice_limit(uuid, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.practice_quota_status(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_practice_quota(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_practice_limit(uuid, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.practice_quota_status(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_practice_quota(uuid, text, text) TO service_role;
