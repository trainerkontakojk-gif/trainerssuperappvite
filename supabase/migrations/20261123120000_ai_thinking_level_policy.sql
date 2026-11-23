-- Gemini thinking-level policy per AI use case (Monitoring -> Model).
-- Backend only: service_role access, with no anon/authenticated table or RPC access.

CREATE TABLE public.ai_thinking_policy (
  scope text PRIMARY KEY CHECK (scope IN (
    'ketik_reply', 'ketik_review', 'pdkt_reply', 'pdkt_evaluation',
    'telefun_transcription', 'telefun_assessment', 'telefun_coaching',
    'sidak_forecast'
  )),
  thinking_level text CHECK (thinking_level IS NULL OR thinking_level IN (
    'MINIMAL', 'LOW', 'MEDIUM', 'HIGH'
  )),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ai_thinking_policy_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN (
    'ketik_reply', 'ketik_review', 'pdkt_reply', 'pdkt_evaluation',
    'telefun_transcription', 'telefun_assessment', 'telefun_coaching',
    'sidak_forecast'
  )),
  old_thinking_level text CHECK (old_thinking_level IS NULL OR old_thinking_level IN (
    'MINIMAL', 'LOW', 'MEDIUM', 'HIGH'
  )),
  new_thinking_level text CHECK (new_thinking_level IS NULL OR new_thinking_level IN (
    'MINIMAL', 'LOW', 'MEDIUM', 'HIGH'
  )),
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_thinking_policy ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_thinking_policy FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_thinking_policy TO service_role;

ALTER TABLE public.ai_thinking_policy_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_thinking_policy_audit FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_thinking_policy_audit TO service_role;

CREATE OR REPLACE FUNCTION public.ai_thinking_policy_set(
  p_scope text,
  p_thinking_level text,
  p_code_default text,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_old_thinking_level text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai_thinking_policy:' || p_scope, 0)
  );

  SELECT thinking_level INTO v_old_thinking_level
  FROM public.ai_thinking_policy
  WHERE scope = p_scope;
  IF NOT FOUND THEN
    v_old_thinking_level := p_code_default;
  END IF;

  INSERT INTO public.ai_thinking_policy(scope, thinking_level, updated_by, updated_at)
  VALUES (p_scope, p_thinking_level, p_actor, pg_catalog.now())
  ON CONFLICT (scope) DO UPDATE SET
    thinking_level = EXCLUDED.thinking_level,
    updated_by = EXCLUDED.updated_by,
    updated_at = EXCLUDED.updated_at;

  INSERT INTO public.ai_thinking_policy_audit(
    scope, old_thinking_level, new_thinking_level, changed_by, changed_at
  ) VALUES (p_scope, v_old_thinking_level, p_thinking_level, p_actor, pg_catalog.now());
END;
$$;

CREATE OR REPLACE FUNCTION public.ai_thinking_policy_reset(
  p_scope text,
  p_code_default text,
  p_actor uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_old_thinking_level text;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('ai_thinking_policy:' || p_scope, 0)
  );

  DELETE FROM public.ai_thinking_policy
  WHERE scope = p_scope
  RETURNING thinking_level INTO v_old_thinking_level;
  IF NOT FOUND THEN
    v_old_thinking_level := p_code_default;
  END IF;

  INSERT INTO public.ai_thinking_policy_audit(
    scope, old_thinking_level, new_thinking_level, changed_by, changed_at
  ) VALUES (p_scope, v_old_thinking_level, p_code_default, p_actor, pg_catalog.now());
END;
$$;

REVOKE ALL ON FUNCTION public.ai_thinking_policy_set(text, text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_thinking_policy_set(text, text, text, uuid)
  TO service_role;
REVOKE ALL ON FUNCTION public.ai_thinking_policy_reset(text, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ai_thinking_policy_reset(text, text, uuid)
  TO service_role;

NOTIFY pgrst, 'reload schema';
