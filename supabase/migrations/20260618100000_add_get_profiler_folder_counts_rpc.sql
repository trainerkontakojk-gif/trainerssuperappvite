-- Migration: add get_profiler_folder_counts RPC
-- Purpose: move profiler folder counting from Node.js pagination to DB-side aggregation

create or replace function public.get_profiler_folder_counts(
  p_accessible_ids uuid[] default null
)
returns table (
  batch_name text,
  peserta_count bigint
)
language sql
stable
set search_path = public
as $$
  select
    pp.batch_name,
    count(*)::bigint as peserta_count
  from public.profiler_peserta pp
  where p_accessible_ids is null
     or pp.id = any(p_accessible_ids)
  group by pp.batch_name
  order by pp.batch_name;
$$;

revoke all on function public.get_profiler_folder_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.get_profiler_folder_counts(uuid[]) to service_role;
