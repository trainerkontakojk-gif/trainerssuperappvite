-- Rollback for 20260526090000_reharden_mv_qa_period_summary_after_contract_restore.sql
--
-- Restores the GRANT state from 20260525000200_restore_mv_qa_period_summary_contract.sql
-- (authenticated + service_role for SELECT and EXECUTE).
--
-- WARNING: This rollback re-opens mv_qa_period_summary to `authenticated` role.
--          Only run this if the re-hardening migration causes a regression.

-- Restore SELECT to authenticated + service_role (original restore state)
GRANT SELECT ON public.mv_qa_period_summary TO authenticated, service_role;

-- Restore EXECUTE on refresh function to authenticated + service_role
GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary()
TO authenticated, service_role;
