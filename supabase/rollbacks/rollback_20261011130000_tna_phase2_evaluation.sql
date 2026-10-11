-- Fail closed before any DDL if Phase 2 state would be lost or cannot be
-- represented by the Phase 1 lifecycle. Transaction rollback leaves all intact.
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.tna_plans WHERE status IN ('evaluasi','selesai')
    OR evaluation_period_id IS NOT NULL OR evaluation_started_at IS NOT NULL OR evaluation_snapshot IS NOT NULL
    OR verdict IS NOT NULL OR conclusion_note IS NOT NULL OR follow_up IS NOT NULL OR completed_at IS NOT NULL
    OR cancel_reason IS NOT NULL) THEN RAISE EXCEPTION 'TNA_PHASE2_ROLLBACK_DATA_PRESENT'; END IF;
  IF EXISTS (SELECT 1 FROM public.tna_plan_participants WHERE baseline_sessions IS NOT NULL
    OR eval_findings IS NOT NULL OR eval_sessions IS NOT NULL OR audited_in_eval IS NOT NULL) THEN
    RAISE EXCEPTION 'TNA_PHASE2_ROLLBACK_DATA_PRESENT';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tna_needs WHERE previous_plan_id IS NOT NULL) THEN RAISE EXCEPTION 'TNA_PHASE2_ROLLBACK_DATA_PRESENT'; END IF;
  IF EXISTS (SELECT 1 FROM public.tna_plans WHERE status NOT IN ('draft','aktif','dibatalkan')) THEN
    RAISE EXCEPTION 'TNA_PHASE2_ROLLBACK_INCOMPATIBLE_STATE';
  END IF;
END;
$$;

DROP FUNCTION public.tna_complete_plan(uuid,uuid,timestamptz,jsonb,jsonb,text,text,text);
DROP FUNCTION public.tna_update_evaluation_period(uuid,uuid,timestamptz,uuid);
DROP FUNCTION public.tna_start_plan_evaluation(uuid,uuid,timestamptz,uuid);
DROP FUNCTION public.tna_cancel_plan(uuid,uuid,timestamptz,text);
DROP FUNCTION tna_internal.validate_evaluation_snapshot(jsonb,uuid,text,numeric,numeric);
DROP FUNCTION tna_internal.valid_eval_period(uuid,date);
REVOKE USAGE ON SCHEMA tna_internal FROM service_role;

CREATE OR REPLACE FUNCTION tna_internal.guard_plan() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.baseline_snapshot IS NOT NULL OR NEW.activated_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'TNA_PLAN_INVALID_INITIAL_STATE';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.need_id IS DISTINCT FROM OLD.need_id
    OR NEW.program_id IS DISTINCT FROM OLD.program_id OR NEW.created_by IS DISTINCT FROM OLD.created_by
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN RAISE EXCEPTION 'TNA_PLAN_IDENTITY_IMMUTABLE'; END IF;
  IF NEW.baseline_snapshot IS DISTINCT FROM OLD.baseline_snapshot OR NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    IF NOT (OLD.status='draft' AND NEW.status='aktif' AND OLD.baseline_snapshot IS NULL AND OLD.activated_at IS NULL
      AND NEW.baseline_snapshot IS NOT NULL AND NEW.activated_at IS NOT NULL) THEN RAISE EXCEPTION 'TNA_BASELINE_IMMUTABLE'; END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT ((OLD.status='draft' AND NEW.status IN ('aktif','dibatalkan'))
    OR (OLD.status='aktif' AND NEW.status='dibatalkan')) THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  IF NEW.status='aktif' AND (NEW.baseline_snapshot IS NULL OR NEW.activated_at IS NULL) THEN RAISE EXCEPTION 'TNA_BASELINE_REQUIRED'; END IF;
  IF OLD.status <> 'draft' AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.intervention_type IS DISTINCT FROM OLD.intervention_type
    OR NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.evaluation_due_date IS DISTINCT FROM OLD.evaluation_due_date
    OR NEW.target_max_rate_per_100 IS DISTINCT FROM OLD.target_max_rate_per_100 OR NEW.target_max_spread_pct IS DISTINCT FROM OLD.target_max_spread_pct) THEN
    RAISE EXCEPTION 'TNA_PLAN_NOT_DRAFT'; END IF;
  IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at AND NOT (OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL
    AND NEW.status='dibatalkan' AND OLD.status IN ('draft','aktif')) THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION tna_internal.guard_participant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_status text; parent_id uuid;
BEGIN
  parent_id := CASE WHEN TG_OP='DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.plan_id IS DISTINCT FROM OLD.plan_id) THEN RAISE EXCEPTION 'TNA_PARTICIPANT_IDENTITY_IMMUTABLE'; END IF;
  IF TG_OP='UPDATE' AND OLD.peserta_id IS NOT NULL AND NEW.peserta_id IS NULL
    AND (to_jsonb(NEW)-'peserta_id')=(to_jsonb(OLD)-'peserta_id')
    AND NOT EXISTS (SELECT 1 FROM public.profiler_peserta WHERE id=OLD.peserta_id) THEN RETURN NEW; END IF;
  SELECT status INTO parent_status FROM public.tna_plans WHERE id=parent_id FOR UPDATE;
  IF TG_OP='DELETE' AND parent_status IS NULL THEN RETURN OLD; END IF;
  IF parent_status='draft' THEN
    IF TG_OP<>'DELETE' AND (NEW.baseline_findings IS NOT NULL OR NEW.was_affected IS NOT NULL) THEN RAISE EXCEPTION 'TNA_PARTICIPANT_BASELINE_NOT_DRAFT'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP='UPDATE' AND parent_status='aktif' AND current_setting('tna.activating_plan',true)=NEW.plan_id::text
    AND OLD.baseline_findings IS NULL AND OLD.was_affected IS NULL AND NEW.baseline_findings IS NOT NULL AND NEW.was_affected IS NOT NULL
    AND (to_jsonb(NEW)-'baseline_findings'-'was_affected')=(to_jsonb(OLD)-'baseline_findings'-'was_affected') THEN RETURN NEW; END IF;
  RAISE EXCEPTION 'TNA_PARTICIPANTS_IMMUTABLE';
