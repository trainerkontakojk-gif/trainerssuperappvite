-- TNA phase 2 evaluation substrate. Additive; Phase 1 migration remains untouched.
BEGIN;

ALTER TABLE public.tna_plans
  ADD COLUMN evaluation_period_id uuid REFERENCES public.qa_periods(id) ON DELETE RESTRICT,
  ADD COLUMN evaluation_started_at timestamptz,
  ADD COLUMN evaluation_snapshot jsonb,
  ADD COLUMN verdict text CHECK (verdict IN ('tercapai','tercapai_sebagian','tidak_tercapai')),
  ADD COLUMN conclusion_note text CHECK (conclusion_note IS NULL OR char_length(btrim(conclusion_note)) BETWEEN 10 AND 2000),
  ADD COLUMN follow_up text CHECK (follow_up IN ('selesai_tuntas','perlu_rencana_lanjutan','eskalasi_non_training')),
  ADD COLUMN completed_at timestamptz,
  ADD COLUMN cancel_reason text CHECK (cancel_reason IS NULL OR char_length(btrim(cancel_reason)) BETWEEN 10 AND 1000),
  ADD CONSTRAINT tna_plan_evaluation_snapshot_object CHECK (evaluation_snapshot IS NULL OR jsonb_typeof(evaluation_snapshot)='object'),
  ADD CONSTRAINT tna_plan_evaluation_lifecycle CHECK (
    (status <> 'evaluasi' OR (evaluation_period_id IS NOT NULL AND evaluation_started_at IS NOT NULL)) AND
    (status <> 'selesai' OR (evaluation_period_id IS NOT NULL AND evaluation_snapshot IS NOT NULL AND verdict IS NOT NULL
      AND conclusion_note IS NOT NULL AND follow_up IS NOT NULL AND completed_at IS NOT NULL)) AND
    (status = 'selesai' OR (evaluation_snapshot IS NULL AND verdict IS NULL AND conclusion_note IS NULL
      AND follow_up IS NULL AND completed_at IS NULL))
  );
ALTER TABLE public.tna_plan_participants
  ADD COLUMN baseline_sessions integer CHECK (baseline_sessions IS NULL OR baseline_sessions >= 0),
  ADD COLUMN eval_findings integer CHECK (eval_findings IS NULL OR eval_findings >= 0),
  ADD COLUMN eval_sessions integer CHECK (eval_sessions IS NULL OR eval_sessions >= 0),
  ADD COLUMN audited_in_eval boolean,
  ADD CONSTRAINT tna_participant_evaluation_values CHECK (
    (audited_in_eval IS NULL AND eval_findings IS NULL AND eval_sessions IS NULL) OR
    (audited_in_eval = false AND eval_findings IS NULL AND eval_sessions IS NULL) OR
    (audited_in_eval = true AND eval_findings IS NOT NULL AND eval_sessions IS NOT NULL)
  );
ALTER TABLE public.tna_needs
  ADD COLUMN previous_plan_id uuid REFERENCES public.tna_plans(id) ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS idx_tna_plans_status_evaluation_due ON public.tna_plans(status,evaluation_due_date);

