-- TNA phase 1, rev. 6. Apply locally only until remote migration is authorized.
--
-- Write path: clients only read tna_* tables. All mutations go through five
-- public functions that only service_role may effectively run. Rejection is an
-- in-function guard (tna_internal.assert_service_role), NOT a revoked EXECUTE:
-- on supabase/postgres 17.6.1.x, calling a function whose EXECUTE was revoked
-- from the caller crashes the backend (signal 11; supabase/postgres#2377,
-- #2495, supabase/supabase#50900). Never REVOKE EXECUTE on these entry points.
-- Helpers and trigger functions live in tna_internal, which is neither exposed
-- to PostgREST nor usable by client roles, so they are unreachable via the API.
BEGIN;

CREATE SCHEMA tna_internal;
REVOKE ALL ON SCHEMA tna_internal FROM PUBLIC, anon, authenticated;

CREATE TABLE public.tna_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL,
  name text NOT NULL, description text NOT NULL,
  gap_type text NOT NULL CHECK (gap_type IN ('knowledge','skill','proses','perilaku')),
  trigger_clusters text[] NOT NULL DEFAULT '{}', service_types text[] NOT NULL DEFAULT '{}',
  suggested_modules text[] NOT NULL DEFAULT '{}', is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tna_needs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_type text NOT NULL CHECK (service_type IN ('call','chat','email','cso','pencatatan','bko','slik')),
  indicator_id uuid NOT NULL REFERENCES public.qa_indicators(id) ON DELETE RESTRICT,
  period_id uuid NOT NULL REFERENCES public.qa_periods(id) ON DELETE RESTRICT,
  compare_count integer NOT NULL CHECK (compare_count BETWEEN 1 AND 6),
  validation_snapshot jsonb NOT NULL CHECK (jsonb_typeof(validation_snapshot) = 'object'),
  suggested_cluster_id text, validated_cluster_id text NOT NULL,
  cause_note text NOT NULL CHECK (char_length(btrim(cause_note)) BETWEEN 10 AND 2000),
  gap_type text NOT NULL CHECK (gap_type IN ('knowledge','skill','proses','perilaku')),
  outcome text NOT NULL CHECK (outcome IN ('training','eskalasi_non_training')),
  created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.tna_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  need_id uuid NOT NULL REFERENCES public.tna_needs(id) ON DELETE RESTRICT,
  program_id uuid NOT NULL REFERENCES public.tna_programs(id) ON DELETE RESTRICT,
  title text NOT NULL CHECK (char_length(btrim(title)) BETWEEN 5 AND 160),
  intervention_type text NOT NULL CHECK (intervention_type IN ('kelas','kelompok_kecil','coaching_individu')),
  start_date date NOT NULL, end_date date NOT NULL CHECK (end_date >= start_date),
  evaluation_due_date date NOT NULL CHECK (evaluation_due_date > end_date),
  target_max_rate_per_100 numeric NOT NULL CHECK (target_max_rate_per_100 BETWEEN 0 AND 100),
  target_max_spread_pct numeric NOT NULL CHECK (target_max_spread_pct BETWEEN 0 AND 100),
  baseline_snapshot jsonb, status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','aktif','evaluasi','selesai','dibatalkan')),
  activated_at timestamptz, cancelled_at timestamptz,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX uq_tna_plans_open_need ON public.tna_plans(need_id) WHERE status <> 'dibatalkan';
CREATE INDEX idx_tna_needs_service_period ON public.tna_needs(service_type, period_id);
CREATE INDEX idx_tna_plans_status ON public.tna_plans(status);
CREATE TABLE public.tna_plan_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.tna_plans(id) ON DELETE CASCADE,
  peserta_id uuid REFERENCES public.profiler_peserta(id) ON DELETE SET NULL,
  peserta_name_snapshot text NOT NULL, team_snapshot text,
  baseline_findings integer CHECK (baseline_findings >= 0), was_affected boolean,
  UNIQUE (plan_id, peserta_id)
);
CREATE INDEX idx_tna_participants_plan ON public.tna_plan_participants(plan_id);

