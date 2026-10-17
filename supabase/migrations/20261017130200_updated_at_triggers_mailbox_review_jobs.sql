-- Capture the prod-only updated_at triggers on pdkt_mailbox_items and
-- ketik_review_jobs.
--
-- Prod bumps updated_at on every UPDATE of these tables; no repo migration
-- created the triggers (phase-37 parity audit; prod readback 2026-10-17).
-- ketik_review_jobs reuses the repo's update_updated_at_column(). The mailbox
-- function is hardened versus prod with an empty search_path and EXECUTE
-- revoked. Idempotent.

CREATE OR REPLACE FUNCTION public.handle_pdkt_mailbox_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Trigger functions run without EXECUTE checks; nobody needs to call it.
REVOKE ALL ON FUNCTION public.handle_pdkt_mailbox_updated_at() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS tr_pdkt_mailbox_updated_at ON public.pdkt_mailbox_items;
CREATE TRIGGER tr_pdkt_mailbox_updated_at
  BEFORE UPDATE ON public.pdkt_mailbox_items
  FOR EACH ROW EXECUTE FUNCTION public.handle_pdkt_mailbox_updated_at();

DROP TRIGGER IF EXISTS ketik_review_jobs_updated_at ON public.ketik_review_jobs;
CREATE TRIGGER ketik_review_jobs_updated_at
  BEFORE UPDATE ON public.ketik_review_jobs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
