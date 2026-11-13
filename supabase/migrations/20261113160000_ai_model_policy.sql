-- AI Model Policy per Task (Monitoring -> Model)
-- Backend only: RLS on with no policies, REVOKE from PUBLIC, anon, authenticated.
-- Only service_role can access.

CREATE TABLE IF NOT EXISTS public.ai_model_policy (
  task text PRIMARY KEY,
  model_id text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ai_model_policy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task text NOT NULL,
  old_model_id text,
  new_model_id text NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_model_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_model_policy FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_model_policy TO service_role;

ALTER TABLE public.ai_model_policy_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_model_policy_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_model_policy_audit TO service_role;

-- Atomic RPC to set policy and log audit row
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
