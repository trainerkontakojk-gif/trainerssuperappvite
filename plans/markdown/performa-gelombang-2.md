# Performa gelombang 2: KETIK, Telefun

Audit: /mnt/project-files/audit-performa/laporan.md (2026-10-19). Wave 1: PR #117.

## Requirement

1. KETIK: opening a finished Telaah (and the end of a review poll) reads the review once. `GET /ketik/review/status/:id` carries the ready result as `detail` when the reader will show it next (completed, or a failed re-score that kept it), so the client skips `GET /ketik/review/:id`. A re-score still running does not carry it.
2. Telefun: `POST /telefun/score/:id` returns the score without waiting for the coaching-summary AI call. The call still starts.
3. Telefun: after a call, the full and agent recordings upload at the same time, and the storage path reads the local session instead of asking Auth.

No schema change. The API change is additive (an optional field).

## Design

- `mapKetikReviewDetail(sessionId, snapshot)` is extracted from `getReviewDetail`; `getKetikReviewStatus` reuses the snapshot it already reads.
- `useKetikReviewStatus.loadResult(run, known?)` uses `data.detail` when present.
- `recording-scoring.ts`: `void generateCoachingSummary(...).catch(() => null)`, same as `rerun.ts`.
- `sessionFinalizer.ts`: one `uploadTrack(type, blob)` run for both tracks with `Promise.all`; `getSession()` replaces `getUser()`.

## Tasklist

- [x] RED: `ketik-flow.spec.ts` (finished Telaah opens without the detail request), `ketik-review-worker-api.spec.ts` (status `detail` equals the detail endpoint), `telefun-scoring-api.spec.ts` (new real-backend spec, Gemini never answers), `telefun-call.spec.ts` (both uploads in flight together).
- [x] GREEN and regression runs; api/web typecheck.
- [x] Review: `detail` was first sent during a running re-score too (resultReady stays true then). Narrowed to completed/failed.

## Notes

- Skipped: reading only `emails_thread` for the PDKT mailbox detail. New rows start the thread with the inbound email, but legacy rows were not verified.
- Pre-existing failure, also on main: `telefun-flow.spec.ts` "riwayat yang gagal dimuat bisa dicoba lagi" does not mock `GET /telefun/sessions/month-count`.
