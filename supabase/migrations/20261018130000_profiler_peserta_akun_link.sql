-- Migration: profiler_peserta_akun_link
-- Lane D. Additive: one nullable column per table, a server-only link RPC,
-- and a conservative copy of existing agent/leader links from trainer_id.
--
-- profiler_peserta.akun_id is the app account that belongs to a KTP
-- participant. It replaces trainer_id as the link the API reads for the
-- agent "self" data scope; trainer_id was filled inconsistently and stays as
-- a legacy column. One account links to at most one participant and one
-- participant to at most one account (partial unique index). The admin API
-- (service role) writes it and logs the change. RLS is unchanged: only
-- admin/trainer rows pass write_trainer, the same people the API allows, and
-- the KTP update endpoint strips the column so the editor cannot set it.
--
-- activity_logs.target_user_id lets the user page list changes made to one
-- account without parsing the free-text action column.

ALTER TABLE public.profiler_peserta
  ADD COLUMN IF NOT EXISTS akun_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiler_peserta_akun_id_key
  ON public.profiler_peserta (akun_id)
  WHERE akun_id IS NOT NULL;

COMMENT ON COLUMN public.profiler_peserta.akun_id IS
  'App account linked to this participant (1:1). Written only by the admin API.';

-- Link (or move) an account to a participant in one transaction: the row
-- lock serializes concurrent links, and the subtransaction rolls back the
-- unlink of the previous participant if the new link loses a race.
-- Returns linked | unchanged | taken | not_found. Server only.
CREATE OR REPLACE FUNCTION public.link_profiler_peserta_account(
  p_akun_id uuid,
  p_peserta_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
BEGIN
  SELECT akun_id INTO v_owner
    FROM public.profiler_peserta
   WHERE id = p_peserta_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_found';
  END IF;
  IF v_owner = p_akun_id THEN
    RETURN 'unchanged';
  END IF;
  IF v_owner IS NOT NULL THEN
    RETURN 'taken';
  END IF;
  BEGIN
    UPDATE public.profiler_peserta SET akun_id = NULL WHERE akun_id = p_akun_id;
    UPDATE public.profiler_peserta SET akun_id = p_akun_id WHERE id = p_peserta_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN 'taken';
  END;
  RETURN 'linked';
END;
$$;

REVOKE ALL ON FUNCTION public.link_profiler_peserta_account(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.link_profiler_peserta_account(uuid, uuid)
  TO service_role;

-- Keep links that already exist under the legacy column: a trainer_id that
-- points at an agent or leader account, used by exactly one participant, is
-- a real account link (trainer/admin ids there mean "added by").
UPDATE public.profiler_peserta pp
   SET akun_id = pp.trainer_id
  FROM public.profiles pr
 WHERE pr.id = pp.trainer_id
   AND pr.role IN ('agent', 'leader')
   AND pp.akun_id IS NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.profiler_peserta other
      WHERE other.trainer_id = pp.trainer_id AND other.id <> pp.id
   )
   AND NOT EXISTS (
     SELECT 1 FROM public.profiler_peserta linked
      WHERE linked.akun_id = pp.trainer_id
   );

ALTER TABLE public.activity_logs
  ADD COLUMN IF NOT EXISTS target_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS activity_logs_target_user_created_idx
  ON public.activity_logs (target_user_id, created_at DESC)
  WHERE target_user_id IS NOT NULL;

-- Monitoring reads the actor's participant through the same link. Same view
-- as 20261018090000_monitoring_sessions with trainer_id replaced by akun_id;
-- the column list is unchanged, so CREATE OR REPLACE keeps grants.
create or replace view public.monitoring_sessions
with (security_invoker = true) as
with sessions as (
  select
    'ketik'::text as module,
    k.id,
    k.user_id,
    k.date as occurred_at,
    coalesce(nullif(k.scenario_title, ''), 'Simulasi Chat') as scenario_title,
    k.consumer_name,
    null::integer as duration_seconds,
    k.messages -> 0 ->> 'timestamp' as first_message_at,
    k.messages -> -1 ->> 'timestamp' as last_message_at,
    k.final_score::numeric as score,
    case
      when k.review_status in ('pending', 'processing', 'completed', 'failed')
        then k.review_status
      else 'not_started'
    end as review_status,
    k.simulation_subject_type as subject_type,
    k.simulation_subject_peserta_id as subject_peserta_id,
    k.simulation_subject_name as subject_name,
    k.simulation_subject_batch_name as subject_batch_name,
    k.simulation_subject_team as subject_team,
    false as legacy
  from public.ketik_history k

  union all

  select
    'pdkt',
    p.id,
    p.user_id,
    coalesce(p."timestamp", p.created_at),
    coalesce(nullif(p.config -> 'scenarios' -> 0 ->> 'title', ''), 'Simulasi Email'),
    coalesce(
      p.config -> 'identity' ->> 'name',
      p.config -> 'identity' ->> 'bodyName'
    ),
    p.time_taken,
    null,
    null,
    case
      when jsonb_typeof(p.evaluation -> 'score') = 'number'
        then (p.evaluation ->> 'score')::numeric
    end,
    case
      when p.evaluation_status in ('pending', 'processing', 'completed', 'failed')
        then p.evaluation_status
      else 'not_started'
    end,
    p.simulation_subject_type,
    p.simulation_subject_peserta_id,
    p.simulation_subject_name,
    p.simulation_subject_batch_name,
    p.simulation_subject_team,
    false
  from public.pdkt_history p

  union all

  select
    'telefun',
    t.id,
    t.user_id,
    t.created_at,
    coalesce(nullif(t.scenario_title, ''), 'Simulasi Telepon'),
    t.consumer_name,
    t.duration_seconds,
    null,
    null,
    coalesce(
      case
        when jsonb_typeof(t.voice_assessment -> 'overallScore') = 'number'
          then (t.voice_assessment ->> 'overallScore')::numeric
      end,
      t.score
    ),
    -- Sama dengan riwayat simulasi SIDAK (agent-simulations.ts).
    case
      when t.scoring_status is not null then
        case
          when t.scoring_status in ('pending', 'processing', 'completed', 'failed')
            then t.scoring_status
          else 'not_started'
        end
      when t.status = 'pending' then 'pending'
      when t.status = 'active' then 'processing'
      when t.status = 'failed' then 'failed'
      when t.score is null then 'not_started'
      else 'completed'
    end,
    t.simulation_subject_type,
    t.simulation_subject_peserta_id,
    t.simulation_subject_name,
    t.simulation_subject_batch_name,
    t.simulation_subject_team,
    false
  from public.telefun_history t

  union all

  select
    'telefun',
    r.id,
    r.user_id,
    r.created_at,
    coalesce(
      nullif(r.details ->> 'scenario', ''),
      nullif(r.details ->> 'scenario_title', ''),
      'Simulasi Telepon'
    ),
    null,
    case
      when jsonb_typeof(r.details -> 'duration') = 'number'
        then (r.details ->> 'duration')::numeric::integer
    end,
    null,
    null,
    r.score::numeric,
    case when r.score is null then 'not_started' else 'completed' end,
    null,
    null,
    null,
    null,
    null,
    true
  from public.results r
  where r.module = 'telefun'
    and not exists (select 1 from public.telefun_history t where t.id = r.id)
)
select
  s.*,
  pr.email as actor_email,
  pr.full_name as actor_name,
  pr.role as actor_role,
  pp.id as actor_peserta_id
from sessions s
left join public.profiles pr on pr.id = s.user_id
left join lateral (
  select pp.id
  from public.profiler_peserta pp
  where pp.akun_id = s.user_id
  order by pp.id
  limit 1
) pp on true;
