-- Persist SIDAK dashboard forecast snapshots for reuse across page reloads.
-- The backend is the only reader/writer because payloads include authorized
-- dashboard scope and must never be queried directly by browser clients.

CREATE TABLE IF NOT EXISTS public.sidak_dashboard_forecast_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filter_key TEXT NOT NULL,
  data_fingerprint TEXT NOT NULL,
  horizon_months INTEGER NOT NULL CHECK (horizon_months BETWEEN 1 AND 6),
  payload JSONB NOT NULL,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (filter_key, data_fingerprint, horizon_months)
);

CREATE INDEX IF NOT EXISTS idx_sidak_dashboard_forecast_filter_key
  ON public.sidak_dashboard_forecast_snapshots(filter_key);

ALTER TABLE public.sidak_dashboard_forecast_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.sidak_dashboard_forecast_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.sidak_dashboard_forecast_snapshots TO service_role;
