-- Rollback for 20261018190000_practice_today_summary.sql. No data loss.
-- Revert the API first: GET /admin/practice-limits calls this function.

DROP FUNCTION IF EXISTS public.practice_today_summary();
