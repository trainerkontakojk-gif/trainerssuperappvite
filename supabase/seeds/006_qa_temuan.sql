-- Seed: qa_temuan (findings)
-- Minimum 5 rows linked to valid peserta, periods, and indicators
-- References: profiler_peserta(id), qa_periods(id), qa_indicators(id)
-- Uses ON CONFLICT DO NOTHING for idempotent execution

INSERT INTO public.qa_temuan (
  id, peserta_id, period_id, indicator_id, service_type,
  no_tiket, nilai, ketidaksesuaian, sebaiknya, tahun,
  created_at, updated_at
)
VALUES
  (
    'aa000000-0000-0000-0000-000000000001',
    'e1000000-0000-0000-0000-000000000001',
    'f1000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',
    'call',
    'TKT-2024-00142',
    3,
    NULL,
    NULL,
    2024,
    '2024-01-20 10:00:00+07',
    '2024-01-20 10:00:00+07'
  ),
  (
    'aa000000-0000-0000-0000-000000000002',
    'e1000000-0000-0000-0000-000000000001',
    'f1000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000002',
    'call',
    'TKT-2024-00142',
    2,
    'Tidak melakukan probing mendalam terkait kebutuhan nasabah',
    'Sebaiknya agent menanyakan minimal 3 pertanyaan probing sebelum memberikan solusi',
    2024,
    '2024-01-20 10:05:00+07',
    '2024-01-20 10:05:00+07'
  ),
  (
    'aa000000-0000-0000-0000-000000000003',
    'e1000000-0000-0000-0000-000000000002',
    'f1000000-0000-0000-0000-000000000002',
    '11000000-0000-0000-0000-000000000003',
    'call',
    'TKT-2024-00287',
    1,
    'Memberikan informasi yang tidak akurat mengenai suku bunga deposito',
    'Pastikan agent mengecek sistem sebelum memberikan informasi produk kepada nasabah',
    2024,
    '2024-02-15 14:30:00+07',
    '2024-02-15 14:30:00+07'
  ),
  (
    'aa000000-0000-0000-0000-000000000004',
    'e1000000-0000-0000-0000-000000000003',
    'f1000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000007',
    'chat',
    'TKT-2024-00415',
    3,
    NULL,
    NULL,
    2024,
    '2024-03-22 09:00:00+07',
    '2024-03-22 09:00:00+07'
  ),
  (
    'aa000000-0000-0000-0000-000000000005',
    'e1000000-0000-0000-0000-000000000004',
    'f1000000-0000-0000-0000-000000000003',
    '11000000-0000-0000-0000-000000000008',
    'chat',
    'TKT-2024-00416',
    2,
    'Informasi yang diberikan kurang lengkap mengenai persyaratan pembukaan rekening',
    'Agent perlu menyampaikan seluruh persyaratan termasuk dokumen pendukung yang diperlukan',
    2024,
    '2024-03-22 09:30:00+07',
    '2024-03-22 09:30:00+07'
  ),
  (
    'aa000000-0000-0000-0000-000000000006',
    'e1000000-0000-0000-0000-000000000005',
    'f1000000-0000-0000-0000-000000000004',
    '11000000-0000-0000-0000-000000000004',
    'call',
    'TKT-2024-00523',
    3,
    NULL,
    NULL,
    2024,
    '2024-04-10 11:00:00+07',
    '2024-04-10 11:00:00+07'
  ),
  (
    'aa000000-0000-0000-0000-000000000007',
    'e1000000-0000-0000-0000-000000000006',
    'f1000000-0000-0000-0000-000000000005',
    '11000000-0000-0000-0000-000000000009',
    'chat',
    'TKT-2024-00678',
    2,
    'Terdapat beberapa kesalahan ejaan dalam percakapan chat',
    'Gunakan fitur spell-check dan periksa kembali pesan sebelum dikirim ke nasabah',
    2024,
    '2024-05-18 15:45:00+07',
    '2024-05-18 15:45:00+07'
  )
ON CONFLICT (id) DO NOTHING;
