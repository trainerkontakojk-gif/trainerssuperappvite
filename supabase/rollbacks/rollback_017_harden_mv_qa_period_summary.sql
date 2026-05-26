-- Rollback for 017_harden_mv_qa_period_summary.sql
-- Restores the GRANT state from 20260525000200_restore_mv_qa_period_summary_contract.sql
--
-- WARNING: This rollback re-opens mv_qa_period_summary to `authenticated` role.
--          Only run this if 017 causes a regression.

-- Restore SELECT to authenticated + service_role (original state)
GRANT SELECT ON public.mv_qa_period_summary TO authenticated, service_role;

-- Restore EXECUTE on refresh function to authenticated + service_role
GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() TO authenticated, service_role;
