# Monitoring tahap 2 — jadwal harga dan halaman Harga

Lane D (skema baru, biaya AI, kontrak API). Rencana induk: artifact "Rombak Monitoring", disetujui Fajar 2026-10-17 (jadwal harga: pilihan "bisa dijadwalkan").

## Requirement

1. Harga model bisa dijadwalkan: "berlaku mulai tanggal X" (00.00 WIB). Mulai saat itu biaya baru dicatat dengan harga terjadwal, di API dan Telefun.
2. Jadwal yang belum berlaku bisa dibatalkan. Jadwal yang sudah berlaku tidak bisa dihapus (biaya sudah tercatat dengan harga itu).
3. Ubah harga "sekarang" tetap seperti dulu, dan menang atas jadwal yang sudah lewat.
4. Jadwal Gemini 3.8 Flash $1,50 / $7,50 mulai 1 Januari 2027 diisi oleh migrasi.
5. Halaman `/monitoring/harga` (admin dan trainer; leader dialihkan): kurs, tabel harga per penyedia, kolom harga output gambar (hanya baca), "Harga berikutnya", tanggal diubah, model lama dilipat. Tab Monitoring menjadi tautan rute.
6. Kode tetap jalan bila migrasi belum diterapkan di production: pencatatan biaya memakai harga sekarang seperti dulu, dan menjadwalkan harga menjawab pesan yang ramah.

## Design

- Tabel `ai_pricing_schedule` (model, `effective_from`, kolom harga sama dengan `ai_pricing_settings`, `created_by`). RLS aktif tanpa policy; hanya service role (backend). Rollback: drop tabel (jadwal yang belum berlaku hilang; biaya yang sudah tercatat tidak berubah).
- Aturan harga berlaku satu tempat: `resolveEffectivePricing()` di `packages/types`. Dari baris `ai_pricing_settings` (berlaku sejak `updated_at`) dan jadwal terbaru yang sudah lewat, yang paling baru menang. Dipakai `logAiUsage`, Telefun `usage.ts`, dan `GET /monitoring/pricing`.
- Tabel jadwal tidak ada (42P01/PGRST205) → dianggap kosong saat menghitung biaya; endpoint jadwal menjawab 503.
- API: `PUT /monitoring/pricing` menerima `effective_from` (YYYY-MM-DD, harus sesudah hari ini WIB) → simpan jadwal; tanpa itu → ubah sekarang. `DELETE /monitoring/pricing/schedule/:id` hanya untuk jadwal yang belum berlaku. `GET` menambah `effective_since`, `next_price`, `image_output_price_usd_per_million`.

## Tasklist

- [x] RED: `e2e/monitoring-pricing-schedule-api.spec.ts` (backend nyata) + hermetic `e2e/monitoring-harga.spec.ts`.
- [x] Migrasi + rollback + README rollback.
- [x] `resolveEffectivePricing` + pemakaian di API dan Telefun.
- [x] Endpoint jadwal.
- [x] Rute dan halaman Harga.
- [x] thermo-nuclear, typecheck/lint/build, `git diff --check`, CHANGELOG.
