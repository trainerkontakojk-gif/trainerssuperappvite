-- Serialize policy writes so audit old values remain correct under concurrency.
CREATE OR REPLACE FUNCTION public.ai_model_policy_set(p_task text, p_model_id text, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_old_model_id text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_model_policy:' || p_task, 0));
  SELECT model_id INTO v_old_model_id FROM public.ai_model_policy WHERE task = p_task;
  INSERT INTO public.ai_model_policy(task, model_id, updated_by, updated_at)
  VALUES(p_task, p_model_id, p_actor, now())
  ON CONFLICT(task) DO UPDATE SET model_id=EXCLUDED.model_id, updated_by=EXCLUDED.updated_by, updated_at=EXCLUDED.updated_at;
  INSERT INTO public.ai_model_policy_audit(task, old_model_id, new_model_id, changed_by)
  VALUES(p_task, v_old_model_id, p_model_id, p_actor);
END;
$$;
CREATE OR REPLACE FUNCTION public.ai_model_policy_reset(p_task text, p_default_model_id text, p_actor uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_old_model_id text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai_model_policy:' || p_task, 0));
  DELETE FROM public.ai_model_policy WHERE task=p_task RETURNING model_id INTO v_old_model_id;
  INSERT INTO public.ai_model_policy_audit(task, old_model_id, new_model_id, changed_by)
  VALUES(p_task, v_old_model_id, p_default_model_id, p_actor);
END;
$$;
REVOKE ALL ON FUNCTION public.ai_model_policy_set(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_model_policy_set(text,text,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.ai_model_policy_reset(text,text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ai_model_policy_reset(text,text,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
