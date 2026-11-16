# Profiler photo upload through the API — 16 November 2026

Lane D: new public API route and a change of trust boundary for a Storage write. Decided by Fajar on 2026-11-16: move only the Profiler photo upload to the backend. The Telefun recording upload (private bucket `telefun-recordings`, up to 50 MB, guarded by Storage RLS) stays a direct browser upload and is documented as an approved exception.

## Requirement

- The browser no longer writes to Supabase Storage for Profiler photos. Both callers (`ProfilerAddForm.tsx` and `ProfilerParticipantEditor.tsx`) call the API and still receive the public URL they save in `foto_url`.
- The API accepts only users with `profiler.write` (admin, trainer). That matches the current Storage policy (`trainer`, `trainers`, `admin`).
- Bucket limits are preserved and enforced on the server: JPEG, PNG, WebP, or GIF, at most 5 MB. The declared type must match the decoded image bytes.
- Object path stays `<peserta uuid>/<timestamp>-<uuid>.<ext>` in the public bucket `profiler-foto`. The add form uploads before the peserta exists, so the peserta id is a validated UUID namespace, not an existence check, which is the same behavior as today.
- Errors are human-friendly Indonesian messages, never raw Storage errors.
- Non-goal: changing image bytes (no re-encode), deleting old photos, and changing the Telefun recording upload.

## Design

- API: `POST /api/v1/profiler/foto` with JSON `{ peserta_id, image }`, where `image` is a data URL, following the existing `kegiatan` image pattern (`apps/api/src/lib/trainer-activity-media.ts`). Validation and upload live in `apps/api/src/services/profiler-photo-upload.ts` (separate from `profiler-photo-storage.ts`, so the URL helpers stay free of the Supabase client import). Upload uses the service role only for the Storage write, `upsert: false`. Responses are 201 `{ url }`, 400 `VALIDATION_ERROR`, or 503 `PROFILER_PHOTO_UPLOAD_FAILED`.
- Web: `profilerApi.uploadFoto(file, pesertaId)` in `apps/web/src/lib/profilerService.ts` keeps its signature, reads the file as a data URL, and posts it through `profilerClient`; `profilerPhotoStorage.ts` is removed. No `supabase.storage` call remains in the Profiler path.
- Follow-up (separate change, needs Fajar's approval for prod apply): a migration dropping the `authenticated` INSERT/UPDATE policies on `profiler-foto`, after the API and web are deployed everywhere. Until then a direct upload is still technically allowed by RLS, but no app code does it.

## Tasklist

- [x] RED: `apps/web/e2e/profiler-photo-api.spec.ts` (project `profiler-photo-real-backend`, disposable stack on 55321/55322, 125/125 migrations): 8 fail with 404 before the route existed.
- [x] RED: browser test "foto peserta baru diunggah lewat API, bukan langsung ke Storage" in `profiler-phase3-add-import-teams.spec.ts`: 0 of 2 expected API writes with the old Storage path.
- [x] GREEN: route `POST /profiler/foto`, `services/profiler-photo-upload.ts`, web `profilerApi.uploadFoto`. API spec 8/8, phase-3 browser spec 9/9.
- [x] Mutation check: without the byte-type check, exactly "text declared as PNG" and "PNG declared as JPEG" fail.
- [x] Removed the superseded web unit test and `apps/web/src/lib/profilerPhotoStorage.ts`. The `test-fast.json` entry with the same name belongs to the still-valid API test and stays.
- [x] Docs: `docs/architecture.md` (route and the Telefun recording exception), `AGENTS.md` pointer.
- [x] `thermo-nuclear`: PASS after one P3 fix (reject by encoded length before decoding). Root `pnpm typecheck`, `pnpm lint` (0 errors, no warnings in touched files), `pnpm build`, `git diff --check`, `graphify update .` all exit 0.
- [ ] Follow-up, needs Fajar's approval for prod apply: migration dropping the `authenticated` INSERT/UPDATE policies on `profiler-foto` after API (Railway + Coolify) and web (Vercel) run this change.
