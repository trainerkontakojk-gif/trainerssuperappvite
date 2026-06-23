# Phase 205: Telefun Monitoring Recording Access

**Date**: 2026-06-23
**Status**: DONE

## Summary

Memperbaiki playback rekaman Telefun dari Monitoring. Root cause: Monitoring detail menerima `recording_path` storage privat lalu memasangnya langsung ke `<audio src>`, sehingga browser tidak memiliki URL yang bisa diputar untuk rekaman milik user lain. Jalur Telefun normal sudah memiliki endpoint signed URL, tetapi Monitoring belum memakai kontrak tersebut.

## Access Contract

- Bucket `telefun-recordings` tetap private.
- `recording_path` tetap dipakai sebagai referensi storage internal, bukan URL browser.
- Backend membuat `recording_url` signed URL sementara untuk playback.
- Pemilik sesi tetap dapat memutar rekamannya sendiri dari modul Telefun.
- Akses lintas-user untuk mendengar rekaman hanya untuk role `admin` dan `trainer`.
- Monitoring Telefun detail hanya mengirim `recording_url` kepada `admin` dan `trainer`; role lain dapat melihat detail yang diizinkan, tetapi tidak menerima URL audio.

## Changes

- `apps/api/src/routes/ai.ts` — Telefun monitoring review select `agent_recording_path`, membuat `recording_url` signed URL untuk `admin`/`trainer`, dan mengembalikan `recording_url` + `agent_recording_path`.
- `apps/api/src/routes/telefun/recordings.ts` — akses lintas-user ke `/telefun/recording/:id` dibatasi ke `admin` dan `trainer`; `qa`/`leader` tidak lagi dianggap manager untuk playback rekaman lintas-user.
- `apps/web/src/routes/monitoring/components/TelefunReviewPanel.tsx` — player Monitoring memakai `recording_url`, bukan `recording_path`; role tanpa URL melihat pesan akses rekaman.
- `apps/web/src/lib/api/rpc-client.ts` — tipe `TelefunMonitoringReview` ditambah `recording_url` dan `agent_recording_path`.

## Verification

| Command | Result |
| --- | --- |
| `pnpm exec vitest run src/__tests__/telefun-monitoring-review-transcript.test.ts src/__tests__/telefun-recording-access.test.ts` in `apps/api` | 7 passed |
| `pnpm exec vitest run src/__tests__/monitoring-telefun-recording-url.test.tsx` in `apps/web` | 1 passed |
| `pnpm --filter @trainers/api build` | PASS |
| `pnpm --filter @trainers/web build` | PASS, existing chunk-size warnings only |
| Targeted ESLint on touched API/Web files | 0 errors; existing warnings remain in `TelefunReviewPanel.tsx` |
| `git diff --check` | PASS |

## Notes

No database migration required. The fix is a backend/API contract and frontend playback-source change.
