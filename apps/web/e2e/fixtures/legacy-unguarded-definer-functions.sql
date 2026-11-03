-- Production-only legacy functions, verbatim from the read-only production
-- readback of 2026-11-03 (pg_get_functiondef on ruosnjmtywcrghjgqugz). No repo
-- migration creates them; function-move-legacy-definer-api.spec.ts installs
-- them inside a rolled-back transaction to replay
-- 20261103100000_move_legacy_unguarded_definer_functions.sql against the
-- production shape. Plain SQL with no transaction control.

CREATE OR REPLACE FUNCTION public.consume_rate_limit(p_key text, p_limit integer, p_window_ms integer)
 RETURNS TABLE(allowed boolean, remaining integer, retry_after_seconds integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_now timestamptz := now();
  v_window_interval interval := (p_window_ms || ' milliseconds')::interval;
  v_record record;
BEGIN
  -- Use explicit schema prefix since search_path is empty
  INSERT INTO public.security_rate_limits (key, count, window_start, updated_at)
  VALUES (p_key, 1, v_now, v_now)
  ON CONFLICT (key) DO UPDATE
  SET 
    count = CASE 
      WHEN public.security_rate_limits.window_start < (v_now - v_window_interval) THEN 1
      ELSE public.security_rate_limits.count + 1
    END,
    window_start = CASE
      WHEN public.security_rate_limits.window_start < (v_now - v_window_interval) THEN v_now
      ELSE public.security_rate_limits.window_start
    END,
    updated_at = v_now
  RETURNING * INTO v_record;

  IF v_record.count > p_limit THEN
    RETURN QUERY SELECT
      false,
      0,
      ceil(extract(epoch from (v_record.window_start + v_window_interval - v_now)))::integer;
  ELSE
    RETURN QUERY SELECT
      true,
      p_limit - v_record.count,
      ceil(extract(epoch from (v_record.window_start + v_window_interval - v_now)))::integer;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_service_trend_dashboard(p_period_ids uuid[])
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  final_result json;
BEGIN
  WITH period_list AS (
    SELECT 
      id, 
      month, 
      year, 
      to_char(make_date(year, month, 1), 'Mon YY') as label
    FROM public.qa_periods
    WHERE id = ANY(p_period_ids)
    ORDER BY year ASC, month ASC
  ),
  temuan_data AS (
    SELECT 
      t.period_id, 
      t.service_type, 
      t.peserta_id,
      pl.year as p_year,
      pl.month as p_month
    FROM public.qa_temuan t
    JOIN period_list pl ON t.period_id = pl.id
    -- Removed WHERE t.tahun = p_year to support cross-year data via period_id filter
  ),
  service_types AS (
    SELECT DISTINCT service_type 
    FROM temuan_data 
    WHERE service_type IS NOT NULL
  ),
  monthly_counts AS (
    SELECT 
      pl.id as p_id,
      pl.label,
      pl.year as p_y,
      pl.month as p_m,
      s.service_type,
      count(t.period_id) as f_count,
      count(DISTINCT t.peserta_id) as a_count
    FROM period_list pl
    CROSS JOIN service_types s
    LEFT JOIN temuan_data t ON t.period_id = pl.id AND t.service_type = s.service_type
    GROUP BY pl.id, pl.label, pl.year, pl.month, s.service_type
  ),
  period_stats_agg AS (
    SELECT 
      p_id,
      label,
      p_y,
      p_m,
      sum(f_count) as total_defects,
      (SELECT count(DISTINCT t2.peserta_id) FROM temuan_data t2 WHERE t2.period_id = p_id) as audited_agents,
      jsonb_object_agg(service_type, jsonb_build_object('totalDefects', f_count, 'auditedAgents', a_count)) as service_stats
    FROM monthly_counts
    GROUP BY p_id, label, p_y, p_m
  ),
  service_data_agg AS (
    SELECT 
      service_type,
      json_agg(f_count ORDER BY p_y, p_m) as counts
    FROM monthly_counts
    GROUP BY service_type
  ),
  total_data_agg AS (
    SELECT 
      json_agg(total_defects ORDER BY p_y, p_m) as totals
    FROM period_stats_agg
  ),
  service_summary_agg AS (
    SELECT 
      s.service_type,
      json_build_object(
        'totalDefects', sum(mc.f_count),
        'auditedAgents', (SELECT count(DISTINCT t.peserta_id) FROM temuan_data t WHERE t.service_type = s.service_type)
      ) as summary
    FROM service_types s
    JOIN monthly_counts mc ON mc.service_type = s.service_type
    GROUP BY s.service_type
  ),
  total_summary_agg AS (
    SELECT 
      json_build_object(
        'totalDefects', count(*),
        'auditedAgents', count(DISTINCT peserta_id),
        'activeServiceCount', count(DISTINCT service_type)
      ) as summary
    FROM temuan_data
  )
  SELECT json_build_object(
    'labels', COALESCE((SELECT json_agg(label ORDER BY p_y, p_m) FROM period_stats_agg), '[]'::json),
    'totalData', COALESCE((SELECT totals FROM total_data_agg), '[]'::json),
    'serviceData', COALESCE((SELECT jsonb_object_agg(service_type, counts) FROM service_data_agg), '{}'::jsonb),
    'activeServices', COALESCE((SELECT json_agg(service_type) FROM service_types), '[]'::json),
    'serviceSummary', COALESCE((SELECT jsonb_object_agg(service_type, summary) FROM service_summary_agg), '{}'::jsonb),
    'totalSummary', (SELECT summary FROM total_summary_agg),
    'periodStats', COALESCE((SELECT json_agg(json_build_object('id', p_id, 'label', label, 'totalDefects', total_defects, 'auditedAgents', audited_agents, 'serviceStats', service_stats) ORDER BY p_y, p_m) FROM period_stats_agg), '[]'::json)
  ) INTO final_result;

  RETURN final_result;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text,integer,integer),
  public.get_service_trend_dashboard(uuid[]) TO anon, authenticated, service_role;
