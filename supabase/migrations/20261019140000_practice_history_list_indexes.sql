-- History lists read the newest rows first:
--   Telefun  GET /telefun/sessions    user_id = ? ORDER BY created_at DESC LIMIT 50
--   PDKT     GET /pdkt/history        user_id = ? ORDER BY "timestamp" DESC, id DESC
--   PDKT     GET /pdkt/mailbox        shared mailbox ORDER BY last_activity_at DESC, id DESC
-- One index per list lets Postgres read those rows in order instead of
-- collecting the rows and sorting them. Additive only.
CREATE INDEX IF NOT EXISTS telefun_history_owner_created_idx
  ON public.telefun_history (user_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS pdkt_history_owner_timestamp_idx
  ON public.pdkt_history (user_id, "timestamp" DESC, id DESC);
CREATE INDEX IF NOT EXISTS pdkt_mailbox_items_activity_idx
  ON public.pdkt_mailbox_items (last_activity_at DESC, id DESC);
