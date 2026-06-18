-- Migration: add v_access_groups_with_item_counts view
-- Purpose: move access group item counting into SQL view

create or replace view public.v_access_groups_with_item_counts
as
select
  ag.id,
  ag.name,
  ag.description,
  ag.scope_type,
  ag.is_active,
  ag.created_at,
  count(agi.id)::int as item_count
from public.access_groups ag
left join public.access_group_items agi
  on agi.access_group_id = ag.id
group by ag.id, ag.name, ag.description, ag.scope_type, ag.is_active, ag.created_at;

revoke all on public.v_access_groups_with_item_counts from public, anon;
grant select on public.v_access_groups_with_item_counts to service_role;
