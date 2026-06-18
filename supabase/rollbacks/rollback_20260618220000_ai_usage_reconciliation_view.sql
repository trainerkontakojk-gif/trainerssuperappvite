-- Rollback migration 20260618220000: Drop AI usage reconciliation view.

DROP VIEW IF EXISTS public.v_ai_usage_recomputed_costs;

-- Verification:
-- SELECT to_regclass('public.v_ai_usage_recomputed_costs') IS NULL AS dropped;
