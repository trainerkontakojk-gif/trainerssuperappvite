-- Revert API first: removes atomic reset support. Policy and audit rows remain.
DROP FUNCTION IF EXISTS public.ai_model_policy_reset(text,text,uuid);
CREATE OR REPLACE FUNCTION public.ai_model_policy_set(
  p_task text,
  p_model_id text,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_old_model_id text;
BEGIN
  SELECT model_id INTO v_old_model_id
  FROM public.ai_model_policy
  WHERE task = p_task;

  INSERT INTO public.ai_model_policy (task, model_id, updated_by, updated_at)
  VALUES (p_task, p_model_id, p_actor, now())
  ON CONFLICT (task)
  DO UPDATE SET
    model_id = EXCLUDED.model_id,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.ai_model_policy_audit (task, old_model_id, new_model_id, changed_by, changed_at)
  VALUES (p_task, v_old_model_id, p_model_id, p_actor, now());
END;
$$;

REVOKE ALL ON FUNCTION public.ai_model_policy_set(text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_model_policy_set(text, text, uuid) TO service_role;

NOTIFY pgrst, 'reload schema';
