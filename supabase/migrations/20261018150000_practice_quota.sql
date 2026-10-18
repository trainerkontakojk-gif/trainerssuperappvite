-- Daily practice limits for KETIK, PDKT and Telefun, counted on the server.
-- Plan: plans/markdown/kontrol-user-fase-2.md.
--
-- One day is the Asia/Jakarta calendar date. Every counted start is one row in
-- practice_usage keyed by the request that caused it, so a retry of the same
-- request is never counted twice and a failed start can be given back.

CREATE TABLE IF NOT EXISTS public.practice_limit_rules (
  module text NOT NULL CHECK (module IN ('ketik', 'pdkt', 'telefun')),
  role text NOT NULL CHECK (role IN ('admin', 'trainer', 'leader', 'agent')),
  -- NULL = unlimited, 0 = cannot start.
  daily_limit integer CHECK (daily_limit IS NULL OR daily_limit >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (module, role)
);

INSERT INTO public.practice_limit_rules (module, role, daily_limit)
VALUES
  ('ketik', 'agent', 3), ('ketik', 'leader', 3),
  ('ketik', 'trainer', NULL), ('ketik', 'admin', NULL),
  ('pdkt', 'agent', 3), ('pdkt', 'leader', 3),
  ('pdkt', 'trainer', NULL), ('pdkt', 'admin', NULL),
  ('telefun', 'agent', 0), ('telefun', 'leader', 0),
  ('telefun', 'trainer', NULL), ('telefun', 'admin', NULL)
ON CONFLICT (module, role) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.practice_limit_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('ketik', 'pdkt', 'telefun')),
  daily_limit integer CHECK (daily_limit IS NULL OR daily_limit >= 0),
  -- Last WIB date the override applies; NULL = until removed.
  ends_on date,
  note text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

CREATE TABLE IF NOT EXISTS public.practice_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('ketik', 'pdkt', 'telefun')),
  usage_date date NOT NULL,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 1 AND 200),
  created_at timestamptz NOT NULL DEFAULT now(),
  refunded_at timestamptz,
  UNIQUE (user_id, module, request_key)
);

CREATE INDEX IF NOT EXISTS practice_usage_counted_idx
  ON public.practice_usage (user_id, module, usage_date)
  WHERE refunded_at IS NULL;

-- Backend-only: no browser policies, no browser privileges.
ALTER TABLE public.practice_limit_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_limit_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.practice_usage ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.practice_limit_rules FROM anon, authenticated;
REVOKE ALL ON public.practice_limit_overrides FROM anon, authenticated;
REVOKE ALL ON public.practice_usage FROM anon, authenticated;
GRANT ALL ON public.practice_limit_rules TO service_role;
GRANT ALL ON public.practice_limit_overrides TO service_role;
GRANT ALL ON public.practice_usage TO service_role;

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

CREATE OR REPLACE FUNCTION public.refund_practice_quota(
  p_user_id uuid,
  p_module text,
  p_request_key text
) RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH refunded AS (
    UPDATE public.practice_usage
    SET refunded_at = now()
    WHERE user_id = p_user_id AND module = p_module
      AND request_key = p_request_key AND refunded_at IS NULL
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM refunded);
$$;

REVOKE ALL ON FUNCTION public.consume_practice_quota(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_practice_quota(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_practice_quota(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_practice_quota(uuid, text, text) TO service_role;

-- Existing PDKT emails stay free to answer: record each one as already counted
-- for its creator on the WIB date it was made.
INSERT INTO public.practice_usage (user_id, module, usage_date, request_key, created_at)
SELECT m.created_by_user_id, 'pdkt',
  (m.created_at AT TIME ZONE 'Asia/Jakarta')::date,
  coalesce(m.client_request_id, 'mailbox:' || m.id::text),
  m.created_at
FROM public.pdkt_mailbox_items m
JOIN public.profiles p ON p.id = m.created_by_user_id
WHERE coalesce(m.is_shared_copy, false) = false
ON CONFLICT (user_id, module, request_key) DO NOTHING;

-- Every Telefun write goes through backend service-role code; owners keep
-- read access only, so a session cannot be forged or reopened from the browser.
DROP POLICY IF EXISTS "telefun_history_insert_own" ON public.telefun_history;
DROP POLICY IF EXISTS "telefun_history_update_own" ON public.telefun_history;
