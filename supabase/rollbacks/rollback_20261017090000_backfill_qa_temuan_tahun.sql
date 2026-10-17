-- Intentionally no-op. The backfill only replaced NULL qa_temuan.tahun with
-- the period's year; resetting those rows to NULL would hide them from
-- skor/ranking/detail agent again, which is the bug being fixed. Backfilled
-- rows are not distinguishable from rows written with the year afterwards.
-- On a local database, `supabase db reset --local` is the way back.
SELECT 1;
