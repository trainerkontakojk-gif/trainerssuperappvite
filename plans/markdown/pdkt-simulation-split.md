# PDKT simulation workspace — split the page file

- **Status:** Implemented on `claude/project-thread-8hrwo8`.
- **Risk lane:** Lane C (multi-file refactor, no intended behavior change).
- **Requested by:** Fajar, 2026-10-17 (project thread "Pelajari isi aplikasi Trainers SuperApp", item "file terlalu besar").

## Requirement

`apps/web/src/routes/pdkt/simulation.tsx` was 1,361 lines: one component holding mailbox state, AI review polling, delete flows, replay mapping and every loading/error view. Split it so each concern has its own file, with the same rendered UI, API calls and timing.

## Design

- `utils/usePdktEvaluations.ts`: review state per mailbox, history sync, the 5-second poll, retry with its grace window, and seeding for replay items.
- `utils/usePdktMailboxDelete.ts`: bulk selection plus the confirm-then-delete flow (single and bulk).
- `utils/replaySession.ts`: `buildReplayMailboxItem`, the read-only mailbox item for a history session no longer in the mailbox.
- `utils/pdktErrors.ts`: `extractMailboxRetryDraft`, reading the retry draft from a failed session start.
- `components/PdktWorkspaceStates.tsx`: inbox loading/error pages, detail pending/failed, empty detail, and the mailbox-retry banner.
- `simulation.tsx` (827 lines) keeps selection, filters, session start/reply and stage layout. Logic moved verbatim; only names changed where a handler became a hook return (`handleRetryEval` → `retryEvaluation`, `handleDelete` → `requestDelete`, and so on).

## Tasklist

- [x] Baseline `pdkt-flow.spec.ts` + `pdkt-resilience.spec.ts`: 89 passed.
- [x] Extract modules; web typecheck, ESLint (no new warnings), Prettier on touched files, root build.
- [x] Same specs after the split: 89 passed.
