-- Deduplicate existing records if they exist, keeping the oldest one
DELETE FROM public.profiler_peserta a
USING public.profiler_peserta b
WHERE a.id > b.id
  AND a.batch_name = b.batch_name
  AND a.nama = b.nama;

-- Make it idempotent by dropping first if it already exists
ALTER TABLE public.profiler_peserta
  DROP CONSTRAINT IF EXISTS profiler_peserta_batch_nama_unique;

ALTER TABLE public.profiler_peserta
  ADD CONSTRAINT profiler_peserta_batch_nama_unique UNIQUE (batch_name, nama);
