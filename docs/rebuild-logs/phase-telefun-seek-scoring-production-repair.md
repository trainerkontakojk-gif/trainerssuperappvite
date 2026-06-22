# Telefun Seek & AI Scoring Production Repair

## Problem
- Production mencatat migrasi scoring lifecycle sebagai applied, tetapi kolom (`scoring_status`, `scoring_claimed_at`, dll) dan 5 RPC scoring hilang.
- Error terkonfirmasi: `42703 scoring_status does not exist`.
- Rekaman produksi sudah seekable (`duration 297.559s`, HTTP Range `206`), tetapi modal menggunakan URL `blob:` lama sebelum remux selesai.
- `enqueue_telefun_scoring` dapat mengubah sesi `processing` kembali menjadi `pending`, menyebabkan score overwrite.

## Changes

### 1. Terminal Migration
`supabase/migrations/20260622150000_repair_telefun_scoring_lifecycle_contract.sql`
- Memulihkan 6 kolom scoring dengan `ADD COLUMN IF NOT EXISTS`
- Membuat ulang 3 indexes
- Bulk recovery: sesi dengan `score + voice_assessment` → `completed`, sisanya `pending`
- Re-create 5 RPCs (claim, complete, fail, reschedule, enqueue) dengan SECURITY DEFINER
- `enqueue_telefun_scoring` guard: `IS DISTINCT FROM 'processing'` mencegah re-enqueue sesi aktif
- Grant hanya service_role
- Reload PostgREST schema via `NOTIFY pgrst, 'reload schema'`
- Transactional dan memperbaiki CHECK constraint pada partial schema drift
- Explicit revoke untuk `public`, `anon`, dan `authenticated`

### 2. Remux Versioned Paths
`apps/api/src/routes/telefun/remux-recording.ts`
- Path baru `full_call.seekable.webm` / `agent_only.seekable.webm` (tidak overwrite objek lama)
- Upload ke path baru, update DB path setelah sukses, hapus sumber lama setelah update
- Error parsial mempertahankan path asli
- Retry terhadap path `.seekable.webm` menjadi no-op sukses
- Objek seekable dibersihkan kembali jika update DB gagal
- Response: `{ success, data: { remuxed, recordings } }`

### 3. Finalizer Remux-Before-Scoring
`apps/web/src/routes/telefun/sessionFinalizer.ts`
- Remux dari fire-and-forget (step 8) → blocking (step 6) SEBELUM scoring
- Jika remux sukses: `record.url` di-set ke `""` (ReviewModal fetch signed URL via API)
- Jika remux gagal: fallback ke `localUrl` (blob URL)
- Jika full-call sukses tetapi agent-only gagal, player tetap memakai signed URL full-call
- Return contract diperluas dengan `remuxed: boolean`

### 5. Persistent Playback Source
`apps/web/src/routes/telefun/components/ReviewModal.tsx`
- Signed URL selalu diprioritaskan ketika DB mempunyai recording path
- `blob:` hanya dipakai untuk record yang belum mempunyai path persisten

### 4. Scoring Error Contract
`apps/api/src/routes/telefun/recordings.ts` + `apps/web/src/routes/telefun/components/VoiceAssessmentSection.tsx`
- `scoringStatus` dipindahkan dari root `error` ke `error.details.scoringStatus`
- Frontend membaca dari `e.details.scoringStatus` (ApiError contract)

## Files Modified
| File | Change |
|------|--------|
| `supabase/migrations/20260622150000_repair_telefun_scoring_lifecycle_contract.sql` | NEW — terminal migration |
| `apps/api/src/routes/telefun/remux-recording.ts` | Versioned seekable paths, DB update, standardized response |
| `apps/api/src/__tests__/telefun-remux-route.test.ts` | NEW — idempotency dan cleanup regression tests |
| `apps/api/src/routes/telefun/recordings.ts` | scoringStatus → error.details |
| `apps/api/src/routes/telefun.ts` | Export buildSeekablePath |
| `apps/web/src/routes/telefun/services/telefun-recording-remux-service.ts` | Updated response type |
| `apps/web/src/routes/telefun/sessionFinalizer.ts` | Remux before scoring, remuxed flag, playback URL logic |
| `apps/web/src/routes/telefun/components/VoiceAssessmentSection.tsx` | Read scoringStatus from error.details |
| `apps/web/src/routes/telefun/components/ReviewModal.tsx` | Persistent signed URL precedence |
| `apps/web/src/__tests__/telefun-review-recording-source.test.tsx` | NEW — playback source regression tests |
| `supabase/rollbacks/rollback_20260622150000_repair_telefun_scoring_lifecycle_contract.sql` | NEW — destructive emergency rollback |
| `apps/api/src/__tests__/telefun-scoring-lifecycle-schema.test.ts` | Allow terminal RPC redefinition |
| `apps/api/src/__tests__/telefun-scoring-retry-migration.test.ts` | Allow terminal RPC redefinition |
| `apps/api/src/__tests__/telefun-scoring-repair-migration.test.ts` | NEW — 11 migration contract tests |
| `apps/api/src/__tests__/telefun-routes.test.ts` | 4 buildSeekablePath tests |
| `apps/web/src/__tests__/telefun-session-finalizer.test.ts` | 10 updated tests with remux mock |

## Verification
- `pnpm lint` — 0 errors; existing repository warnings remain
- API/web TypeScript `--noEmit` — success
- `pnpm build` — success
- `pnpm test:core` — 122 API + 54 web + 77 telefun = 253 tests passing
- Focused repair suite — 70 API + 26 web = 96 tests passing
- Production migration ledger — `20260622150000` applied
- Production contract — 6 scoring columns + 5 scoring RPCs verified
- Target session `79f581b9-610a-4500-935d-7ef31744e153` — `completed`, score `7`, assessment present

## Audit Gaps Closed
- Fixed backfill that previously skipped historical rows because `ADD COLUMN DEFAULT 'pending'` made them non-null.
- Added idempotency for existing seekable paths and cleanup for orphan uploads.
- Added the missing `plan/markdown` artifact and rollback script.
- Added real route/player regression coverage instead of only testing path string generation.

## Deployment State
- Database repair and targeted scoring recovery are live.
- API/web code is implemented and verified locally, but still requires commit/push and Railway deployment.