CREATE OR REPLACE FUNCTION tna_internal.guard_plan() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, tna_internal AS $$
DECLARE period_marker text; completion_marker text;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status <> 'draft' OR NEW.baseline_snapshot IS NOT NULL OR NEW.activated_at IS NOT NULL OR NEW.cancelled_at IS NOT NULL
      OR NEW.evaluation_period_id IS NOT NULL OR NEW.evaluation_started_at IS NOT NULL OR NEW.evaluation_snapshot IS NOT NULL
      OR NEW.verdict IS NOT NULL OR NEW.conclusion_note IS NOT NULL OR NEW.follow_up IS NOT NULL OR NEW.completed_at IS NOT NULL
      OR NEW.cancel_reason IS NOT NULL THEN RAISE EXCEPTION 'TNA_PLAN_INVALID_INITIAL_STATE'; END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.need_id IS DISTINCT FROM OLD.need_id OR NEW.program_id IS DISTINCT FROM OLD.program_id
    OR NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'TNA_PLAN_IDENTITY_IMMUTABLE';
  END IF;
  IF NEW.baseline_snapshot IS DISTINCT FROM OLD.baseline_snapshot OR NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    IF NOT (OLD.status='draft' AND NEW.status='aktif' AND OLD.baseline_snapshot IS NULL AND OLD.activated_at IS NULL
      AND NEW.baseline_snapshot IS NOT NULL AND NEW.activated_at IS NOT NULL) THEN RAISE EXCEPTION 'TNA_BASELINE_IMMUTABLE'; END IF;
  END IF;
  period_marker := current_setting('tna.evaluation_period_plan',true);
  completion_marker := current_setting('tna.completing_plan',true);
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='draft' AND NEW.status IN ('aktif','dibatalkan')) OR
    (OLD.status='aktif' AND NEW.status IN ('evaluasi','dibatalkan')) OR
    (OLD.status='evaluasi' AND NEW.status IN ('selesai','dibatalkan'))
  ) THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  IF NEW.status='aktif' AND (NEW.baseline_snapshot IS NULL OR NEW.activated_at IS NULL) THEN RAISE EXCEPTION 'TNA_BASELINE_REQUIRED'; END IF;
  IF OLD.status <> 'draft' AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.intervention_type IS DISTINCT FROM OLD.intervention_type
    OR NEW.start_date IS DISTINCT FROM OLD.start_date OR NEW.end_date IS DISTINCT FROM OLD.end_date
    OR NEW.evaluation_due_date IS DISTINCT FROM OLD.evaluation_due_date
    OR NEW.target_max_rate_per_100 IS DISTINCT FROM OLD.target_max_rate_per_100
    OR NEW.target_max_spread_pct IS DISTINCT FROM OLD.target_max_spread_pct) THEN RAISE EXCEPTION 'TNA_PLAN_NOT_DRAFT'; END IF;
  IF NEW.status='evaluasi' AND (NEW.evaluation_period_id IS NULL OR NEW.evaluation_started_at IS NULL) THEN
    RAISE EXCEPTION 'TNA_EVALUATION_PERIOD_INVALID';
  END IF;
  IF OLD.status='aktif' AND NEW.status='evaluasi'
    AND (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date < OLD.evaluation_due_date THEN
    RAISE EXCEPTION 'TNA_EVALUATION_NOT_DUE';
  END IF;
  IF NEW.evaluation_period_id IS DISTINCT FROM OLD.evaluation_period_id
    AND NOT tna_internal.valid_eval_period(NEW.evaluation_period_id,NEW.end_date) THEN
    RAISE EXCEPTION 'TNA_EVALUATION_PERIOD_INVALID';
  END IF;
  IF NEW.evaluation_started_at IS DISTINCT FROM OLD.evaluation_started_at AND NOT
    (OLD.status='aktif' AND NEW.status='evaluasi' AND OLD.evaluation_started_at IS NULL AND NEW.evaluation_started_at IS NOT NULL) THEN
    RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT';
  END IF;
  IF NEW.evaluation_period_id IS DISTINCT FROM OLD.evaluation_period_id AND NOT (
    (OLD.status='aktif' AND NEW.status='evaluasi' AND OLD.evaluation_period_id IS NULL
      AND period_marker IS NOT DISTINCT FROM OLD.id::text AND NEW.evaluation_started_at IS NOT NULL AND NEW.evaluation_snapshot IS NULL) OR
    (OLD.status='evaluasi' AND NEW.status='evaluasi' AND period_marker IS NOT DISTINCT FROM OLD.id::text
      AND NEW.evaluation_started_at=OLD.evaluation_started_at AND NEW.evaluation_snapshot IS NULL)
  ) THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  IF OLD.status='evaluasi' AND NEW.status='selesai' THEN
    IF completion_marker IS DISTINCT FROM OLD.id::text OR NEW.evaluation_period_id IS DISTINCT FROM OLD.evaluation_period_id
      OR NEW.evaluation_started_at IS DISTINCT FROM OLD.evaluation_started_at OR NEW.evaluation_snapshot IS NULL
      OR NEW.verdict IS NULL OR NEW.conclusion_note IS NULL OR NEW.follow_up IS NULL OR NEW.completed_at IS NULL THEN
      RAISE EXCEPTION 'TNA_INVALID_EVALUATION';
    END IF;
    PERFORM tna_internal.validate_evaluation_snapshot(NEW.evaluation_snapshot,NEW.evaluation_period_id,NEW.verdict,
      NEW.target_max_rate_per_100,NEW.target_max_spread_pct);
    IF EXISTS (SELECT 1 FROM public.tna_plan_participants WHERE plan_id=NEW.id AND audited_in_eval IS NULL) THEN
      RAISE EXCEPTION 'TNA_EVALUATION_PARTICIPANT_MISMATCH';
    END IF;
  ELSIF NEW.evaluation_snapshot IS DISTINCT FROM OLD.evaluation_snapshot OR NEW.verdict IS DISTINCT FROM OLD.verdict
    OR NEW.conclusion_note IS DISTINCT FROM OLD.conclusion_note OR NEW.follow_up IS DISTINCT FROM OLD.follow_up
    OR NEW.completed_at IS DISTINCT FROM OLD.completed_at THEN
    RAISE EXCEPTION 'TNA_EVALUATION_IMMUTABLE';
  END IF;
  IF NEW.status='dibatalkan' AND OLD.status IN ('aktif','evaluasi') THEN
    IF nullif(btrim(NEW.cancel_reason),'') IS NULL THEN RAISE EXCEPTION 'TNA_CANCEL_REASON_REQUIRED'; END IF;
    IF char_length(btrim(NEW.cancel_reason)) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'TNA_INVALID_CANCEL_REASON'; END IF;
  END IF;
  IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at AND NOT
    (OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL AND NEW.status='dibatalkan'
      AND OLD.status IN ('draft','aktif','evaluasi')) THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  IF NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason AND NOT
    (NEW.status='dibatalkan' AND OLD.status IN ('draft','aktif','evaluasi') AND OLD.cancel_reason IS NULL) THEN
    RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT';
  END IF;
  IF NEW.status='dibatalkan' AND OLD.status='evaluasi' AND
    (NEW.evaluation_period_id IS DISTINCT FROM OLD.evaluation_period_id OR NEW.evaluation_started_at IS DISTINCT FROM OLD.evaluation_started_at) THEN
    RAISE EXCEPTION 'TNA_EVALUATION_IMMUTABLE';
  END IF;
  NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END;
$$;

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
      OR NEW.eval_findings IS NOT NULL OR NEW.eval_sessions IS NOT NULL OR NEW.audited_in_eval IS NOT NULL) THEN
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
    AND OLD.eval_findings IS NULL AND OLD.eval_sessions IS NULL AND OLD.audited_in_eval IS NULL
    AND (to_jsonb(NEW)-'eval_findings'-'eval_sessions'-'audited_in_eval')=(to_jsonb(OLD)-'eval_findings'-'eval_sessions'-'audited_in_eval')
    AND ((NEW.audited_in_eval=false AND NEW.eval_findings IS NULL AND NEW.eval_sessions IS NULL) OR
      (NEW.audited_in_eval=true AND NEW.eval_findings IS NOT NULL AND NEW.eval_sessions IS NOT NULL)) THEN RETURN NEW; END IF;
  IF TG_OP='UPDATE' AND parent_status='selesai' AND
    (NEW.eval_findings IS DISTINCT FROM OLD.eval_findings OR NEW.eval_sessions IS DISTINCT FROM OLD.eval_sessions OR NEW.audited_in_eval IS DISTINCT FROM OLD.audited_in_eval) THEN
    RAISE EXCEPTION 'TNA_EVALUATION_IMMUTABLE';
  END IF;
  RAISE EXCEPTION 'TNA_PARTICIPANTS_IMMUTABLE';
