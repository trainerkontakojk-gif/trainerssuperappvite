# PDKT Telaah: side-by-side review and reply-mark guard

Lane C — PDKT web review stage layout plus the PDKT evaluation output contract (one module, no schema/RLS change).

## Requirement

1. On the Telaah stage the consumer email and the agent reply sit side by side (consumer left, reply right) on wide screens and stack (consumer first) on narrow screens. The consumer email is always visible, not folded away.
2. The numbered notes sit directly under the marked reply, in the same column.
3. Score summary and score breakdown move above the comparison so they do not push the reply out of view.
4. The AI evaluation must return an `annotations` array. A response without it is invalid and goes through the existing retry/failed path instead of silently saving a review with no marks.
5. A completed evaluation stores `annotations` even when empty, so "no findings" differs from "evaluated before marks existed".
6. A completed review whose stored evaluation has no `annotations` key (made before reply marks shipped) shows a notice with a "Telaah ulang" button. It calls the existing `POST /pdkt/history/retry-eval`, and the backend re-runs the evaluation for such rows only. Completed rows that already carry `annotations` stay cached.

## Design

- `PdktReviewStage.tsx`: header → `ScoreSummary` + `ScoreBreakdown` in a two-column row → `Section "Email konsumen"` | `ReplyWithNotes` (reply + notes) in `lg:grid-cols-2` → other findings, AI note, rewrite, actions. A `MarksMissingNotice` above the scores when `result.annotations === undefined`.
- `evaluation-service.ts`: `normalizePdktEvaluationResponse` returns `null` when `raw.annotations` is not an array; stored and returned results always include `annotations`. `processPdktEvaluation` treats a completed row with no `annotations` key as re-evaluable (cache check and claim filter).
- `monitoring-history-service.ts`: keep `annotations: []` instead of dropping it.

## Tasklist

- [x] RED: update the "tahap Telaah" E2E to assert the consumer email region is visible and beside the reply on desktop and stacked on mobile; add an E2E for the legacy notice + "Telaah ulang" request.
- [x] GREEN: layout + legacy notice in `PdktReviewStage.tsx`; wire `onRetry`.
- [x] Backend guard and re-evaluation of legacy completed rows.
- [x] Typecheck api/web, focused E2E, thermo-nuclear, lint, build, `git diff --check`; updated PDKT unit tests (approved by Fajar 2026-10-14). `impeccable` audit ran afterwards; see below.

Not provable by hermetic E2E: the backend rejects AI output without `annotations` and re-claims legacy completed rows. Fajar approved updating the PDKT unit tests (2026-10-14); `pdkt-reply-annotations.test.ts` now covers the rejection and the empty-vs-legacy distinction. The re-claim query is checked only against local PostgREST.

## Audit follow-up (impeccable, 2026-10-14)

- [x] Reply marks are links ("Lihat catatan N") to their note, and marked notes link back ("Kembali ke kalimat bertanda N"). Jump targets get visible focus.
- [x] Consumer email and reply share one comparison surface (`Perbandingan email`); the consumer pane is sticky on wide screens and scrolls itself when tall.
- [x] Legacy-marks notice uses `Alert` (role `region`) with an info icon instead of another content card.
- [x] Legend under highlighted rewrite text.
- [x] Telaah controls are at least 44px (`min-h-[44px]`; the 14px root makes `min-h-11` 38.5px), including `CopyInlineButton`.
- Open: `--text-xs` is 11px by design token and E2E floor, while `docs/design.md` says 12px for secondary text. Left for Fajar to decide. Other PDKT controls still use `min-h-11` (separate task).
