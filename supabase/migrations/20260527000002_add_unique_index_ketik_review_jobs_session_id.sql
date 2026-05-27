-- Add unique index on session_id so upsert/onConflict works
-- Legacy migration 20260508110000 already has this; Vite migration 002 was missing it.
CREATE UNIQUE INDEX IF NOT EXISTS ketik_review_jobs_session_id_idx ON public.ketik_review_jobs(session_id);
