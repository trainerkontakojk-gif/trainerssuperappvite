-- Monitoring tahap 3: Riwayat difilter dan dibagi per halaman di server.
--
-- `monitoring_sessions` menggabungkan sesi KETIK, PDKT, Telefun, dan hasil
-- Telefun lama (`results`) menjadi satu baris ringkas per sesi, tanpa isi
-- transkrip. `monitoring_sessions_page` memfilter, menghitung, dan mengambil
-- satu halaman dalam satu panggilan. Keduanya hanya untuk server (service_role);
-- cakupan leader dihitung API lalu dikirim sebagai daftar peserta.

create index if not exists idx_profiler_peserta_trainer_id
  on public.profiler_peserta (trainer_id)
  where trainer_id is not null;

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

revoke all on public.monitoring_sessions from public, anon, authenticated;
grant select on public.monitoring_sessions to service_role;

-- p_status: completed | processing (termasuk pending) | failed | not_started.
-- p_from inklusif, p_to eksklusif. p_peserta_ids null berarti semua sesi;
-- array kosong berarti tidak ada sesi.
create or replace function public.monitoring_sessions_page(
  p_module text default null,
  p_status text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_q text default null,
  p_peserta_ids uuid[] default null,
  p_limit integer default 25,
  p_offset integer default 0
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with pattern as (
  select case
    when nullif(btrim(p_q), '') is null then null
    else '%' || replace(replace(replace(btrim(p_q), '\', '\\'), '%', '\%'), '_', '\_') || '%'
  end as value
),
filtered as (
  select s.*
  from public.monitoring_sessions s, pattern
  where (p_module is null or s.module = p_module)
    and (
      p_status is null
      or s.review_status = p_status
      or (p_status = 'processing' and s.review_status = 'pending')
    )
    and (p_from is null or s.occurred_at >= p_from)
    and (p_to is null or s.occurred_at < p_to)
    and (
      p_peserta_ids is null
      or s.subject_peserta_id = any (p_peserta_ids)
      or s.actor_peserta_id = any (p_peserta_ids)
    )
    and (
      pattern.value is null
      or s.scenario_title ilike pattern.value
      or s.consumer_name ilike pattern.value
      or s.subject_name ilike pattern.value
      or s.actor_email ilike pattern.value
      or s.actor_name ilike pattern.value
    )
),
page as (
  select *
  from filtered
  order by occurred_at desc, module, id
  limit greatest(least(p_limit, 100), 1)
  offset greatest(p_offset, 0)
)
select jsonb_build_object(
  'total', (select count(*) from filtered),
  'counts', (
    select jsonb_build_object(
      'ketik', count(*) filter (where module = 'ketik'),
      'pdkt', count(*) filter (where module = 'pdkt'),
      'telefun', count(*) filter (where module = 'telefun'),
      'completed', count(*) filter (where review_status = 'completed'),
      'processing', count(*) filter (where review_status in ('pending', 'processing')),
      'failed', count(*) filter (where review_status = 'failed'),
      'not_started', count(*) filter (where review_status = 'not_started')
    )
    from filtered
  ),
  'rows', coalesce(
    (
      select jsonb_agg(to_jsonb(page) order by occurred_at desc, module, id)
      from page
    ),
    '[]'::jsonb
  )
);
$$;

revoke all on function public.monitoring_sessions_page(text, text, timestamptz, timestamptz, text, uuid[], integer, integer)
  from public, anon, authenticated;
grant execute on function public.monitoring_sessions_page(text, text, timestamptz, timestamptz, text, uuid[], integer, integer)
  to service_role;

notify pgrst, 'reload schema';
