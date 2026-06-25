# Phase 206 - Security Findings 1-5 Hardening

Tanggal: 2026-06-25

## Ringkasan

Menutup 5 temuan awal dari Codex Security scan:

1. Trainer tidak lagi bisa mengubah status atau role akun admin.
2. PATCH sesi Telefun menolak path rekaman yang bukan milik user dan session yang sama.
3. Export HTML slide Profiler meng-escape data peserta sebelum dimasukkan ke `innerHTML`.
4. Query SIDAK temuan dengan `agent_ids: []` mengembalikan data kosong.
5. Query SIDAK report dengan `agent_ids: []` mengembalikan data kosong.

## Detail Teknis

- `admin-service` sekarang melakukan lookup role target sebelum trainer mengubah status atau role user.
- Route admin status meneruskan role pemanggil ke service.
- Validator path rekaman Telefun dipakai bersama oleh finalize recording dan session PATCH.
- `buildTelefunSessionUpdatePayload()` menerima context ownership opsional dan melempar error untuk path tidak valid.
- `profilerSlideHtml` menambahkan escaping HTML untuk teks, field, catatan, keterangan, footer, dan attribute `src` foto.
- `getTemuan()` dan `getDataReportRows()` fail-closed saat scope agent eksplisit kosong.

## Verifikasi

```bash
pnpm --dir apps/api exec vitest run src/__tests__/admin-service.test.ts src/__tests__/telefun-routes.test.ts src/__tests__/sidak-service.test.ts src/__tests__/sidak-report-data-pagination.test.ts
pnpm --dir apps/web exec vitest run src/routes/profiler/utils/profilerSlideHtml.test.ts
```

Hasil:

- API: 4 file test lulus, 86 test lulus.
- Web: 1 file test lulus, 1 test lulus.

