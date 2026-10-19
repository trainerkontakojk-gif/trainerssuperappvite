-- EFEK phase 1: training sessions and their participants (plans/markdown/efek.md).
--
-- Clients only read efek_* tables (admin/trainer via RLS). Every mutation goes
-- through two public functions guarded in-function by tna_internal helpers:
-- service_role JWT plus an active admin/trainer actor. Like TNA, never REVOKE
-- EXECUTE on these entry points (supabase/postgres signal 11, see TNA phase 1).
BEGIN;

CREATE TABLE public.efek_programs (
  code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_-]{1,31}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 60),
  default_service_type text NOT NULL
    CHECK (default_service_type IN ('call','chat','email','cso','pencatatan','bko','slik')),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.efek_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program_code text NOT NULL REFERENCES public.efek_programs(code) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 3 AND 160),
  service_type text NOT NULL
    CHECK (service_type IN ('call','chat','email','cso','pencatatan','bko','slik')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT efek_session_dates CHECK (end_date >= start_date AND end_date - start_date <= 92)
);
CREATE UNIQUE INDEX uq_efek_sessions_program_title_start
  ON public.efek_sessions(program_code, lower(btrim(title)), start_date);
CREATE INDEX idx_efek_sessions_start ON public.efek_sessions(start_date DESC);

CREATE TABLE public.efek_participants (
  session_id uuid NOT NULL REFERENCES public.efek_sessions(id) ON DELETE CASCADE,
  peserta_id uuid NOT NULL REFERENCES public.profiler_peserta(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (session_id, peserta_id)
);
CREATE INDEX idx_efek_participants_peserta ON public.efek_participants(peserta_id);

ALTER TABLE public.efek_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.efek_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.efek_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.efek_programs, public.efek_sessions, public.efek_participants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.efek_programs, public.efek_sessions, public.efek_participants TO authenticated;
GRANT ALL ON public.efek_programs, public.efek_sessions, public.efek_participants TO service_role;
CREATE POLICY efek_programs_read ON public.efek_programs FOR SELECT TO authenticated USING (public.is_admin_or_trainer());
CREATE POLICY efek_sessions_read ON public.efek_sessions FOR SELECT TO authenticated USING (public.is_admin_or_trainer());
CREATE POLICY efek_participants_read ON public.efek_participants FOR SELECT TO authenticated USING (public.is_admin_or_trainer());

INSERT INTO public.efek_programs(code, name, default_service_type, sort_order) VALUES
  ('ketik', 'KETIK', 'chat', 1),
  ('pdkt', 'PDKT', 'email', 2),
  ('telefun', 'Telefun', 'call', 3),
  ('ceriwis', 'CERIWIS', 'cso', 4);

-- p_sessions: [{id?, program_code, title, service_type, start_date, end_date, peserta_ids: uuid[]}]
-- p_mode: 'create' (one or more new sessions), 'merge' (import: an existing session with the
-- same program + title + start date gains the participants), 'replace' (edit the session `id`).
CREATE FUNCTION public.efek_save_sessions(p_actor_id uuid, p_sessions jsonb, p_mode text) RETURNS jsonb
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

CREATE FUNCTION public.efek_delete_session(p_actor_id uuid, p_session_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  DELETE FROM public.efek_sessions WHERE id = p_session_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'EFEK_SESSION_NOT_FOUND'; END IF;
END;
$$;

-- Explicit grant so the in-function guard, not the crashing ACL path, rejects client roles.
GRANT EXECUTE ON FUNCTION public.efek_save_sessions(uuid,jsonb,text), public.efek_delete_session(uuid,uuid)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
