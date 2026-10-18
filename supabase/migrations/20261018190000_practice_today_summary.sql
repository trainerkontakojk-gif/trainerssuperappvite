-- Today's practice starts for the Batas latihan page.
-- Plan: plans/markdown/kontrol-user-fase-4.md. One query so the page does not
-- resolve every person's limit in the API.

CREATE OR REPLACE FUNCTION public.practice_today_summary()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH today AS (
    SELECT (now() AT TIME ZONE 'Asia/Jakarta')::date AS d
  ),
  counted AS (
    SELECT u.user_id, u.module, count(*)::integer AS used
    FROM public.practice_usage u, today
    WHERE u.usage_date = today.d AND u.refunded_at IS NULL
    GROUP BY u.user_id, u.module
  ),
  reached AS (
    SELECT DISTINCT c.user_id
    FROM counted c, today
    CROSS JOIN LATERAL public.resolve_practice_limit(c.user_id, c.module, today.d) l
    WHERE l.daily_limit IS NOT NULL AND c.used >= l.daily_limit
  )
  SELECT jsonb_build_object(
    'started', jsonb_build_object(
      'ketik', coalesce((SELECT sum(used) FROM counted WHERE module = 'ketik'), 0),
      'pdkt', coalesce((SELECT sum(used) FROM counted WHERE module = 'pdkt'), 0),
      'telefun', coalesce((SELECT sum(used) FROM counted WHERE module = 'telefun'), 0)
    ),
    'users_at_limit', (SELECT count(*) FROM reached)
  );
$$;

REVOKE ALL ON FUNCTION public.practice_today_summary() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.practice_today_summary() TO service_role;
