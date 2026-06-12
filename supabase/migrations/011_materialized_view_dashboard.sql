-- Materialized View for Dashboard Aggregates
-- Pre-computes period-level summary metrics for the SIDAK QA dashboard.
-- Replaces the manually-refreshed qa_dashboard_period_summary cache pattern.
-- Supports REFRESH MATERIALIZED VIEW CONCURRENTLY via unique index.

CREATE MATERIALIZED VIEW IF NOT EXISTS mv_qa_period_summary AS
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
      4
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
      4
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
      4
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
GROUP BY qt.period_id, qt.service_type;

-- B-tree indexes for fast lookups on period_id and service_type
CREATE INDEX IF NOT EXISTS idx_mv_qa_period_summary_period_id
  ON mv_qa_period_summary (period_id);

CREATE INDEX IF NOT EXISTS idx_mv_qa_period_summary_service_type
  ON mv_qa_period_summary (service_type);

-- Unique index on (period_id, service_type) required for REFRESH MATERIALIZED VIEW CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_qa_period_summary_unique
  ON mv_qa_period_summary (period_id, service_type);
