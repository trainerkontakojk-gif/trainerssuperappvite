-- Idempotently create/repair mv_qa_period_summary and refresh_mv_qa_period_summary()
-- This migration is compatible with existing 011_materialized_view_dashboard.sql
-- and 013_refresh_mv_function.sql.

-- Drop and recreate the materialized view to ensure clean schema
DROP MATERIALIZED VIEW IF EXISTS public.mv_qa_period_summary CASCADE;

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_qa_period_summary AS
SELECT
  qt.period_id,
  qt.service_type,
  COUNT(DISTINCT qt.peserta_id) AS total_agents,
  COUNT(*) FILTER (WHERE qt.nilai < 3 OR qt.ketidaksesuaian IS NOT NULL) AS total_defects,
  CASE
    WHEN COUNT(DISTINCT qt.peserta_id) = 0 THEN 0
    ELSE ROUND(
      COUNT(*) FILTER (WHERE qt.nilai < 3 OR qt.ketidaksesuaian IS NOT NULL)::numeric
      / COUNT(DISTINCT qt.peserta_id),
      2
    )
  END AS avg_defects_per_audit,
  CASE
    WHEN COUNT(DISTINCT qt.peserta_id) = 0 THEN 0
    ELSE ROUND(
      COUNT(DISTINCT qt.peserta_id) FILTER (
        WHERE qt.peserta_id NOT IN (
          SELECT qt2.peserta_id
          FROM public.qa_temuan qt2
          WHERE qt2.period_id = qt.period_id
            AND qt2.service_type = qt.service_type
            AND (qt2.nilai < 3 OR qt2.ketidaksesuaian IS NOT NULL)
        )
      )::numeric / COUNT(DISTINCT qt.peserta_id),
      8
    )
  END AS zero_error_rate,
  ROUND(AVG(qt.nilai)::numeric, 4) AS avg_agent_score,
  CASE
    WHEN COUNT(DISTINCT qt.peserta_id) = 0 THEN 0
    ELSE ROUND(
      COUNT(DISTINCT qt.peserta_id) FILTER (
        WHERE qt.peserta_id IN (
          SELECT qt3.peserta_id
          FROM public.qa_temuan qt3
          WHERE qt3.period_id = qt.period_id
            AND qt3.service_type = qt.service_type
          GROUP BY qt3.peserta_id
          HAVING AVG(qt3.nilai) >= 2.85
        )
      )::numeric / COUNT(DISTINCT qt.peserta_id),
      8
    )
  END AS compliance_rate,
  COUNT(DISTINCT qt.peserta_id) FILTER (
    WHERE qt.peserta_id IN (
      SELECT qt4.peserta_id
      FROM public.qa_temuan qt4
      WHERE qt4.period_id = qt.period_id
        AND qt4.service_type = qt.service_type
      GROUP BY qt4.peserta_id
      HAVING AVG(qt4.nilai) >= 2.85
    )
  ) AS compliance_count
FROM public.qa_temuan qt
JOIN public.profiler_peserta pp ON pp.id = qt.peserta_id
WHERE (qt.is_phantom_padding IS NULL OR qt.is_phantom_padding = false)
GROUP BY qt.period_id, qt.service_type;

-- B-tree indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_mv_qa_period_summary_period_id
  ON public.mv_qa_period_summary (period_id);

CREATE INDEX IF NOT EXISTS idx_mv_qa_period_summary_service_type
  ON public.mv_qa_period_summary (service_type);

-- Unique index required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_qa_period_summary_unique
  ON public.mv_qa_period_summary (period_id, service_type);

-- Refresh function with search_path safety
CREATE OR REPLACE FUNCTION public.refresh_mv_qa_period_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_qa_period_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary()
TO authenticated, service_role;

-- Grant read access on MV
GRANT SELECT ON public.mv_qa_period_summary TO authenticated, service_role;
