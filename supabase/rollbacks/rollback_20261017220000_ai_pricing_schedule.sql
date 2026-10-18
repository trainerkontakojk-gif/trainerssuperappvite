-- Rollback: 20261017220000_ai_pricing_schedule.sql
-- Drops scheduled AI prices. Data loss: schedules not yet in effect are lost
-- (re-enter them as manual price edits). Costs already logged are unchanged.
-- Deploy an API/Telefun build without the schedule first, or rely on its
-- missing-table fallback (current prices only).
DROP TABLE IF EXISTS public.ai_pricing_schedule;
NOTIFY pgrst, 'reload schema';
