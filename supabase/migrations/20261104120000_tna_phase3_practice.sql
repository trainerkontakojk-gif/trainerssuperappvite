-- Migration: tna_phase3_practice
-- Lane D. Plan: plans/markdown/tna-phase-3.md rev. 3 (D15, P-1, P-2); T0 report
-- plans/markdown/tna-phase-3-t0-report.md §3.
--
-- Adds practice targets per plan (one per simulation module) and a frozen
-- per-participant practice snapshot written once at evaluasi -> selesai.
-- Signatures of every public TNA function stay exactly the same; only bodies
-- change. Targets travel in p_plan->'practice_targets'; the snapshot travels
-- as an optional fifth key 'practice' in each completion participant object.
--
-- Public mutators keep PostgreSQL's default EXECUTE path and reject callers
-- in their first statement (tna_internal.assert_service_role()). Never REVOKE
-- EXECUTE on them: the Supabase Postgres image crashes on that path (K6;
-- plans/markdown/tna-postgres-crash-investigation.md).
--
-- Roles touched: anon/authenticated get SELECT only (RLS admin/trainer) on the
-- new table; service_role writes through the RPCs. No data is backfilled.
BEGIN;

CREATE TABLE public.tna_plan_practice_targets (
  plan_id uuid NOT NULL REFERENCES public.tna_plans(id) ON DELETE CASCADE,
  module text NOT NULL CHECK (module IN ('ketik','pdkt','telefun')),
  min_sessions integer NOT NULL CHECK (min_sessions BETWEEN 1 AND 20),
  PRIMARY KEY (plan_id, module)
);
ALTER TABLE public.tna_plan_practice_targets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tna_plan_practice_targets FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tna_plan_practice_targets TO authenticated;
GRANT ALL ON public.tna_plan_practice_targets TO service_role;
CREATE POLICY tna_practice_targets_read ON public.tna_plan_practice_targets
  FOR SELECT TO authenticated USING (public.is_admin_or_trainer());

ALTER TABLE public.tna_plan_participants ADD COLUMN practice_snapshot jsonb;
COMMENT ON COLUMN public.tna_plan_participants.practice_snapshot IS
  'Practice progress per target module, frozen once at evaluasi -> selesai (TNA phase 3).';

-- Targets change only while the parent plan is draft, for every role
-- including service_role. A cascade from a deleted plan finds no parent.
CREATE FUNCTION tna_internal.guard_practice_target() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE parent_status text; parent_id uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN RAISE EXCEPTION 'TNA_PRACTICE_TARGETS_IMMUTABLE'; END IF;
  parent_id := CASE WHEN TG_OP='DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
  SELECT status INTO parent_status FROM public.tna_plans WHERE id=parent_id FOR UPDATE;
  IF TG_OP='DELETE' AND parent_status IS NULL THEN RETURN OLD; END IF;
  IF parent_status='draft' THEN
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  RAISE EXCEPTION 'TNA_PRACTICE_TARGETS_IMMUTABLE';
END;
$$;
CREATE TRIGGER tna_practice_targets_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.tna_plan_practice_targets
FOR EACH ROW EXECUTE FUNCTION tna_internal.guard_practice_target();

-- Replace the whole target set: array of {module, min_sessions}, at most one
-- entry per module, min_sessions an integer 1..20, no other keys.
CREATE FUNCTION tna_internal.replace_practice_targets(p_plan_id uuid, p_targets jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
BEGIN
  IF jsonb_typeof(p_targets) IS DISTINCT FROM 'array' OR jsonb_array_length(p_targets) > 3
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_targets) x
      WHERE jsonb_typeof(x) <> 'object'
        OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k) IS DISTINCT FROM ARRAY['min_sessions','module']::text[]
        OR jsonb_typeof(x->'module') <> 'string' OR x->>'module' NOT IN ('ketik','pdkt','telefun')
        OR jsonb_typeof(x->'min_sessions') <> 'number'
        OR (x->>'min_sessions')::numeric <> trunc((x->>'min_sessions')::numeric)
        OR (x->>'min_sessions')::numeric NOT BETWEEN 1 AND 20)
    OR (SELECT count(DISTINCT x->>'module') FROM jsonb_array_elements(p_targets) x) <> jsonb_array_length(p_targets) THEN
    RAISE EXCEPTION 'TNA_INVALID_PRACTICE_TARGETS';
  END IF;
  DELETE FROM public.tna_plan_practice_targets WHERE plan_id=p_plan_id;
  INSERT INTO public.tna_plan_practice_targets(plan_id,module,min_sessions)
    SELECT p_plan_id, x->>'module', (x->>'min_sessions')::integer FROM jsonb_array_elements(p_targets) x;
