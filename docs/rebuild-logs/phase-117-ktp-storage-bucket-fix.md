# Phase 117: KTP Manual Input Storage Bucket Fix

**Goal:** Memperbaiki kegagalan CRUD KTP saat role `trainer` menambahkan peserta manual dengan foto, dengan menyatukan kontrak bucket foto peserta ke `profiler-foto`.

## Root Cause

Mismatch kontrak storage bucket foto KTP/Profiler antara frontend, backend, migrasi, dan docs:

| Layer | Sebelum | Sesudah |
| --- | --- | --- |
| Frontend upload (`profilerService.ts`) | `profiler-assets` | `profiler-foto` (via `profilerPhotoStorage.ts`) |
| Backend foto check (`profiler-service.ts`) | `foto-avatar` (inline `checkFotoUrl`) | `profiler-foto` (via `profiler-photo-storage.ts`) |
| Migration (`014_storage_buckets.sql`) | `foto-avatar`, private | `profiler-foto` added, public |
| Docs (`modules.md`, `database.md`) | `profiler-foto` (correct) | `profiler-foto` (unchanged) |

## Changes

### New Files
- `apps/web/src/lib/profilerPhotoStorage.ts` — Canonical frontend helper: bucket `profiler-foto`, path unik `pesertaId/timestamp-uuid.ext`, upload + public URL
- `apps/api/src/services/profiler-photo-storage.ts` — Canonical backend helper: `extractProfilerPhotoPath()`, `checkProfilerPhotoUrl()` (HEAD-based)
- `supabase/migrations/20260604100000_restore_profiler_foto_bucket.sql` — Terminal migration: bucket `profiler-foto` (public, max 5 MB, image MIME types), RLS policies for read/insert/update
- `apps/web/src/__tests__/profiler-photo-storage.test.ts` — 2 unit tests
- `apps/api/src/__tests__/profiler-photo-storage.test.ts` — 3 unit tests
- `apps/api/src/__tests__/profiler-route-create.test.ts` — 3 route contract tests (trainer OK, leader rejected, qa rejected)

### Modified Files
- `apps/web/src/lib/profilerService.ts` — `uploadFoto` delegates to `profilerPhotoStorage.uploadProfilerPhoto`
- `apps/api/src/services/profiler-service.ts` — Removed inline `checkFotoUrl()`, replaced with `checkProfilerPhotoUrl()`
- `scripts/data-integrity/foto-checker.ts` — `foto-avatar` → `profiler-foto`
- `apps/api/src/__tests__/check-fotos.test.ts` — `foto-avatar` → `profiler-foto`

## Verification
- 40 targeted API + web tests PASS
- TypeScript `tsc --noEmit` clean (both web + API)
- Zero runtime references to `profiler-assets` or `foto-avatar`
- All docs, migration, frontend helper, backend helper, and tests agree on `profiler-foto`
