-- Seed: qa_indicators (additional indicators for seed temuan)
-- The migration 001 already seeds BKO indicators
-- We add call and chat indicators for qa_temuan seed data
-- Uses ON CONFLICT DO NOTHING for idempotent execution

INSERT INTO public.qa_indicators (id, service_type, name, category, bobot, has_na, created_at)
VALUES
  ('11000000-0000-0000-0000-000000000001', 'call', 'Greeting & Opening', 'non_critical', 0.15, false, '2024-01-01 08:00:00+07'),
  ('11000000-0000-0000-0000-000000000002', 'call', 'Probing & Identifikasi Kebutuhan', 'critical', 0.25, false, '2024-01-01 08:00:00+07'),
  ('11000000-0000-0000-0000-000000000003', 'call', 'Solusi & Penanganan', 'critical', 0.30, false, '2024-01-01 08:00:00+07'),
  ('11000000-0000-0000-0000-000000000004', 'call', 'Closing & Konfirmasi', 'non_critical', 0.15, false, '2024-01-01 08:00:00+07'),
  ('11000000-0000-0000-0000-000000000005', 'call', 'Etika & Sopan Santun', 'non_critical', 0.15, false, '2024-01-01 08:00:00+07'),
  ('11000000-0000-0000-0000-000000000006', 'chat', 'Greeting & Opening', 'non_critical', 0.10, false, '2024-01-01 08:00:00+07'),
  ('11000000-0000-0000-0000-000000000007', 'chat', 'Kecepatan Respon', 'critical', 0.20, false, '2024-01-01 08:00:00+07'),
  ('11000000-0000-0000-0000-000000000008', 'chat', 'Akurasi Informasi', 'critical', 0.30, false, '2024-01-01 08:00:00+07'),
  ('11000000-0000-0000-0000-000000000009', 'chat', 'Tata Bahasa & Ejaan', 'non_critical', 0.20, false, '2024-01-01 08:00:00+07'),
  ('11000000-0000-0000-0000-000000000010', 'chat', 'Closing & Follow-up', 'non_critical', 0.20, false, '2024-01-01 08:00:00+07')
ON CONFLICT DO NOTHING;
