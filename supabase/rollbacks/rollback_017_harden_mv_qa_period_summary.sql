-- Rollback for 017_harden_mv_qa_period_summary.sql
-- Restores the state immediately before 017:
--   - 011 created the MV without application-role grants.
--   - 013 created the refresh function with PostgreSQL's default PUBLIC EXECUTE.
--
-- WARNING: This rollback re-opens the refresh function to PUBLIC.
--          Only run this if 017 causes a regression.

-- Remove the SELECT grant introduced by 017.
REVOKE SELECT ON public.mv_qa_period_summary FROM service_role;

-- Remove direct application-role grants, then restore the pre-017 default.
REVOKE EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary()
FROM authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() TO PUBLIC;