END;
$$;

-- Keep the exact five-argument activation interface. Optional sessions are
-- independent of findings and omitted/null remains SQL NULL.
CREATE OR REPLACE FUNCTION public.tna_activate_plan(p_actor_id uuid, p_plan_id uuid, p_expected_updated_at timestamptz,
  p_baseline jsonb, p_participant_baselines jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_plans; roster_count integer; match_count integer;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  SELECT * INTO result FROM public.tna_plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND OR result.status<>'draft' OR result.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  IF p_baseline->>'auditStatus'='no_audit' THEN RAISE EXCEPTION 'TNA_BASELINE_NO_AUDIT'; END IF;
  IF coalesce((p_baseline->>'findings')::integer,0)=0 THEN RAISE EXCEPTION 'TNA_BASELINE_NO_FINDINGS'; END IF;
  IF jsonb_typeof(p_baseline) IS DISTINCT FROM 'object' OR p_baseline->>'auditStatus' IS DISTINCT FROM 'audited'
    OR jsonb_typeof(p_baseline->'ratePer100') IS DISTINCT FROM 'number' OR jsonb_typeof(p_baseline->'spreadPct') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'TNA_INVALID_BASELINE'; END IF;
  IF NOT (result.target_max_rate_per_100 < (p_baseline->>'ratePer100')::numeric OR result.target_max_spread_pct < (p_baseline->>'spreadPct')::numeric) THEN RAISE EXCEPTION 'TNA_TARGET_NOT_BETTER'; END IF;
  IF jsonb_typeof(p_participant_baselines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'TNA_BASELINE_PARTICIPANT_MISMATCH'; END IF;
  SELECT count(*) INTO roster_count FROM public.tna_plan_participants WHERE plan_id=p_plan_id;
  IF jsonb_array_length(p_participant_baselines)<>roster_count THEN RAISE EXCEPTION 'TNA_BASELINE_PARTICIPANT_MISMATCH'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_participant_baselines) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object'
    OR ((SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k) IS DISTINCT FROM ARRAY['baseline_findings','peserta_id','was_affected']::text[]
      AND (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k) IS DISTINCT FROM ARRAY['baseline_findings','baseline_sessions','peserta_id','was_affected']::text[])
    OR (x->'peserta_id' IS DISTINCT FROM 'null'::jsonb AND jsonb_typeof(x->'peserta_id') IS DISTINCT FROM 'string')
    OR jsonb_typeof(x->'baseline_findings') IS DISTINCT FROM 'number' OR (x->'baseline_findings')::text::numeric<0 OR (x->'baseline_findings')::text::numeric<>trunc((x->'baseline_findings')::text::numeric) OR (x->'baseline_findings')::text::numeric>2147483647
    OR jsonb_typeof(x->'was_affected') IS DISTINCT FROM 'boolean'
    OR (x ? 'baseline_sessions' AND x->'baseline_sessions'<>'null'::jsonb AND
      (jsonb_typeof(x->'baseline_sessions') IS DISTINCT FROM 'number' OR (x->'baseline_sessions')::text::numeric<0 OR (x->'baseline_sessions')::text::numeric<>trunc((x->'baseline_sessions')::text::numeric) OR (x->'baseline_sessions')::text::numeric>2147483647) ) ) THEN
    RAISE EXCEPTION 'TNA_BASELINE_PARTICIPANT_MISMATCH';
  END IF;
  IF (SELECT count(*) FROM public.tna_plan_participants WHERE plan_id=p_plan_id AND peserta_id IS NULL)>1
    OR (SELECT count(DISTINCT coalesce(x->>'peserta_id','null')) FROM jsonb_array_elements(p_participant_baselines) x)<>roster_count THEN
    RAISE EXCEPTION 'TNA_BASELINE_PARTICIPANT_MISMATCH';
  END IF;
  SELECT count(DISTINCT p.id) INTO match_count FROM public.tna_plan_participants p
    JOIN jsonb_array_elements(p_participant_baselines) x ON
      (x->>'peserta_id' IS NULL AND p.peserta_id IS NULL) OR (x->>'peserta_id'=p.peserta_id::text)
    WHERE p.plan_id=p_plan_id AND (x->>'was_affected')::boolean=((x->>'baseline_findings')::integer>0);
  IF roster_count=0 OR match_count<>roster_count THEN RAISE EXCEPTION 'TNA_BASELINE_PARTICIPANT_MISMATCH'; END IF;
  UPDATE public.tna_plans SET status='aktif',baseline_snapshot=p_baseline,activated_at=clock_timestamp()
    WHERE id=p_plan_id AND status='draft' AND updated_at=p_expected_updated_at RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  PERFORM set_config('tna.activating_plan',p_plan_id::text,true);
  UPDATE public.tna_plan_participants p SET baseline_findings=(x->>'baseline_findings')::integer,
    was_affected=(x->>'was_affected')::boolean,
    baseline_sessions=CASE WHEN x ? 'baseline_sessions' AND x->'baseline_sessions'<>'null'::jsonb THEN (x->>'baseline_sessions')::integer ELSE NULL END
    FROM jsonb_array_elements(p_participant_baselines) x WHERE p.plan_id=p_plan_id AND
      ((x->>'peserta_id' IS NULL AND p.peserta_id IS NULL) OR x->>'peserta_id'=p.peserta_id::text);
  PERFORM set_config('tna.activating_plan','',true);
  RETURN to_jsonb(result);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('tna.activating_plan','',true); RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.tna_cancel_plan(p_actor_id uuid,p_plan_id uuid,p_expected_updated_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,tna_internal AS $$
DECLARE result public.tna_plans;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  SELECT * INTO result FROM public.tna_plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_NOT_FOUND'; END IF;
  IF result.status IN ('aktif','evaluasi') THEN RAISE EXCEPTION 'TNA_CANCEL_REASON_REQUIRED'; END IF;
  IF result.status<>'draft' THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  IF result.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'TNA_PLAN_STALE'; END IF;
  UPDATE public.tna_plans SET status='dibatalkan',cancelled_at=clock_timestamp() WHERE id=p_plan_id RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$$;

CREATE FUNCTION public.tna_cancel_plan(p_actor_id uuid,p_plan_id uuid,p_expected_updated_at timestamptz,p_cancel_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,tna_internal AS $$
DECLARE result public.tna_plans; reason text;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  SELECT * INTO result FROM public.tna_plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_NOT_FOUND'; END IF;
  IF result.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'TNA_PLAN_STALE'; END IF;
  reason := nullif(btrim(p_cancel_reason),'');
  IF result.status IN ('aktif','evaluasi') AND reason IS NULL THEN RAISE EXCEPTION 'TNA_CANCEL_REASON_REQUIRED'; END IF;
  IF reason IS NOT NULL AND char_length(reason) NOT BETWEEN 10 AND 1000 THEN RAISE EXCEPTION 'TNA_INVALID_CANCEL_REASON'; END IF;
  IF result.status NOT IN ('draft','aktif','evaluasi') THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  UPDATE public.tna_plans SET status='dibatalkan',cancelled_at=clock_timestamp(),cancel_reason=reason WHERE id=p_plan_id RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$$;

CREATE FUNCTION tna_internal.valid_eval_period(p_period uuid,p_end_date date) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.qa_periods q WHERE q.id=p_period
    AND (q.year*100+q.month) > (extract(year FROM p_end_date)::int*100+extract(month FROM p_end_date)::int))
$$;

CREATE FUNCTION public.tna_start_plan_evaluation(p_actor_id uuid,p_plan_id uuid,p_expected_updated_at timestamptz,p_evaluation_period_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,tna_internal AS $$
DECLARE result public.tna_plans;
BEGIN
  PERFORM tna_internal.assert_service_role(); PERFORM tna_internal.require_actor(p_actor_id);
  SELECT * INTO result FROM public.tna_plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_NOT_FOUND'; END IF;
  IF result.status<>'aktif' THEN RAISE EXCEPTION 'TNA_PLAN_NOT_ACTIVE'; END IF;
  IF result.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'TNA_PLAN_STALE'; END IF;
  IF (clock_timestamp() AT TIME ZONE 'Asia/Jakarta')::date < result.evaluation_due_date THEN RAISE EXCEPTION 'TNA_EVALUATION_NOT_DUE'; END IF;
  IF NOT tna_internal.valid_eval_period(p_evaluation_period_id,result.end_date) THEN RAISE EXCEPTION 'TNA_EVALUATION_PERIOD_INVALID'; END IF;
  PERFORM set_config('tna.evaluation_period_plan',p_plan_id::text,true);
  UPDATE public.tna_plans SET status='evaluasi',evaluation_period_id=p_evaluation_period_id,evaluation_started_at=clock_timestamp() WHERE id=p_plan_id RETURNING * INTO result;
  PERFORM set_config('tna.evaluation_period_plan','',true);
  RETURN to_jsonb(result);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('tna.evaluation_period_plan','',true); RAISE;
END;
$$;

CREATE FUNCTION public.tna_update_evaluation_period(p_actor_id uuid,p_plan_id uuid,p_expected_updated_at timestamptz,p_evaluation_period_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,tna_internal AS $$
DECLARE result public.tna_plans;
BEGIN
  PERFORM tna_internal.assert_service_role(); PERFORM tna_internal.require_actor(p_actor_id);
  SELECT * INTO result FROM public.tna_plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_NOT_FOUND'; END IF;
  IF result.status<>'evaluasi' THEN RAISE EXCEPTION 'TNA_PLAN_NOT_EVALUATING'; END IF;
  IF result.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'TNA_PLAN_STALE'; END IF;
  IF NOT tna_internal.valid_eval_period(p_evaluation_period_id,result.end_date) THEN RAISE EXCEPTION 'TNA_EVALUATION_PERIOD_INVALID'; END IF;
  PERFORM set_config('tna.evaluation_period_plan',p_plan_id::text,true);
  UPDATE public.tna_plans SET evaluation_period_id=p_evaluation_period_id WHERE id=p_plan_id RETURNING * INTO result;
  PERFORM set_config('tna.evaluation_period_plan','',true);
  RETURN to_jsonb(result);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('tna.evaluation_period_plan','',true); RAISE;
END;
$$;

-- Strict shape/type validation is centralized; malformed JSON is normalized to
-- the stable TNA_INVALID_EVALUATION token rather than leaking cast errors.
CREATE FUNCTION tna_internal.validate_evaluation_snapshot(p jsonb,p_period uuid,p_verdict text,p_rate numeric,p_spread numeric) RETURNS void
LANGUAGE plpgsql SET search_path=public,tna_internal AS $$
DECLARE pop jsonb; cohorts jsonb; cmp jsonb; b jsonb; d jsonb;
BEGIN
  IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p) k) IS DISTINCT FROM ARRAY['baseline_recompute_drift','cohorts','computed_at','evaluation_period_id','metric_version','population','verdict']::text[] THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF jsonb_typeof(p->'metric_version')<>'number' OR (p->>'metric_version')::numeric<>1 OR (p->>'metric_version')::numeric<>trunc((p->>'metric_version')::numeric) OR (p->>'evaluation_period_id') IS DISTINCT FROM p_period::text OR p->>'verdict' IS DISTINCT FROM p_verdict THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  BEGIN
    IF jsonb_typeof(p->'computed_at') IS DISTINCT FROM 'string'
      OR ((p->>'computed_at') ~ '^\d{4}-\d\d-\d\d[Tt].*([Zz]|[+-]\d\d:\d\d)$') IS NOT TRUE THEN RAISE EXCEPTION 'invalid timestamp'; END IF;
    PERFORM (p->>'computed_at')::timestamptz;
  EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END;
  pop:=p->'population';
  IF jsonb_typeof(pop) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(pop) k) IS DISTINCT FROM ARRAY['affectedAgents','auditedAgents','auditStatus','findings','insufficientData','periodId','ratePer100','sampledSessions','spreadPct']::text[] THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF pop->>'periodId' IS DISTINCT FROM p_period::text THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF pop->>'auditStatus'='no_audit' THEN RAISE EXCEPTION 'TNA_EVALUATION_NO_AUDIT'; END IF;
  IF pop->>'auditStatus' IS DISTINCT FROM 'audited' OR jsonb_typeof(pop->'insufficientData') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF EXISTS (SELECT 1 FROM (VALUES (pop->'auditedAgents'),(pop->'sampledSessions'),(pop->'findings'),(pop->'affectedAgents')) n(x)
    WHERE jsonb_typeof(x)<>'number' OR (x#>>'{}')::numeric<0 OR (x#>>'{}')::numeric<>trunc((x#>>'{}')::numeric)) THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF (pop->>'auditedAgents')::numeric<=0 OR (pop->>'sampledSessions')::numeric<=0 OR (pop->>'affectedAgents')::numeric>(pop->>'auditedAgents')::numeric THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF jsonb_typeof(pop->'ratePer100')<>'number' OR jsonb_typeof(pop->'spreadPct')<>'number' THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF (pop->>'ratePer100')::numeric<0 OR (pop->>'spreadPct')::numeric NOT BETWEEN 0 AND 100 THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF p_verdict IS DISTINCT FROM (CASE WHEN (pop->>'ratePer100')::numeric<=p_rate AND (pop->>'spreadPct')::numeric<=p_spread THEN 'tercapai' WHEN ((pop->>'ratePer100')::numeric<=p_rate) <> ((pop->>'spreadPct')::numeric<=p_spread) THEN 'tercapai_sebagian' ELSE 'tidak_tercapai' END) THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF jsonb_typeof(p->'baseline_recompute_drift') IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p->'baseline_recompute_drift') k) IS DISTINCT FROM ARRAY['auditedAgents','findings']::text[] THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF EXISTS (SELECT 1 FROM jsonb_each(p->'baseline_recompute_drift') x WHERE jsonb_typeof(x.value)<>'number' OR (x.value#>>'{}')::numeric<>trunc((x.value#>>'{}')::numeric)) THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  cohorts:=p->'cohorts';
  IF jsonb_typeof(cohorts) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(cohorts) k) IS DISTINCT FROM ARRAY['comparison','comparison_small','net_effect','participants']::text[] OR jsonb_typeof(cohorts->'comparison_small')<>'boolean' THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF (cohorts->>'comparison_small')::boolean AND cohorts->'net_effect'<>'null'::jsonb THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  FOREACH cmp IN ARRAY ARRAY[cohorts->'participants',cohorts->'comparison'] LOOP
    IF jsonb_typeof(cmp) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(cmp) k) IS DISTINCT FROM ARRAY['baseline','delta','evaluation']::text[] THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
    FOREACH b IN ARRAY ARRAY[cmp->'baseline',cmp->'evaluation'] LOOP
      IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(b) k) IS DISTINCT FROM ARRAY['agents','findings','ratePer100','sampledSessions','spreadPct']::text[] THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
      IF EXISTS (SELECT 1 FROM (VALUES(b->'agents'),(b->'findings'),(b->'sampledSessions')) n(x) WHERE jsonb_typeof(x)<>'number' OR (x#>>'{}')::numeric<0 OR (x#>>'{}')::numeric<>trunc((x#>>'{}')::numeric)) THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
      IF EXISTS (SELECT 1 FROM (VALUES(b->'ratePer100'),(b->'spreadPct')) n(x) WHERE x<>'null'::jsonb AND (jsonb_typeof(x)<>'number' OR (x#>>'{}')::numeric<0)) THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
      IF b->'spreadPct'<>'null'::jsonb AND (b->>'spreadPct')::numeric>100 THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
    END LOOP;
    d:=cmp->'delta';
    IF d<>'null'::jsonb AND jsonb_typeof(d) IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  END LOOP;
  IF ((cohorts->'comparison'->'baseline'->>'agents')::numeric<5 OR (cohorts->'comparison'->'evaluation'->>'agents')::numeric<5)
    IS DISTINCT FROM (cohorts->>'comparison_small')::boolean OR
    ((cohorts->>'comparison_small')::boolean AND cohorts->'net_effect'<>'null'::jsonb) THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF ((cohorts->'participants'->'baseline'->>'agents')::numeric<5
      OR (cohorts->'participants'->'evaluation'->>'agents')::numeric<5)
    AND cohorts->'net_effect' IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
  IF cohorts->'net_effect'<>'null'::jsonb AND jsonb_typeof(cohorts->'net_effect')<>'number' THEN RAISE EXCEPTION 'TNA_INVALID_EVALUATION'; END IF;
END;
$$;

-- Direct privileged SQL must be able to pass the same trigger validation; this
-- private schema remains absent from PostgREST's exposed-schema list.
GRANT USAGE ON SCHEMA tna_internal TO service_role;

CREATE FUNCTION public.tna_complete_plan(p_actor_id uuid,p_plan_id uuid,p_expected_updated_at timestamptz,p_evaluation_snapshot jsonb,
  p_participant_evaluations jsonb,p_verdict text,p_conclusion_note text,p_follow_up text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,tna_internal AS $$
DECLARE result public.tna_plans; n integer; matched integer;
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
    WHERE jsonb_typeof(x)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x) k) IS DISTINCT FROM ARRAY['audited_in_eval','eval_findings','eval_sessions','participant_id']::text[]
      OR jsonb_typeof(x->'participant_id')<>'string' OR jsonb_typeof(x->'audited_in_eval')<>'boolean'
      OR ((x->>'audited_in_eval')='false' AND (x->'eval_findings'<>'null'::jsonb OR x->'eval_sessions'<>'null'::jsonb))
      OR ((x->>'audited_in_eval')='true' AND (jsonb_typeof(x->'eval_findings')<>'number' OR jsonb_typeof(x->'eval_sessions')<>'number'
        OR (x->'eval_findings')::text::numeric<0 OR (x->'eval_findings')::text::numeric<>trunc((x->'eval_findings')::text::numeric)
        OR (x->'eval_sessions')::text::numeric<0 OR (x->'eval_sessions')::text::numeric<>trunc((x->'eval_sessions')::text::numeric) OR (x->'eval_sessions')::text::numeric>2147483647
        OR (x->'eval_findings')::text::numeric>2147483647)) ) THEN RAISE EXCEPTION 'TNA_EVALUATION_PARTICIPANT_MISMATCH'; END IF;
  SELECT count(DISTINCT p.id) INTO matched FROM public.tna_plan_participants p JOIN jsonb_array_elements(p_participant_evaluations) x ON x->>'participant_id'=p.id::text WHERE p.plan_id=p_plan_id;
  IF matched<>n THEN RAISE EXCEPTION 'TNA_EVALUATION_PARTICIPANT_MISMATCH'; END IF;
  PERFORM set_config('tna.completing_plan',p_plan_id::text,true);
  UPDATE public.tna_plan_participants p SET audited_in_eval=(x->>'audited_in_eval')::boolean,
    eval_findings=CASE WHEN x->>'audited_in_eval'='true' THEN (x->>'eval_findings')::integer ELSE NULL END,
    eval_sessions=CASE WHEN x->>'audited_in_eval'='true' THEN (x->>'eval_sessions')::integer ELSE NULL END
    FROM jsonb_array_elements(p_participant_evaluations) x WHERE p.plan_id=p_plan_id AND x->>'participant_id'=p.id::text;
  UPDATE public.tna_plans SET status='selesai',evaluation_snapshot=p_evaluation_snapshot,verdict=p_verdict,
    conclusion_note=btrim(p_conclusion_note),follow_up=p_follow_up,completed_at=clock_timestamp()
    WHERE id=p_plan_id RETURNING * INTO result;
  PERFORM set_config('tna.completing_plan','',true);
  RETURN to_jsonb(result);
EXCEPTION WHEN OTHERS THEN PERFORM set_config('tna.completing_plan','',true); RAISE;
END;
$$;

-- Public exposed mutators keep PostgreSQL's default EXECUTE path. Their first
-- executable statement is always the in-function role guard.
GRANT EXECUTE ON FUNCTION public.tna_start_plan_evaluation(uuid,uuid,timestamptz,uuid),
  public.tna_update_evaluation_period(uuid,uuid,timestamptz,uuid),
  public.tna_complete_plan(uuid,uuid,timestamptz,jsonb,jsonb,text,text,text),
  public.tna_cancel_plan(uuid,uuid,timestamptz,text) TO anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
COMMIT;