ALTER TABLE public.tna_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tna_needs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tna_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tna_plan_participants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.tna_programs, public.tna_needs, public.tna_plans, public.tna_plan_participants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.tna_programs, public.tna_needs, public.tna_plans, public.tna_plan_participants TO authenticated;
GRANT ALL ON public.tna_programs, public.tna_needs, public.tna_plans, public.tna_plan_participants TO service_role;
CREATE POLICY tna_programs_read ON public.tna_programs FOR SELECT TO authenticated USING (public.is_admin_or_trainer());
CREATE POLICY tna_needs_read ON public.tna_needs FOR SELECT TO authenticated USING (public.is_admin_or_trainer());
CREATE POLICY tna_plans_read ON public.tna_plans FOR SELECT TO authenticated USING (public.is_admin_or_trainer());
CREATE POLICY tna_participants_read ON public.tna_plan_participants FOR SELECT TO authenticated USING (public.is_admin_or_trainer());

CREATE FUNCTION tna_internal.assert_service_role() RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE jwt_role text;
BEGIN
  -- PostgREST puts the verified JWT claims in this GUC. Absent, empty, or
  -- malformed claims must reject, never fall through to execution.
  BEGIN
    jwt_role := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  EXCEPTION WHEN others THEN
    jwt_role := NULL;
  END;
  -- current_user/session_user are deliberately ignored: inside SECURITY DEFINER
  -- they are the owner/authenticator, not the caller.
  IF jwt_role IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'TNA_FORBIDDEN' USING ERRCODE = '42501';
  END IF;
END;
$$;

CREATE FUNCTION tna_internal.require_actor(p_actor_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=p_actor_id
    AND role IN ('admin','trainer') AND status='active' AND NOT coalesce(is_deleted,false)) THEN
    RAISE EXCEPTION 'TNA_ACTOR_FORBIDDEN';
  END IF;
END;
$$;

CREATE FUNCTION tna_internal.guard_need() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'TNA_NEED_IMMUTABLE';
END;
$$;
CREATE TRIGGER tna_need_immutable BEFORE UPDATE ON public.tna_needs
FOR EACH ROW EXECUTE FUNCTION tna_internal.guard_need();

CREATE FUNCTION tna_internal.guard_plan() RETURNS trigger
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
    OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'TNA_PLAN_IDENTITY_IMMUTABLE';
  END IF;
  IF NEW.baseline_snapshot IS DISTINCT FROM OLD.baseline_snapshot OR NEW.activated_at IS DISTINCT FROM OLD.activated_at THEN
    IF NOT (OLD.status='draft' AND NEW.status='aktif' AND OLD.baseline_snapshot IS NULL
      AND OLD.activated_at IS NULL AND NEW.baseline_snapshot IS NOT NULL AND NEW.activated_at IS NOT NULL) THEN
      RAISE EXCEPTION 'TNA_BASELINE_IMMUTABLE';
    END IF;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
    (OLD.status='draft' AND NEW.status IN ('aktif','dibatalkan')) OR (OLD.status='aktif' AND NEW.status='dibatalkan')) THEN
    RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT';
  END IF;
  IF NEW.status='aktif' AND (NEW.baseline_snapshot IS NULL OR NEW.activated_at IS NULL) THEN
    RAISE EXCEPTION 'TNA_BASELINE_REQUIRED';
  END IF;
  IF OLD.status <> 'draft' AND (NEW.title IS DISTINCT FROM OLD.title
    OR NEW.intervention_type IS DISTINCT FROM OLD.intervention_type OR NEW.start_date IS DISTINCT FROM OLD.start_date
    OR NEW.end_date IS DISTINCT FROM OLD.end_date OR NEW.evaluation_due_date IS DISTINCT FROM OLD.evaluation_due_date
    OR NEW.target_max_rate_per_100 IS DISTINCT FROM OLD.target_max_rate_per_100
    OR NEW.target_max_spread_pct IS DISTINCT FROM OLD.target_max_spread_pct) THEN
    RAISE EXCEPTION 'TNA_PLAN_NOT_DRAFT';
  END IF;
  IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at AND NOT (
    OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL AND NEW.status='dibatalkan' AND OLD.status IN ('draft','aktif')) THEN
    RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT';
  END IF;
  -- Clock time gives successive RPCs in one transaction different revisions.
  NEW.updated_at := greatest(clock_timestamp(), OLD.updated_at + interval '1 microsecond');
  RETURN NEW;