END;
$$;

-- One participant's practice snapshot against the plan's targets
-- ({module: min_sessions}). Exactly one entry per target module, each exactly
-- {sessions, avg_score, status}; status follows sessions vs min_sessions;
-- no score without sessions; score within the module scale (Telefun 0-10).
CREATE FUNCTION tna_internal.valid_practice_snapshot(p jsonb, p_targets jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE SET search_path = public, tna_internal AS $$
DECLARE m text; e jsonb; s numeric; avg numeric; target integer;
BEGIN
  IF p IS NULL OR jsonb_typeof(p) <> 'object'
    OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k) IS DISTINCT FROM (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_targets) k) THEN
    RETURN false;
  END IF;
  FOR m, e IN SELECT key, value FROM jsonb_each(p) LOOP
    target := (p_targets->>m)::integer;
    IF jsonb_typeof(e) <> 'object'
      OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(e) k) IS DISTINCT FROM ARRAY['avg_score','sessions','status']::text[]
      OR jsonb_typeof(e->'sessions') <> 'number' OR jsonb_typeof(e->'status') <> 'string' THEN RETURN false; END IF;
    s := (e->>'sessions')::numeric;
    IF s < 0 OR s <> trunc(s) OR s > 2147483647 THEN RETURN false; END IF;
    IF s = 0 THEN
      IF jsonb_typeof(e->'avg_score') <> 'null' OR e->>'status' <> 'belum_mulai' THEN RETURN false; END IF;
    ELSE
      IF jsonb_typeof(e->'avg_score') <> 'number' THEN RETURN false; END IF;
      avg := (e->>'avg_score')::numeric;
      IF avg < 0 OR avg > (CASE WHEN m = 'telefun' THEN 10 ELSE 100 END) THEN RETURN false; END IF;
      IF e->>'status' IS DISTINCT FROM (CASE WHEN s >= target THEN 'memenuhi' ELSE 'berjalan' END) THEN RETURN false; END IF;
    END IF;
  END LOOP;
  RETURN true;
END;
$$;

