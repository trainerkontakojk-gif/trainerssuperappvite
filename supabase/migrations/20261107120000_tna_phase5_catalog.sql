-- Migration: tna_phase5_catalog
-- Lane D. Plan: plans/markdown/tna-phase-5.md rev. 2 (D24, K32-K35, P-1, P-3);
-- T0 report plans/markdown/tna-phase-5-t0-report.md.
--
-- Program catalog writers (create, update, activate/deactivate; never delete)
-- and a frozen program snapshot on each plan at draft -> aktif. The snapshot is
-- filled by its own trigger, so tna_activate_plan and guard_plan keep their
-- phase 2 bodies unchanged and no existing function is replaced.
--
-- Public mutators keep PostgreSQL's default EXECUTE path and reject callers in
-- their first statement (tna_internal.assert_service_role()). Never REVOKE
-- EXECUTE on public TNA entry points: the local Supabase Postgres 17.6.1.x
-- image crashes when PostgREST calls a function whose EXECUTE was revoked
-- (plans/markdown/tna-postgres-crash-investigation.md, phase 1 K6).
BEGIN;

ALTER TABLE public.tna_programs
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN created_by uuid REFERENCES auth.users(id),
  ADD COLUMN updated_by uuid REFERENCES auth.users(id),
  ADD CONSTRAINT tna_programs_suggested_modules_check
    CHECK (suggested_modules <@ ARRAY['ketik','pdkt','telefun']::text[]);

ALTER TABLE public.tna_plans ADD COLUMN program_snapshot jsonb;

-- code, id, and creation fields never change; every update moves the
-- revision monotonically (same clock rule as tna_plans).
CREATE FUNCTION tna_internal.guard_program() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.code IS DISTINCT FROM OLD.code THEN RAISE EXCEPTION 'TNA_PROGRAM_CODE_IMMUTABLE'; END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.created_at IS DISTINCT FROM OLD.created_at
    OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'TNA_PROGRAM_IDENTITY_IMMUTABLE';
  END IF;
  NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END;
$$;
CREATE TRIGGER tna_program_guard BEFORE UPDATE ON public.tna_programs
FOR EACH ROW EXECUTE FUNCTION tna_internal.guard_program();

-- K34/P-3: the snapshot is server-owned. NULL until draft -> aktif, filled from
-- the program row in that same UPDATE, then immutable for every role.
CREATE FUNCTION tna_internal.guard_program_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.program_snapshot IS NOT NULL THEN RAISE EXCEPTION 'TNA_PROGRAM_SNAPSHOT_IMMUTABLE'; END IF;
    RETURN NEW;
  END IF;
  IF OLD.status='draft' AND NEW.status='aktif' THEN
    SELECT jsonb_build_object('code',p.code,'name',p.name,'gap_type',p.gap_type)
      INTO NEW.program_snapshot FROM public.tna_programs p WHERE p.id=NEW.program_id;
  ELSIF NEW.program_snapshot IS DISTINCT FROM OLD.program_snapshot THEN
    RAISE EXCEPTION 'TNA_PROGRAM_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER tna_plan_program_snapshot BEFORE INSERT OR UPDATE ON public.tna_plans
FOR EACH ROW EXECUTE FUNCTION tna_internal.guard_program_snapshot();