END;
$$;

CREATE OR REPLACE FUNCTION public.tna_activate_plan(p_actor_id uuid,p_plan_id uuid,p_expected_updated_at timestamptz,
  p_baseline jsonb,p_participant_baselines jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,tna_internal AS $$
DECLARE result public.tna_plans; roster_count integer; match_count integer;
BEGIN
  PERFORM tna_internal.assert_service_role(); PERFORM tna_internal.require_actor(p_actor_id);
  SELECT * INTO result FROM public.tna_plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND OR result.status<>'draft' OR result.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  IF p_baseline->>'auditStatus'='no_audit' THEN RAISE EXCEPTION 'TNA_BASELINE_NO_AUDIT'; END IF;
  IF coalesce((p_baseline->>'findings')::integer,0)=0 THEN RAISE EXCEPTION 'TNA_BASELINE_NO_FINDINGS'; END IF;
  IF jsonb_typeof(p_baseline) IS DISTINCT FROM 'object' OR p_baseline->>'auditStatus' IS DISTINCT FROM 'audited'
    OR jsonb_typeof(p_baseline->'ratePer100') IS DISTINCT FROM 'number' OR jsonb_typeof(p_baseline->'spreadPct') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'TNA_INVALID_BASELINE'; END IF;
  IF NOT (result.target_max_rate_per_100 < (p_baseline->>'ratePer100')::numeric OR result.target_max_spread_pct < (p_baseline->>'spreadPct')::numeric) THEN RAISE EXCEPTION 'TNA_TARGET_NOT_BETTER'; END IF;
  IF jsonb_typeof(p_participant_baselines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'TNA_BASELINE_PARTICIPANT_MISMATCH'; END IF;
  SELECT count(*) INTO roster_count FROM public.tna_plan_participants WHERE plan_id=p_plan_id;
  SELECT count(DISTINCT p.id) INTO match_count FROM public.tna_plan_participants p JOIN jsonb_array_elements(p_participant_baselines) x
    ON p.peserta_id=(x->>'peserta_id')::uuid WHERE p.plan_id=p_plan_id AND jsonb_typeof(x->'baseline_findings')='number'
    AND (x->>'baseline_findings')::integer>=0 AND jsonb_typeof(x->'was_affected')='boolean'
    AND (x->>'was_affected')::boolean=((x->>'baseline_findings')::integer>0);
  IF roster_count=0 OR match_count<>roster_count OR jsonb_array_length(p_participant_baselines)<>roster_count THEN RAISE EXCEPTION 'TNA_BASELINE_PARTICIPANT_MISMATCH'; END IF;
  UPDATE public.tna_plans SET status='aktif',baseline_snapshot=p_baseline,activated_at=clock_timestamp()
    WHERE id=p_plan_id AND status='draft' AND updated_at=p_expected_updated_at RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  PERFORM set_config('tna.activating_plan',p_plan_id::text,true);
  UPDATE public.tna_plan_participants p SET baseline_findings=(x->>'baseline_findings')::integer,was_affected=(x->>'was_affected')::boolean
    FROM jsonb_array_elements(p_participant_baselines) x WHERE p.plan_id=p_plan_id AND p.peserta_id=(x->>'peserta_id')::uuid;
  PERFORM set_config('tna.activating_plan','',true); RETURN to_jsonb(result);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('tna.activating_plan','',true); RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.tna_cancel_plan(p_actor_id uuid,p_plan_id uuid,p_expected_updated_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,tna_internal AS $$
DECLARE result public.tna_plans;
BEGIN
  PERFORM tna_internal.assert_service_role(); PERFORM tna_internal.require_actor(p_actor_id);
  UPDATE public.tna_plans SET status='dibatalkan',cancelled_at=clock_timestamp()
    WHERE id=p_plan_id AND status IN ('draft','aktif') AND updated_at=p_expected_updated_at RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  RETURN to_jsonb(result);
END;
$$;

ALTER TABLE public.tna_plans DROP CONSTRAINT tna_plan_evaluation_lifecycle, DROP CONSTRAINT tna_plan_evaluation_snapshot_object;
ALTER TABLE public.tna_plan_participants DROP CONSTRAINT tna_participant_evaluation_values;
ALTER TABLE public.tna_plans DROP COLUMN evaluation_period_id,DROP COLUMN evaluation_started_at,DROP COLUMN evaluation_snapshot,
  DROP COLUMN verdict,DROP COLUMN conclusion_note,DROP COLUMN follow_up,DROP COLUMN completed_at,DROP COLUMN cancel_reason;
ALTER TABLE public.tna_plan_participants DROP COLUMN baseline_sessions,DROP COLUMN eval_findings,DROP COLUMN eval_sessions,DROP COLUMN audited_in_eval;
ALTER TABLE public.tna_needs DROP COLUMN previous_plan_id;
DROP INDEX IF EXISTS public.idx_tna_plans_status_evaluation_due;
NOTIFY pgrst,'reload schema';
COMMIT;
