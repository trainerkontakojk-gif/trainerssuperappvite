-- Migration: add get_leader_scope_snapshot RPC
-- Purpose: move leader scope expansion and dedupe into SQL

create index if not exists idx_leader_access_requests_approved_scope
  on public.leader_access_requests (leader_user_id, module, id)
  where status = 'approved';

create index if not exists idx_access_group_items_active_group_scope
  on public.access_group_items (access_group_id, field_name, field_value)
  where is_active = true;

create or replace function public.get_leader_scope_snapshot(
  p_leader_user_id uuid,
  p_module text
)
returns table (
  request_ids uuid[],
  peserta_ids uuid[],
  batch_names text[],
  tims text[],
  service_types text[]
)
language sql
stable
set search_path = public
as $$
with approved_requests as (
  select lar.id
  from public.leader_access_requests lar
  where lar.leader_user_id = p_leader_user_id
    and lar.status = 'approved'
    and (lar.module = p_module or lar.module = 'all')
),
group_ids as (
  select distinct larg.access_group_id
  from public.leader_access_request_groups larg
  join approved_requests ar on ar.id = larg.request_id
),
scope_items as (
  select agi.field_name, agi.field_value
  from public.access_group_items agi
  join public.access_groups ag
    on ag.id = agi.access_group_id
   and ag.is_active = true
  join group_ids gid
    on gid.access_group_id = agi.access_group_id
  where agi.is_active = true
),
expanded_ids as (
  select field_value::uuid as peserta_id
  from scope_items
  where field_name = 'peserta_id'
    and field_value ~* '^[0-9a-f-]{36}$'
  union
  select pp.id
  from public.profiler_peserta pp
  join scope_items si
    on si.field_name = 'batch_name'
   and si.field_value = pp.batch_name
  union
  select pp.id
  from public.profiler_peserta pp
  join scope_items si
    on si.field_name = 'tim'
   and si.field_value = pp.tim
)
select
  coalesce((select array_agg(distinct id order by id) from approved_requests), '{}'::uuid[]),
  coalesce((select array_agg(distinct peserta_id order by peserta_id) from expanded_ids), '{}'::uuid[]),
  coalesce((select array_agg(distinct field_value order by field_value) from scope_items where field_name = 'batch_name'), '{}'::text[]),
  coalesce((select array_agg(distinct field_value order by field_value) from scope_items where field_name = 'tim'), '{}'::text[]),
  coalesce((select array_agg(distinct field_value order by field_value) from scope_items where field_name = 'service_type' and field_value in ('call','chat','email','cso','pencatatan','bko','slik')), '{}'::text[]);
$$;

revoke all on function public.get_leader_scope_snapshot(uuid, text) from public, anon, authenticated;
grant execute on function public.get_leader_scope_snapshot(uuid, text) to service_role;