-- Unique, non-blank strings, at most p_max of them.
CREATE FUNCTION tna_internal.valid_text_array(p jsonb, p_max integer) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT jsonb_typeof(p)='array' AND jsonb_array_length(p) <= p_max
    AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p) e
      WHERE jsonb_typeof(e) IS DISTINCT FROM 'string' OR btrim(e #>> '{}')='')
    AND (SELECT count(DISTINCT e #>> '{}') FROM jsonb_array_elements(p) e)=jsonb_array_length(p);
$$;

CREATE FUNCTION tna_internal.text_array(p jsonb) RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(array_agg(e ORDER BY ord), '{}') FROM jsonb_array_elements_text(p) WITH ORDINALITY AS t(e, ord);
$$;

-- K33/K35: create needs exactly the seven catalog fields; update needs a
-- non-empty subset without code. Cluster and service ids are checked against
-- the code registries in the API; the database checks shape and modules.
CREATE FUNCTION tna_internal.validate_program(p jsonb, p_create boolean) RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path = public, tna_internal AS $$
DECLARE
  fields text[] := ARRAY['description','gap_type','name','service_types','suggested_modules','trigger_clusters'];
  keys text[];
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'TNA_INVALID_PROGRAM'; END IF;
  SELECT coalesce(array_agg(k ORDER BY k), '{}') INTO keys FROM jsonb_object_keys(p) k;
  IF p_create THEN
    IF keys IS DISTINCT FROM ARRAY['code','description','gap_type','name','service_types','suggested_modules','trigger_clusters'] THEN
      RAISE EXCEPTION 'TNA_INVALID_PROGRAM';
    END IF;
    IF jsonb_typeof(p->'code') IS DISTINCT FROM 'string' OR (p->>'code') !~ '^[a-z][a-z0-9-]{2,47}$' THEN
      RAISE EXCEPTION 'TNA_INVALID_PROGRAM';
    END IF;
  ELSIF cardinality(keys)=0 OR NOT keys <@ fields THEN
    RAISE EXCEPTION 'TNA_INVALID_PROGRAM';
  END IF;
  IF (p ? 'name' AND (jsonb_typeof(p->'name') IS DISTINCT FROM 'string'
      OR char_length(btrim(p->>'name')) NOT BETWEEN 3 AND 120))
    OR (p ? 'description' AND (jsonb_typeof(p->'description') IS DISTINCT FROM 'string'
      OR char_length(btrim(p->>'description')) NOT BETWEEN 10 AND 1000))
    OR (p ? 'gap_type' AND (jsonb_typeof(p->'gap_type') IS DISTINCT FROM 'string'
      OR (p->>'gap_type') NOT IN ('knowledge','skill','proses','perilaku')))
    OR (p ? 'trigger_clusters' AND NOT tna_internal.valid_text_array(p->'trigger_clusters', 20))
    OR (p ? 'service_types' AND NOT tna_internal.valid_text_array(p->'service_types', 10))
    OR (p ? 'suggested_modules' AND (NOT tna_internal.valid_text_array(p->'suggested_modules', 3)
      OR NOT tna_internal.text_array(p->'suggested_modules') <@ ARRAY['ketik','pdkt','telefun']))
  THEN
    RAISE EXCEPTION 'TNA_INVALID_PROGRAM';
  END IF;
END;
$$;

CREATE FUNCTION public.tna_create_program(p_actor_id uuid, p_program jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_programs;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  PERFORM tna_internal.validate_program(p_program, true);
  BEGIN
    INSERT INTO public.tna_programs(code,name,description,gap_type,trigger_clusters,service_types,suggested_modules,
      created_by,updated_by)
    VALUES (p_program->>'code', btrim(p_program->>'name'), btrim(p_program->>'description'), p_program->>'gap_type',
      tna_internal.text_array(p_program->'trigger_clusters'), tna_internal.text_array(p_program->'service_types'),
      tna_internal.text_array(p_program->'suggested_modules'), p_actor_id, p_actor_id)
    RETURNING * INTO result;
  EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'TNA_PROGRAM_CODE_EXISTS';
  END;
  RETURN to_jsonb(result);
END;
$$;

CREATE FUNCTION public.tna_update_program(p_actor_id uuid, p_program_id uuid, p_expected_updated_at timestamptz,
  p_program jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_programs;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  PERFORM tna_internal.validate_program(p_program, false);
  SELECT * INTO result FROM public.tna_programs WHERE id=p_program_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PROGRAM_NOT_FOUND'; END IF;
  IF result.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'TNA_PROGRAM_STALE'; END IF;
  UPDATE public.tna_programs SET
    name=CASE WHEN p_program ? 'name' THEN btrim(p_program->>'name') ELSE name END,
    description=CASE WHEN p_program ? 'description' THEN btrim(p_program->>'description') ELSE description END,
    gap_type=CASE WHEN p_program ? 'gap_type' THEN p_program->>'gap_type' ELSE gap_type END,
    trigger_clusters=CASE WHEN p_program ? 'trigger_clusters'
      THEN tna_internal.text_array(p_program->'trigger_clusters') ELSE trigger_clusters END,
    service_types=CASE WHEN p_program ? 'service_types'
      THEN tna_internal.text_array(p_program->'service_types') ELSE service_types END,
    suggested_modules=CASE WHEN p_program ? 'suggested_modules'
      THEN tna_internal.text_array(p_program->'suggested_modules') ELSE suggested_modules END,
    updated_by=p_actor_id
  WHERE id=p_program_id RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$$;

CREATE FUNCTION public.tna_set_program_active(p_actor_id uuid, p_program_id uuid, p_expected_updated_at timestamptz,
  p_active boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_programs;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  IF p_active IS NULL THEN RAISE EXCEPTION 'TNA_INVALID_PROGRAM'; END IF;
  SELECT * INTO result FROM public.tna_programs WHERE id=p_program_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PROGRAM_NOT_FOUND'; END IF;
  IF result.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'TNA_PROGRAM_STALE'; END IF;
  UPDATE public.tna_programs SET is_active=p_active, updated_by=p_actor_id
    WHERE id=p_program_id RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$$;

-- Internal helpers are called only by the owner-run entry points above.
REVOKE ALL ON FUNCTION tna_internal.valid_text_array(jsonb,integer), tna_internal.text_array(jsonb),
  tna_internal.validate_program(jsonb,boolean) FROM PUBLIC, anon, authenticated, service_role;
-- Same explicit grant as phases 1-2; the guard, not the ACL, rejects callers.
GRANT EXECUTE ON FUNCTION public.tna_create_program(uuid,jsonb),
  public.tna_update_program(uuid,uuid,timestamptz,jsonb),
  public.tna_set_program_active(uuid,uuid,timestamptz,boolean) TO anon, authenticated, service_role;

COMMIT;
