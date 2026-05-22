-- Seed: profiler dependencies (years, folders, tim_list)
-- These are required before profiler_peserta due to FK constraints
-- Uses ON CONFLICT DO NOTHING for idempotent execution

-- Profiler years
INSERT INTO public.profiler_years (id, year, label, created_at)
VALUES
  ('b1000000-0000-0000-0000-000000000001', 2024, 'Tahun 2024', '2024-01-02 08:00:00+07'),
  ('b1000000-0000-0000-0000-000000000002', 2025, 'Tahun 2025', '2025-01-02 08:00:00+07')
ON CONFLICT (year) DO NOTHING;

-- Profiler folders (batch_name FK for profiler_peserta)
INSERT INTO public.profiler_folders (id, name, trainer_id, year_id, created_at)
VALUES
  ('c1000000-0000-0000-0000-000000000001', 'Batch Januari 2024', 'a1b2c3d4-e5f6-7890-abcd-ef1234567802', 'b1000000-0000-0000-0000-000000000001', '2024-01-10 08:00:00+07'),
  ('c1000000-0000-0000-0000-000000000002', 'Batch Maret 2024', 'a1b2c3d4-e5f6-7890-abcd-ef1234567803', 'b1000000-0000-0000-0000-000000000001', '2024-03-05 08:00:00+07')
ON CONFLICT (name) DO NOTHING;

-- Profiler tim list
INSERT INTO public.profiler_tim_list (id, nama, trainer_id, created_at)
VALUES
  ('d1000000-0000-0000-0000-000000000001', 'Tim Alpha', 'a1b2c3d4-e5f6-7890-abcd-ef1234567802', '2024-01-10 08:00:00+07'),
  ('d1000000-0000-0000-0000-000000000002', 'Tim Bravo', 'a1b2c3d4-e5f6-7890-abcd-ef1234567803', '2024-03-05 08:00:00+07')
ON CONFLICT (nama) DO NOTHING;
