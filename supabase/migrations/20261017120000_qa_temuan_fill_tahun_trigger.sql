-- Capture the prod-only trigger that fills qa_temuan.tahun from the period year.
--
-- Prod (ruosnjmtywcrghjgqugz) has trg_fill_tahun, but no repo migration
-- creates it (phase-37 parity audit; drift readback 2026-10-17). Local and E2E
-- therefore left tahun NULL on inserts that omit it, while prod filled it.
-- Hardened versus prod: empty search_path and a schema-qualified qa_periods.
-- Idempotent, so applying it to prod only replaces the function body.
-- A tahun written explicitly is kept; only NULL is filled.

CREATE OR REPLACE FUNCTION public.fill_tahun_from_period()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.tahun IS NULL AND NEW.period_id IS NOT NULL THEN
    SELECT p.year INTO NEW.tahun
    FROM public.qa_periods AS p
    WHERE p.id = NEW.period_id;
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger functions run without EXECUTE checks; nobody needs to call it.
REVOKE ALL ON FUNCTION public.fill_tahun_from_period() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fill_tahun ON public.qa_temuan;
CREATE TRIGGER trg_fill_tahun
  BEFORE INSERT ON public.qa_temuan
  FOR EACH ROW EXECUTE FUNCTION public.fill_tahun_from_period();
