-- Database function to refresh the mv_qa_period_summary materialized view concurrently.
-- Called from the backend service via supabaseAdmin.rpc('refresh_mv_qa_period_summary').
-- Returns void; errors propagate to the caller.

CREATE OR REPLACE FUNCTION public.refresh_mv_qa_period_summary()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY mv_qa_period_summary;
END;
$$;
