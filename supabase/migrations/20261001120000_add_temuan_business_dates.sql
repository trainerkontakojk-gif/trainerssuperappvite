-- Optional business dates for QA findings — SIDAK heatmap (Fase 1).
--
-- `qa_temuan` stores one row per parameter, so both dates are stored per row:
--
--   tanggal_layanan — when the reviewed service/interaction actually happened.
--                     This is the basis of the Agent heatmap mode.
--   tanggal_sampel  — when QA inspected the sample and raised/settled the
--                     finding. This is the basis of the QA heatmap mode.
--
-- Deliberately NOT done in this migration:
--   - No backfill and no DEFAULT. Existing rows keep NULL, because there is no
--     honest way to reconstruct when an old interaction happened.
--   - created_at / updated_at are explicitly NOT used as substitutes: they
--     record when a row was entered, not when the interaction occurred.
--   - No CHECK tying the dates to the audit period or ordering them. Both would
--     need separate sign-off; the MVP accepts whatever the trainer entered.
--   - No change to duplicate constraints, indexes, RLS policies, or grants —
--     the existing `read_all` / `write_trainer` policies already cover these
--     columns because they are column-agnostic.
--
-- Shared contract: `tanggalSchema` + `updateTemuanSchema` in
-- packages/types/src/sidak.ts. The API always sends `YYYY-MM-DD`.

ALTER TABLE public.qa_temuan
  ADD COLUMN IF NOT EXISTS tanggal_layanan date,
  ADD COLUMN IF NOT EXISTS tanggal_sampel date;

COMMENT ON COLUMN public.qa_temuan.tanggal_layanan IS
  'Tanggal layanan yang sedang ditinjau (YYYY-MM-DD). NULL berarti belum diisi.';
COMMENT ON COLUMN public.qa_temuan.tanggal_sampel IS
  'Tanggal QA memeriksa/menetapkan temuan (YYYY-MM-DD). NULL berarti belum diisi.';