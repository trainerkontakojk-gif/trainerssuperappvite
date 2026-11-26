-- Optional per-finding service time and call duration. No defaults or backfill;
-- old rows stay NULL. Existing grants and RLS policies are unchanged.
ALTER TABLE public.qa_temuan
  ADD COLUMN IF NOT EXISTS jam_layanan time(0),
  ADD COLUMN IF NOT EXISTS durasi_detik integer,
  ADD CONSTRAINT qa_temuan_durasi_detik_range
    CHECK (durasi_detik IS NULL OR (durasi_detik >= 0 AND durasi_detik < 86400)),
  ADD CONSTRAINT qa_temuan_durasi_only_call
    CHECK (durasi_detik IS NULL OR service_type = 'call'),
  ADD CONSTRAINT qa_temuan_jam_layanan_allowed_service
    CHECK (jam_layanan IS NULL OR service_type IN ('chat', 'pencatatan', 'slik')),
  ADD CONSTRAINT qa_temuan_jam_layanan_clock_range
    CHECK (jam_layanan < TIME '24:00');

COMMENT ON COLUMN public.qa_temuan.jam_layanan IS
  'Jam dinding WIB: chat = interaksi dimulai, pencatatan = tiket layanan dibuat, slik = jam layanan. Peta resmi: SIDAK_TIME_SOURCE di packages/types.';
COMMENT ON COLUMN public.qa_temuan.durasi_detik IS
  'Durasi panggilan dalam detik; hanya untuk layanan Call.';
