-- Rollback: 20261113160000_ai_model_policy.sql
-- Drops ai_model_policy, audit table, and atomic setter RPC.

DROP FUNCTION IF EXISTS public.ai_model_policy_set(text, text, uuid);
DROP TABLE IF EXISTS public.ai_model_policy_audit;
DROP TABLE IF EXISTS public.ai_model_policy;

NOTIFY pgrst, 'reload schema';
