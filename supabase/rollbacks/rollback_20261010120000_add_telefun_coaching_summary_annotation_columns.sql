-- Intentionally no-op. On production the three ai_annotation_* columns and
-- both CHECK constraints predate this migration (checked 2026-10-10), and
-- upsert_telefun_coaching_summary writes them on every call. Dropping them
-- would break coaching summaries everywhere and lose annotation data.
-- On a local database, `supabase db reset --local` is the way back.
SELECT 1;
