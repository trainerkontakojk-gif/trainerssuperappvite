-- DATA LOSS: export the two fields first and revert their readers/writers.
-- Dropping these columns also drops their CHECK constraints.
ALTER TABLE public.qa_temuan
  DROP COLUMN IF EXISTS jam_layanan,
  DROP COLUMN IF EXISTS durasi_detik;
