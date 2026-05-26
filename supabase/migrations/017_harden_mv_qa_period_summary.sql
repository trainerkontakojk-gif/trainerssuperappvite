-- 017: Harden mv_qa_period_summary — REVOKE public/anon/authenticated, retain service_role only
--
-- Context:
--   mv_qa_period_summary is a materialized view that aggregates SIDAK QA KPI
--   data per period. PostgreSQL does NOT support RLS on materialized views,
--   so all access control must be via GRANT/REVOKE.
--
-- Problem:
--   Migration 20260525000200 granted SELECT to both `authenticated` and
--   `service_role`, and never explicitly revoked from `anon` / `public`.
--   All other SIDAK tables have `REVOKE ALL FROM anon, public` (001_sidak_core.sql L361-372).
--   The fallback table `qa_dashboard_period_summary` is already restricted
--   to admin/trainer via RLS in 015_tighten_sidak_rls.sql.
--   Backend always uses supabaseAdmin (service_role), so authenticated
--   direct access is unnecessary.
--
-- Fix:
--   REVOKE all from anon, public, and authenticated.
--   GRANT SELECT only to service_role.
--   Tighten refresh function to service_role only.
--
-- Ref: AGENTS.md Phase 53, 015_tighten_sidak_rls.sql pattern

-- 1. REVOKE all access from non-service roles on the MV
REVOKE ALL ON public.mv_qa_period_summary FROM anon, public, authenticated;

-- 2. Grant SELECT only to service_role (backend supabaseAdmin)
GRANT SELECT ON public.mv_qa_period_summary TO service_role;

-- 3. Tighten refresh function: service_role only
-- The function is SECURITY DEFINER and called from backend via supabaseAdmin.rpc()
REVOKE EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() FROM authenticated, public, anon;
GRANT EXECUTE ON FUNCTION public.refresh_mv_qa_period_summary() TO service_role;