-- Phase 2 participant guard plus practice_snapshot: NULL while draft,
-- untouched at activation, written once from NULL inside the completion
-- marker, and immutable afterwards.
CREATE OR REPLACE FUNCTION tna_internal.guard_participant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE parent_status text; parent_id uuid; marker text;
BEGIN
  parent_id := CASE WHEN TG_OP='DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.plan_id IS DISTINCT FROM OLD.plan_id) THEN RAISE EXCEPTION 'TNA_PARTICIPANT_IDENTITY_IMMUTABLE'; END IF;
  IF TG_OP='UPDATE' AND OLD.peserta_id IS NOT NULL AND NEW.peserta_id IS NULL
    AND (to_jsonb(NEW)-'peserta_id')=(to_jsonb(OLD)-'peserta_id')
    AND NOT EXISTS (SELECT 1 FROM public.profiler_peserta WHERE id=OLD.peserta_id) THEN RETURN NEW; END IF;
  SELECT status INTO parent_status FROM public.tna_plans WHERE id=parent_id FOR UPDATE;
  IF TG_OP='DELETE' AND parent_status IS NULL THEN RETURN OLD; END IF;
  IF parent_status='draft' THEN
    IF TG_OP<>'DELETE' AND (NEW.baseline_findings IS NOT NULL OR NEW.was_affected IS NOT NULL OR NEW.baseline_sessions IS NOT NULL
      OR NEW.eval_findings IS NOT NULL OR NEW.eval_sessions IS NOT NULL OR NEW.audited_in_eval IS NOT NULL
      OR NEW.practice_snapshot IS NOT NULL) THEN
      RAISE EXCEPTION 'TNA_PARTICIPANT_BASELINE_NOT_DRAFT';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  marker := current_setting('tna.activating_plan',true);
  IF TG_OP='UPDATE' AND parent_status='aktif' AND marker=NEW.plan_id::text
    AND OLD.baseline_findings IS NULL AND OLD.was_affected IS NULL AND NEW.baseline_findings IS NOT NULL AND NEW.was_affected IS NOT NULL
    AND (to_jsonb(NEW)-'baseline_findings'-'was_affected'-'baseline_sessions')=(to_jsonb(OLD)-'baseline_findings'-'was_affected'-'baseline_sessions')
    AND OLD.baseline_sessions IS NULL THEN RETURN NEW; END IF;
  marker := current_setting('tna.completing_plan',true);
  IF TG_OP='UPDATE' AND parent_status='evaluasi' AND marker=NEW.plan_id::text
    AND OLD.eval_findings IS NULL AND OLD.eval_sessions IS NULL AND OLD.audited_in_eval IS NULL AND OLD.practice_snapshot IS NULL
    AND (to_jsonb(NEW)-'eval_findings'-'eval_sessions'-'audited_in_eval'-'practice_snapshot')=(to_jsonb(OLD)-'eval_findings'-'eval_sessions'-'audited_in_eval'-'practice_snapshot')
    AND ((NEW.audited_in_eval=false AND NEW.eval_findings IS NULL AND NEW.eval_sessions IS NULL) OR
      (NEW.audited_in_eval=true AND NEW.eval_findings IS NOT NULL AND NEW.eval_sessions IS NOT NULL)) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND parent_status='selesai' AND
    (NEW.eval_findings IS DISTINCT FROM OLD.eval_findings OR NEW.eval_sessions IS DISTINCT FROM OLD.eval_sessions OR NEW.audited_in_eval IS DISTINCT FROM OLD.audited_in_eval) THEN
    RAISE EXCEPTION 'TNA_EVALUATION_IMMUTABLE';
  END IF;
  IF TG_OP='UPDATE' AND parent_status='selesai' AND NEW.practice_snapshot IS DISTINCT FROM OLD.practice_snapshot THEN
    RAISE EXCEPTION 'TNA_PRACTICE_SNAPSHOT_IMMUTABLE';
  END IF;
  RAISE EXCEPTION 'TNA_PARTICIPANTS_IMMUTABLE';
END;
$$;

-- Phase 1 body plus optional p_plan->'practice_targets'.
CREATE OR REPLACE FUNCTION public.tna_create_plan(p_actor_id uuid, p_plan jsonb, p_participants jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_plans;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  IF NOT EXISTS (SELECT 1 FROM public.tna_needs WHERE id=(p_plan->>'need_id')::uuid AND outcome='training') THEN
    RAISE EXCEPTION 'TNA_NEED_NOT_TRAINING';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.tna_programs WHERE id=(p_plan->>'program_id')::uuid AND is_active) THEN
    RAISE EXCEPTION 'TNA_PROGRAM_INACTIVE';
  END IF;
  INSERT INTO public.tna_plans(need_id,program_id,title,intervention_type,start_date,end_date,evaluation_due_date,
    target_max_rate_per_100,target_max_spread_pct,created_by)
  VALUES ((p_plan->>'need_id')::uuid,(p_plan->>'program_id')::uuid,btrim(p_plan->>'title'),p_plan->>'intervention_type',
    (p_plan->>'start_date')::date,(p_plan->>'end_date')::date,(p_plan->>'evaluation_due_date')::date,
    (p_plan->>'target_max_rate_per_100')::numeric,(p_plan->>'target_max_spread_pct')::numeric,p_actor_id)
  RETURNING * INTO result;
  PERFORM tna_internal.replace_participants(result.id,p_participants);
  IF p_plan ? 'practice_targets' THEN
    PERFORM tna_internal.replace_practice_targets(result.id,p_plan->'practice_targets');
  END IF;
  RETURN to_jsonb(result);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'TNA_PLAN_EXISTS';
