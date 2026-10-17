-- Speeds up the SIDAK dashboard: it reads qa_temuan by year (`tahun`) in
-- pages ordered by `id` (keyset: id > last id). Without this index every page
-- walks the primary key and filters `tahun` row by row.
-- Index only: no data or behavior change. Plain CREATE INDEX briefly blocks
-- writes to qa_temuan while it builds.
CREATE INDEX IF NOT EXISTS idx_qa_temuan_tahun_id
  ON public.qa_temuan (tahun, id);