END;
$$;
CREATE TRIGGER tna_plan_guard BEFORE INSERT OR UPDATE ON public.tna_plans
FOR EACH ROW EXECUTE FUNCTION tna_internal.guard_plan();

CREATE FUNCTION tna_internal.guard_participant() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE parent_status text; parent_id uuid;
BEGIN
  parent_id := CASE WHEN TG_OP='DELETE' THEN OLD.plan_id ELSE NEW.plan_id END;
  IF TG_OP='UPDATE' AND (NEW.id IS DISTINCT FROM OLD.id OR NEW.plan_id IS DISTINCT FROM OLD.plan_id) THEN
    RAISE EXCEPTION 'TNA_PARTICIPANT_IDENTITY_IMMUTABLE';
  END IF;
  -- Allow only actual FK cleanup, never a caller nulling a live participant.
  IF TG_OP='UPDATE' AND OLD.peserta_id IS NOT NULL AND NEW.peserta_id IS NULL
    AND (to_jsonb(NEW)-'peserta_id') = (to_jsonb(OLD)-'peserta_id')
    AND NOT EXISTS (SELECT 1 FROM public.profiler_peserta WHERE id=OLD.peserta_id) THEN
    RETURN NEW;
  END IF;
  SELECT status INTO parent_status FROM public.tna_plans WHERE id=parent_id FOR UPDATE;
  -- Internal FK cascade after removal of the parent, not a client delete API.
  IF TG_OP='DELETE' AND parent_status IS NULL THEN RETURN OLD; END IF;
  IF parent_status='draft' THEN
    IF TG_OP<>'DELETE' AND (NEW.baseline_findings IS NOT NULL OR NEW.was_affected IS NOT NULL) THEN
      RAISE EXCEPTION 'TNA_PARTICIPANT_BASELINE_NOT_DRAFT';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;
  IF TG_OP='UPDATE' AND parent_status='aktif'
    AND current_setting('tna.activating_plan',true)=NEW.plan_id::text
    AND OLD.baseline_findings IS NULL AND OLD.was_affected IS NULL
    AND NEW.baseline_findings IS NOT NULL AND NEW.was_affected IS NOT NULL
    AND (to_jsonb(NEW)-'baseline_findings'-'was_affected')=(to_jsonb(OLD)-'baseline_findings'-'was_affected') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'TNA_PARTICIPANTS_IMMUTABLE';
END;
$$;
CREATE TRIGGER tna_participant_guard BEFORE INSERT OR UPDATE OR DELETE ON public.tna_plan_participants
FOR EACH ROW EXECUTE FUNCTION tna_internal.guard_participant();

