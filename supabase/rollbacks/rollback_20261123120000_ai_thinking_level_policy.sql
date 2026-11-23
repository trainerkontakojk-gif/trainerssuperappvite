-- DATA LOSS: drops all configured thinking levels and their audit history.
-- Revert API/web code first, then apply only to a disposable or approved target.

DROP FUNCTION IF EXISTS public.ai_thinking_policy_reset(text, text, uuid);
DROP FUNCTION IF EXISTS public.ai_thinking_policy_set(text, text, text, uuid);
DROP TABLE IF EXISTS public.ai_thinking_policy_audit;
DROP TABLE IF EXISTS public.ai_thinking_policy;

NOTIFY pgrst, 'reload schema';

SELECT
  to_regclass('public.ai_thinking_policy') IS NULL
    AND to_regclass('public.ai_thinking_policy_audit') IS NULL AS rollback_verified;
