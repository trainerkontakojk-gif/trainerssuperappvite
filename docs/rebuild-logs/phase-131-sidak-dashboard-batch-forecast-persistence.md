# Phase 131 - SIDAK Dashboard Batch Forecast Persistence

## Ringkasan

Prediksi dashboard SIDAK sekarang dibuat sebagai satu snapshot untuk seluruh
series, bukan satu request per scope. Satu generation mencakup:

- Total Temuan.
- Seluruh parameter pada `paramTrend.datasets`.
- Satu insight naratif keseluruhan.

## Perilaku

- Saat halaman dibuka, frontend menjalankan lookup `cacheOnly`.
- Cache lookup tidak memanggil Gemini dan tidak membuat snapshot baru.
- Tombol `Update/Perbarui Prediksi` mengirim `forceRefresh: true`.
- Pergantian parameter hanya memilih series dari snapshot yang sudah ada.
- Snapshot digunakan kembali setelah reload selama filter dan historical
  fingerprint masih sama.
- Perubahan filter, scope leader, atau data historis menghasilkan fingerprint
  berbeda sehingga snapshot lama tidak digunakan.

## Model AI

- Forecast angka: regresi linear deterministik.
- Narasi: `gemini-3.1-flash-lite`.
- Temperature: `0.3`.
- Gemini dipanggil satu kali per generation/force refresh, bukan per parameter.
- Kegagalan Gemini tidak menghapus forecast angka; insight disimpan dengan
  status `unavailable`.

## Persistence dan Security

Migration:

`supabase/migrations/20260614090000_sidak_dashboard_forecast_snapshots.sql`

Tabel snapshot:

- Menyimpan `filter_key`, `data_fingerprint`, horizon, dan payload JSONB.
- Unique per filter + fingerprint + horizon.
- RLS aktif.
- Hak akses `PUBLIC`, `anon`, dan `authenticated` dicabut.
- Hanya backend `service_role` yang dapat membaca atau menulis.

Scope leader (`agentIds` dan `allowedServiceTypes`) sekarang diteruskan ke query
forecast dan dimasukkan ke cache key. Ini mencegah snapshot dari scope yang lebih
luas digunakan oleh leader dengan akses terbatas.

## Verifikasi

- Batch service: total + seluruh parameter.
- Cache hit tidak memanggil Gemini.
- Cache-only miss mengembalikan `null`.
- Force refresh melewati cache.
- Route menyuntikkan scope leader.
- Migration contract memvalidasi RLS dan grant.
- Chart tetap menempatkan forecast pada bulan sesudah data aktual.
