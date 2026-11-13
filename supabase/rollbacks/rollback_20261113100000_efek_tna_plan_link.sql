-- Rollback for 20261113100000_efek_tna_plan_link.sql.
-- Restores the original efek_save_sessions definition from
-- 20261019160000_efek_training_sessions.sql, then removes the index and column.
BEGIN;

CREATE OR REPLACE FUNCTION public.efek_save_sessions(p_actor_id uuid, p_sessions jsonb, p_mode text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE
  s jsonb; saved_id uuid; saved_ids uuid[] := '{}'; ids uuid[]; missing integer;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  IF p_mode NOT IN ('create','merge','replace') OR jsonb_typeof(p_sessions) <> 'array'
    OR jsonb_array_length(p_sessions) NOT BETWEEN 1 AND 50
    OR (p_mode = 'replace' AND jsonb_array_length(p_sessions) <> 1) THEN
    RAISE EXCEPTION 'EFEK_INVALID_INPUT';
  END IF;
  FOR s IN SELECT value FROM jsonb_array_elements(p_sessions) LOOP
    IF jsonb_typeof(s->'peserta_ids') <> 'array' OR jsonb_array_length(s->'peserta_ids') NOT BETWEEN 1 AND 300 THEN
      RAISE EXCEPTION 'EFEK_INVALID_PARTICIPANTS';
    END IF;
    SELECT array_agg(DISTINCT value::uuid) INTO ids FROM jsonb_array_elements_text(s->'peserta_ids');
    SELECT count(*) INTO missing FROM unnest(ids) AS u(id)
      WHERE NOT EXISTS (SELECT 1 FROM public.profiler_peserta p WHERE p.id = u.id);
    IF missing > 0 THEN RAISE EXCEPTION 'EFEK_INVALID_PARTICIPANTS'; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.efek_programs WHERE code = s->>'program_code' AND is_active) THEN
      RAISE EXCEPTION 'EFEK_PROGRAM_INACTIVE';
    END IF;

    IF p_mode = 'replace' THEN
      UPDATE public.efek_sessions SET program_code = s->>'program_code', title = btrim(s->>'title'),
        service_type = s->>'service_type', start_date = (s->>'start_date')::date,
        end_date = (s->>'end_date')::date, updated_by = p_actor_id, updated_at = clock_timestamp()
      WHERE id = (s->>'id')::uuid RETURNING id INTO saved_id;
      IF saved_id IS NULL THEN RAISE EXCEPTION 'EFEK_SESSION_NOT_FOUND'; END IF;
      DELETE FROM public.efek_participants WHERE session_id = saved_id AND peserta_id <> ALL (ids);
    ELSE
      saved_id := NULL;
      IF p_mode = 'merge' THEN
        SELECT id INTO saved_id FROM public.efek_sessions
          WHERE program_code = s->>'program_code' AND lower(btrim(title)) = lower(btrim(s->>'title'))
            AND start_date = (s->>'start_date')::date;
      END IF;
      IF saved_id IS NULL THEN
        INSERT INTO public.efek_sessions(program_code, title, service_type, start_date, end_date, created_by, updated_by)
        VALUES (s->>'program_code', btrim(s->>'title'), s->>'service_type', (s->>'start_date')::date,
          (s->>'end_date')::date, p_actor_id, p_actor_id)
        RETURNING id INTO saved_id;
      ELSE
        UPDATE public.efek_sessions SET updated_by = p_actor_id, updated_at = clock_timestamp() WHERE id = saved_id;
      END IF;
    END IF;
    INSERT INTO public.efek_participants(session_id, peserta_id)
      SELECT saved_id, u.id FROM unnest(ids) AS u(id) ON CONFLICT DO NOTHING;
    saved_ids := saved_ids || saved_id;
  END LOOP;
  RETURN to_jsonb(saved_ids);
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'EFEK_SESSION_EXISTS';
  WHEN check_violation OR invalid_text_representation OR invalid_datetime_format
    OR datetime_field_overflow OR not_null_violation OR foreign_key_violation THEN
    RAISE EXCEPTION 'EFEK_INVALID_INPUT';
END;
$$;

GRANT EXECUTE ON FUNCTION public.efek_save_sessions(uuid,jsonb,text) TO anon, authenticated, service_role;

DROP INDEX IF EXISTS public.idx_efek_sessions_tna_plan;
ALTER TABLE public.efek_sessions DROP COLUMN IF EXISTS tna_plan_id;

NOTIFY pgrst, 'reload schema';
COMMIT;