END;
$$;

-- Phase 1 body plus optional p_plan->'practice_targets' (absent key = keep).
CREATE OR REPLACE FUNCTION public.tna_update_draft_plan(p_actor_id uuid, p_plan_id uuid, p_expected_updated_at timestamptz,
  p_plan jsonb, p_participants jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_plans;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  SELECT * INTO result FROM public.tna_plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_NOT_FOUND'; END IF;
  IF result.status<>'draft' THEN RAISE EXCEPTION 'TNA_PLAN_NOT_DRAFT'; END IF;
  IF result.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'TNA_PLAN_STALE'; END IF;
  UPDATE public.tna_plans SET title=coalesce(btrim(p_plan->>'title'),title),
    intervention_type=coalesce(p_plan->>'intervention_type',intervention_type),
    start_date=coalesce((p_plan->>'start_date')::date,start_date), end_date=coalesce((p_plan->>'end_date')::date,end_date),
    evaluation_due_date=coalesce((p_plan->>'evaluation_due_date')::date,evaluation_due_date),
    target_max_rate_per_100=coalesce((p_plan->>'target_max_rate_per_100')::numeric,target_max_rate_per_100),
    target_max_spread_pct=coalesce((p_plan->>'target_max_spread_pct')::numeric,target_max_spread_pct)
  WHERE id=p_plan_id RETURNING * INTO result;
  IF p_participants IS NOT NULL AND p_participants <> 'null'::jsonb THEN
    PERFORM tna_internal.replace_participants(p_plan_id,p_participants);
  END IF;
  IF p_plan ? 'practice_targets' THEN
    PERFORM tna_internal.replace_practice_targets(p_plan_id,p_plan->'practice_targets');
  END IF;
  RETURN to_jsonb(result);
END;
$$;

-- Phase 2 body; participant objects may carry a fifth key 'practice' (P-1).
CREATE OR REPLACE FUNCTION public.tna_complete_plan(p_actor_id uuid,p_plan_id uuid,p_expected_updated_at timestamptz,p_evaluation_snapshot jsonb,
  p_participant_evaluations jsonb,p_verdict text,p_conclusion_note text,p_follow_up text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,tna_internal AS $$
DECLARE result public.tna_plans; n integer; matched integer; targets jsonb;
BEGIN
  PERFORM tna_internal.assert_service_role(); PERFORM tna_internal.require_actor(p_actor_id);
  SELECT * INTO result FROM public.tna_plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_NOT_FOUND'; END IF;
  IF result.status<>'evaluasi' THEN RAISE EXCEPTION 'TNA_PLAN_NOT_EVALUATING'; END IF;
  IF result.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'TNA_PLAN_STALE'; END IF;
  IF result.target_max_rate_per_100 IS NULL OR result.target_max_spread_pct IS NULL OR p_verdict IS NULL OR p_verdict NOT IN ('tercapai','tercapai_sebagian','tidak_tercapai')
    OR char_length(btrim(coalesce(p_conclusion_note,''))) NOT BETWEEN 10 AND 2000
    OR p_follow_up IS NULL OR p_follow_up NOT IN ('selesai_tuntas','perlu_rencana_lanjutan','eskalasi_non_training') THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  BEGIN
    PERFORM tna_internal.validate_evaluation_snapshot(p_evaluation_snapshot,result.evaluation_period_id,p_verdict,result.target_max_rate_per_100,result.target_max_spread_pct);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM IN ('TNA_EVALUATION_NO_AUDIT','TNA_INVALID_EVALUATION') THEN RAISE; END IF;
    RAISE EXCEPTION 'TNA_INVALID_EVALUATION';
  END;
  IF jsonb_typeof(p_participant_evaluations) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'TNA_EVALUATION_PARTICIPANT_MISMATCH'; END IF;
  PERFORM 1 FROM public.tna_plan_participants WHERE plan_id=p_plan_id FOR UPDATE;
  SELECT count(*) INTO n FROM public.tna_plan_participants WHERE plan_id=p_plan_id;
  IF jsonb_array_length(p_participant_evaluations)<>n OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_participant_evaluations) x
    WHERE jsonb_typeof(x)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x - 'practice') k) IS DISTINCT FROM ARRAY['audited_in_eval','eval_findings','eval_sessions','participant_id']::text[]
      OR jsonb_typeof(x->'participant_id')<>'string' OR jsonb_typeof(x->'audited_in_eval')<>'boolean'
      OR ((x->>'audited_in_eval')='false' AND (x->'eval_findings'<>'null'::jsonb OR x->'eval_sessions'<>'null'::jsonb))
      OR ((x->>'audited_in_eval')='true' AND (jsonb_typeof(x->'eval_findings')<>'number' OR jsonb_typeof(x->'eval_sessions')<>'number'
        OR (x->'eval_findings')::text::numeric<0 OR (x->'eval_findings')::text::numeric<>trunc((x->'eval_findings')::text::numeric)
        OR (x->'eval_sessions')::text::numeric<0 OR (x->'eval_sessions')::text::numeric<>trunc((x->'eval_sessions')::text::numeric) OR (x->'eval_sessions')::text::numeric>2147483647
        OR (x->'eval_findings')::text::numeric>2147483647)) ) THEN RAISE EXCEPTION 'TNA_EVALUATION_PARTICIPANT_MISMATCH'; END IF;
  SELECT count(DISTINCT p.id) INTO matched FROM public.tna_plan_participants p JOIN jsonb_array_elements(p_participant_evaluations) x ON x->>'participant_id'=p.id::text WHERE p.plan_id=p_plan_id;
  IF matched<>n THEN RAISE EXCEPTION 'TNA_EVALUATION_PARTICIPANT_MISMATCH'; END IF;
  SELECT jsonb_object_agg(module,min_sessions) INTO targets FROM public.tna_plan_practice_targets WHERE plan_id=p_plan_id;
  IF targets IS NULL THEN
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participant_evaluations) x WHERE x ? 'practice') THEN
      RAISE EXCEPTION 'TNA_PRACTICE_SNAPSHOT_INVALID';
    END IF;
  ELSIF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participant_evaluations) x
    WHERE NOT tna_internal.valid_practice_snapshot(x->'practice',targets)) THEN
    RAISE EXCEPTION 'TNA_PRACTICE_SNAPSHOT_INVALID';
  END IF;
  PERFORM set_config('tna.completing_plan',p_plan_id::text,true);
  UPDATE public.tna_plan_participants p SET audited_in_eval=(x->>'audited_in_eval')::boolean,
    eval_findings=CASE WHEN x->>'audited_in_eval'='true' THEN (x->>'eval_findings')::integer ELSE NULL END,
    eval_sessions=CASE WHEN x->>'audited_in_eval'='true' THEN (x->>'eval_sessions')::integer ELSE NULL END,
    practice_snapshot=x->'practice'
    FROM jsonb_array_elements(p_participant_evaluations) x WHERE p.plan_id=p_plan_id AND x->>'participant_id'=p.id::text;
  UPDATE public.tna_plans SET status='selesai',evaluation_snapshot=p_evaluation_snapshot,verdict=p_verdict,
    conclusion_note=btrim(p_conclusion_note),follow_up=p_follow_up,completed_at=clock_timestamp()
    WHERE id=p_plan_id RETURNING * INTO result;
  PERFORM set_config('tna.completing_plan','',true);
  RETURN to_jsonb(result);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('tna.completing_plan','',true); RAISE;
END;
$$;

NOTIFY pgrst,'reload schema';
COMMIT;
