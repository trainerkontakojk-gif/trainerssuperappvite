-- Replace legacy-incompatible refresh_qa_dashboard_summary_for_period
-- with target-schema-compatible implementation that uses folder_id / agent_id.

CREATE OR REPLACE FUNCTION public.refresh_qa_dashboard_summary_for_period(
  p_period_id uuid,
  p_folder_key text DEFAULT '__ALL__'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_folder_id       uuid;
  v_folder_name     text;
  v_period_rows     integer := 0;
  v_agent_rows      integer := 0;
BEGIN
  -- Resolve folder scope
  IF p_folder_key IS NOT NULL AND p_folder_key <> '__ALL__' THEN
    SELECT id, name
    INTO v_folder_id, v_folder_name
    FROM public.profiler_folders
    WHERE id::text = p_folder_key OR name = p_folder_key
    LIMIT 1;
  END IF;

  -- Delete existing summary rows for this period and folder scope
  DELETE FROM public.qa_dashboard_agent_period_summary s
  WHERE s.period_id = p_period_id
    AND (
      v_folder_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.profiler_peserta pp
        WHERE pp.id = s.agent_id AND pp.batch_name = v_folder_name
      )
    );

  DELETE FROM public.qa_dashboard_period_summary s
  WHERE s.period_id = p_period_id
    AND (v_folder_id IS NULL OR s.folder_id = v_folder_id);

  -- Per-service summary: one row per service_type with data for this period
  INSERT INTO public.qa_dashboard_period_summary (
    period_id, service_type, folder_id,
    total_agents, total_defects, avg_defects_per_audit,
    zero_error_rate, avg_agent_score, compliance_rate, compliance_count
  )
  SELECT
    p_period_id,
    svc.service_type,
    v_folder_id,
    COUNT(DISTINCT qt.peserta_id) AS total_agents,
    COUNT(*) FILTER (WHERE qt.nilai < 3 OR qt.ketidaksesuaian IS NOT NULL) AS total_defects,
    CASE WHEN COUNT(DISTINCT qt.peserta_id) = 0 THEN 0
      ELSE ROUND(
        COUNT(*) FILTER (WHERE qt.nilai < 3 OR qt.ketidaksesuaian IS NOT NULL)::numeric
        / COUNT(DISTINCT qt.peserta_id), 2
      )
    END AS avg_defects_per_audit,
    CASE WHEN COUNT(DISTINCT qt.peserta_id) = 0 THEN 0
      ELSE ROUND(
        COUNT(DISTINCT qt.peserta_id) FILTER (
          WHERE qt.peserta_id NOT IN (
            SELECT qt2.peserta_id FROM public.qa_temuan qt2
            WHERE qt2.period_id = p_period_id
              AND qt2.service_type = svc.service_type
              AND (qt2.nilai < 3 OR qt2.ketidaksesuaian IS NOT NULL)
          )
        )::numeric / COUNT(DISTINCT qt.peserta_id) * 100, 2
      )
    END AS zero_error_rate,
    CASE WHEN COUNT(DISTINCT qt.peserta_id) = 0 THEN 0
      ELSE ROUND(AVG(qt.nilai)::numeric, 2)
    END AS avg_agent_score,
    CASE WHEN COUNT(DISTINCT qt.peserta_id) = 0 THEN 0
      ELSE ROUND(
        COUNT(DISTINCT qt.peserta_id) FILTER (
          WHERE qt.peserta_id IN (
            SELECT qt3.peserta_id FROM public.qa_temuan qt3
            WHERE qt3.period_id = p_period_id
              AND qt3.service_type = svc.service_type
            GROUP BY qt3.peserta_id
            HAVING AVG(qt3.nilai) >= 2.85
          )
        )::numeric / COUNT(DISTINCT qt.peserta_id) * 100, 2
      )
    END AS compliance_rate,
    COUNT(DISTINCT qt.peserta_id) FILTER (
      WHERE qt.peserta_id IN (
        SELECT qt3.peserta_id FROM public.qa_temuan qt3
        WHERE qt3.period_id = p_period_id
          AND qt3.service_type = svc.service_type
        GROUP BY qt3.peserta_id
        HAVING AVG(qt3.nilai) >= 2.85
      )
    ) AS compliance_count
  FROM public.qa_temuan qt
  JOIN public.profiler_peserta pp ON pp.id = qt.peserta_id
  CROSS JOIN (SELECT DISTINCT service_type FROM public.qa_temuan WHERE period_id = p_period_id) svc
  WHERE qt.period_id = p_period_id
    AND qt.service_type = svc.service_type
    AND (qt.is_phantom_padding IS NULL OR qt.is_phantom_padding = false)
    AND (v_folder_id IS NULL OR pp.batch_name = v_folder_name)
  GROUP BY svc.service_type;

  GET DIAGNOSTICS v_period_rows = ROW_COUNT;

  -- Per-agent summary: one row per agent/period/service
  INSERT INTO public.qa_dashboard_agent_period_summary (
    agent_id, period_id, service_type,
    final_score, non_critical_score, critical_score,
    session_count, findings_count
  )
  SELECT
    qt.peserta_id AS agent_id,
    qt.period_id,
    qt.service_type,
    0 AS final_score,
    0 AS non_critical_score,
    0 AS critical_score,
    COUNT(DISTINCT qt.no_tiket) FILTER (WHERE qt.no_tiket IS NOT NULL) AS session_count,
    COUNT(*) FILTER (WHERE qt.nilai < 3 OR qt.ketidaksesuaian IS NOT NULL) AS findings_count
  FROM public.qa_temuan qt
  JOIN public.profiler_peserta pp ON pp.id = qt.peserta_id
  WHERE qt.period_id = p_period_id
    AND (qt.is_phantom_padding IS NULL OR qt.is_phantom_padding = false)
    AND (v_folder_id IS NULL OR pp.batch_name = v_folder_name)
  GROUP BY qt.peserta_id, qt.period_id, qt.service_type;

  GET DIAGNOSTICS v_agent_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'period_id', p_period_id,
    'folder_id', v_folder_id,
    'folder_key', p_folder_key,
    'period_rows', v_period_rows,
    'agent_rows', v_agent_rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_qa_dashboard_summary_for_period(uuid, text)
TO authenticated, service_role;
