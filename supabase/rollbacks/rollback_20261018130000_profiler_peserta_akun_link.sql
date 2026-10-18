-- Rollback: profiler_peserta_akun_link
-- DATA LOSS: drops every account-to-participant link and the target of
-- user-management log rows. Revert the API first; agents lose their SIDAK
-- "self" scope until relinked.

DROP FUNCTION IF EXISTS public.link_profiler_peserta_account(uuid, uuid);

DROP INDEX IF EXISTS public.activity_logs_target_user_created_idx;
ALTER TABLE public.activity_logs DROP COLUMN IF EXISTS target_user_id;

-- Restore the monitoring view that read trainer_id before dropping akun_id.
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
  where pp.trainer_id = s.user_id
  order by pp.id
  limit 1
) pp on true;

DROP INDEX IF EXISTS public.profiler_peserta_akun_id_key;
ALTER TABLE public.profiler_peserta DROP COLUMN IF EXISTS akun_id;
