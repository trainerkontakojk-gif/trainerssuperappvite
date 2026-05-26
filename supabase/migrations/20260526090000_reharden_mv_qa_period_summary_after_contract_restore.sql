-- 20260526090000: Re-harden mv_qa_period_summary after contract restore
--
-- Why this migration is needed:
--   017_harden_mv_qa_period_summary.sql correctly REVOKEs all from
--   anon/public/authenticated and grants SELECT/EXECUTE to service_role only.
--   However, 20260525000200_restore_mv_qa_period_summary_contract.sql runs
--   AFTER 017 (lexicographic ordering) and performs DROP CASCADE + recreate,
--   which wipes all grants. The restore then regrants to authenticated AND
--   service_role (lines 92-96), undoing 017's hardening.
--
--   This migration must appear lexicographically after ALL 20260525000xxx
--   files that touch MV contract. Its ONLY purpose is to re-apply the
--   security posture: revoke all non-service_role access and grant
--   SELECT/EXECUTE exclusively to service_role.
--
--   DO NOT edit the MV schema, indexes, function body, or data contract.
--   This file only manages GRANT/REVOKE for the MV and its refresh function.
--
-- Ref: Phase 53 (017_harden_mv_qa_period_summary.sql),
--      Phase 38 (20260525000200_restore_mv_qa_period_summary_contract.sql),
--      Phase 54 (this file)

-- 1. REVOKE all access from non-service roles on the MV
REVOKE ALL ON public.mv_qa_period_summary FROM anon, public, authenticated;

-- 2. Grant SELECT only to service_role (backend supabaseAdmin)
GRANT SELECT ON public.mv_qa_period_summary TO service_role;

-- 3. Tighten refresh function: service_role only
REVOKE EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary()
FROM authenticated, public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() TO service_role;