CREATE FUNCTION tna_internal.replace_participants(p_plan_id uuid, p_participants jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE roster_count integer; unique_count integer; existing_count integer;
BEGIN
  IF jsonb_typeof(p_participants) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'TNA_INVALID_PARTICIPANTS'; END IF;
  SELECT count(*),count(DISTINCT (x->>'peserta_id')::uuid) INTO roster_count,unique_count FROM jsonb_array_elements(p_participants) x;
  IF roster_count NOT BETWEEN 1 AND 200 OR unique_count<>roster_count THEN RAISE EXCEPTION 'TNA_INVALID_PARTICIPANTS'; END IF;
  SELECT count(*) INTO existing_count FROM public.profiler_peserta p
    JOIN jsonb_array_elements(p_participants) x ON p.id=(x->>'peserta_id')::uuid;
  IF existing_count<>roster_count THEN RAISE EXCEPTION 'TNA_INVALID_PARTICIPANTS'; END IF;
  DELETE FROM public.tna_plan_participants WHERE plan_id=p_plan_id;
  INSERT INTO public.tna_plan_participants(plan_id,peserta_id,peserta_name_snapshot,team_snapshot)
    SELECT p_plan_id,p.id,p.nama,p.tim FROM public.profiler_peserta p
    JOIN jsonb_array_elements(p_participants) x ON p.id=(x->>'peserta_id')::uuid;
END;
$$;

CREATE FUNCTION public.tna_create_need(p_actor_id uuid, p_payload jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_needs;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  IF NOT EXISTS (SELECT 1 FROM public.qa_indicators WHERE id=(p_payload->>'indicator_id')::uuid
    AND service_type=p_payload->>'service_type') THEN RAISE EXCEPTION 'TNA_INVALID_INDICATOR'; END IF;
  INSERT INTO public.tna_needs(service_type,indicator_id,period_id,compare_count,validation_snapshot,
    suggested_cluster_id,validated_cluster_id,cause_note,gap_type,outcome,created_by)
  VALUES (p_payload->>'service_type',(p_payload->>'indicator_id')::uuid,(p_payload->>'period_id')::uuid,
    (p_payload->>'compare_count')::integer,p_payload->'validation_snapshot',p_payload->>'suggested_cluster_id',
    p_payload->>'validated_cluster_id',btrim(p_payload->>'cause_note'),p_payload->>'gap_type',p_payload->>'outcome',p_actor_id)
  RETURNING * INTO result;
  RETURN to_jsonb(result);
END;
$$;

CREATE FUNCTION public.tna_create_plan(p_actor_id uuid, p_plan jsonb, p_participants jsonb) RETURNS jsonb
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
  RETURN to_jsonb(result);
EXCEPTION WHEN unique_violation THEN RAISE EXCEPTION 'TNA_PLAN_EXISTS';
END;
$$;

CREATE FUNCTION public.tna_update_draft_plan(p_actor_id uuid, p_plan_id uuid, p_expected_updated_at timestamptz,
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
  RETURN to_jsonb(result);
END;
$$;

CREATE FUNCTION public.tna_activate_plan(p_actor_id uuid, p_plan_id uuid, p_expected_updated_at timestamptz,
  p_baseline jsonb, p_participant_baselines jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_plans; roster_count integer; match_count integer;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  SELECT * INTO result FROM public.tna_plans WHERE id=p_plan_id FOR UPDATE;
  IF NOT FOUND OR result.status<>'draft' OR result.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT';
  END IF;
  IF p_baseline->>'auditStatus'='no_audit' THEN RAISE EXCEPTION 'TNA_BASELINE_NO_AUDIT'; END IF;
  IF coalesce((p_baseline->>'findings')::integer,0)=0 THEN RAISE EXCEPTION 'TNA_BASELINE_NO_FINDINGS'; END IF;
  IF jsonb_typeof(p_baseline) IS DISTINCT FROM 'object' OR p_baseline->>'auditStatus' IS DISTINCT FROM 'audited'
    OR jsonb_typeof(p_baseline->'ratePer100') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_baseline->'spreadPct') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'TNA_INVALID_BASELINE'; END IF;
  IF NOT (result.target_max_rate_per_100 < (p_baseline->>'ratePer100')::numeric
    OR result.target_max_spread_pct < (p_baseline->>'spreadPct')::numeric) THEN RAISE EXCEPTION 'TNA_TARGET_NOT_BETTER'; END IF;
  IF jsonb_typeof(p_participant_baselines) IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'TNA_BASELINE_PARTICIPANT_MISMATCH'; END IF;
  SELECT count(*) INTO roster_count FROM public.tna_plan_participants WHERE plan_id=p_plan_id;
  SELECT count(DISTINCT p.id) INTO match_count FROM public.tna_plan_participants p
    JOIN jsonb_array_elements(p_participant_baselines) x ON p.peserta_id=(x->>'peserta_id')::uuid
    WHERE p.plan_id=p_plan_id AND jsonb_typeof(x->'baseline_findings')='number'
      AND (x->>'baseline_findings')::integer>=0 AND jsonb_typeof(x->'was_affected')='boolean'
      AND (x->>'was_affected')::boolean=((x->>'baseline_findings')::integer>0);
  IF roster_count=0 OR match_count<>roster_count OR jsonb_array_length(p_participant_baselines)<>roster_count THEN
    RAISE EXCEPTION 'TNA_BASELINE_PARTICIPANT_MISMATCH';
  END IF;
  UPDATE public.tna_plans SET status='aktif',baseline_snapshot=p_baseline,activated_at=clock_timestamp()
    WHERE id=p_plan_id AND status='draft' AND updated_at=p_expected_updated_at RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  PERFORM set_config('tna.activating_plan',p_plan_id::text,true);
  UPDATE public.tna_plan_participants p SET baseline_findings=(x->>'baseline_findings')::integer,
    was_affected=(x->>'was_affected')::boolean FROM jsonb_array_elements(p_participant_baselines) x
    WHERE p.plan_id=p_plan_id AND p.peserta_id=(x->>'peserta_id')::uuid;
  PERFORM set_config('tna.activating_plan','',true);
  RETURN to_jsonb(result);
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('tna.activating_plan','',true);
  RAISE;
END;
$$;

CREATE FUNCTION public.tna_cancel_plan(p_actor_id uuid, p_plan_id uuid, p_expected_updated_at timestamptz) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, tna_internal AS $$
DECLARE result public.tna_plans;
BEGIN
  PERFORM tna_internal.assert_service_role();
  PERFORM tna_internal.require_actor(p_actor_id);
  UPDATE public.tna_plans SET status='dibatalkan',cancelled_at=clock_timestamp()
    WHERE id=p_plan_id AND status IN ('draft','aktif') AND updated_at=p_expected_updated_at RETURNING * INTO result;
  IF NOT FOUND THEN RAISE EXCEPTION 'TNA_PLAN_TRANSITION_CONFLICT'; END IF;
  RETURN to_jsonb(result);
END;
$$;

-- Unreachable anyway (no schema USAGE, not exposed); revoke for defence in depth.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA tna_internal FROM PUBLIC, anon, authenticated, service_role;
-- Explicit grant so the guard, not the crashing ACL path, rejects client roles.
GRANT EXECUTE ON FUNCTION public.tna_create_need(uuid,jsonb),public.tna_create_plan(uuid,jsonb,jsonb),
  public.tna_update_draft_plan(uuid,uuid,timestamptz,jsonb,jsonb),public.tna_activate_plan(uuid,uuid,timestamptz,jsonb,jsonb),
  public.tna_cancel_plan(uuid,uuid,timestamptz) TO anon, authenticated, service_role;

INSERT INTO public.tna_programs(code,name,description,gap_type,trigger_clusters,service_types,suggested_modules) VALUES
('effective-probing','Effective Probing & Needs Identification','Latihan menggali kebutuhan dan klarifikasi pelanggan.','skill',ARRAY['kurang_menggali'],'{}',ARRAY['telefun','ketik']),
('refreshment-standar-jawaban','Refreshment Standar Jawaban','Review pemilihan dan akurasi standar jawaban.','knowledge',ARRAY['kurang_paham_standar_jawaban','kelebihan_standar_jawaban','salah_jawaban'],'{}',ARRAY['ketik']),
('ketelitian-verifikasi-data','Ketelitian & Verifikasi Data','Latihan verifikasi data, nama perusahaan, dan produk.','skill',ARRAY['kurang_teliti_verifikasi_data','salah_nama_perusahaan_produk'],'{}',ARRAY['ketik','pdkt']),
('professional-email-handling','Professional Email Handling','Latihan menangani korespondensi email pelanggan.','skill','{}',ARRAY['email'],ARRAY['pdkt']),
('akurasi-penggunaan-sistem','Akurasi Penggunaan Sistem/APPK','Review ketepatan penggunaan sistem dan pencatatan.','proses',ARRAY['salah_penggunaan_sistem'],'{}','{}'),
('coaching-individu','Coaching Individu oleh Leader','Pendampingan individu sesuai kebutuhan tervalidasi.','perilaku','{}','{}','{}'),
('post-ojt-reinforcement','Post-OJT Reinforcement','Penguatan keterampilan setelah OJT.','skill','{}','{}',ARRAY['ketik','pdkt','telefun'])
ON CONFLICT (code) DO NOTHING;

NOTIFY pgrst, 'reload schema';
COMMIT;
