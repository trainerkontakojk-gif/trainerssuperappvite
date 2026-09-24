# PDKT Expected-Answer Evaluation

## Requirement
- Default new and legacy-without-value PDKT scenario primary recipient to OJK 157 in both editor normalization and backend resolution; preserve explicit reported-company selection.
- Persist/load an optional multiline `expectedAnswer` (`Jawaban yang Diharapkan`). Blank or absent preserves legacy behavior and emits no alignment rating.
- For nonblank references, compare the reply semantically and return `Sesuai`, `Hampir sesuai`, or `Berbeda sama sekali` with a concise reason. Use it as evidence only for existing content/normative assessment; do not add a score dimension or change legacy score calculation.
- Keep the reference out of email-generation/roleplay prompt data and the trainee-facing simulation display. Preserve historical scenario/session JSON without migration.

## Design
Lane D: cross-boundary AI evaluation and persisted/API/UI contract. Use the existing JSONB scenario/config/evaluation storage, optional types, current prompt data-block boundary, and current assessment surfaces. Add an evaluation-only conditional prompt input/output; discard alignment output when the reference is blank, retain existing equal-weight breakdown scoring and recipient failsafe, and render the optional assessment in trainee and reviewer views. Keep generation scenario prompt schemas explicitly free of the new field. Default absent recipient metadata to OJK, while explicit `reported_company` remains authoritative. Graphify returned stale/unrelated repository nodes; use live imports, routes, schemas, and tests instead. No external API or dependency changes, so Context7 is not applicable.

## Tasklist
- [x] Add focused regression coverage for OJK defaults, scenario normalization/persistence/prompt exclusion, conditional semantic alignment output and legacy scoring, and assessment rendering. This pass confirmed RED→GREEN for server-side blank normalization, editor placement, and reference-text redaction.
- [x] Add the optional scenario field and editor copy/textarea in the email step; trim nonblank answers and normalize blank/legacy values to absent.
- [x] Make OJK the editor and runtime recipient default without changing explicit selection behavior.
- [x] Pass the reference only through stored session context to post-reply evaluation; conditionally request/validate alignment and inform existing normative/content-gap assessment without changing score math.
- [x] Render category/reason in trainee mailbox and reviewer assessment UI; do not expose the reference text there.
- [x] Remove the reference from scenario catalog and retry error projections; encrypt retry-token payloads while preserving server-side retry data and accepting unexpired legacy signed tokens.
- [x] Update the canonical PDKT user-visible assessment contract in `docs/modules.md`; no DB migration.
- [x] Run required Lane D gates, review affected formatter/lint/typecheck output, complete Thermo-Nuclear/UI audit, final diff/status review, and `git diff --check`.

## Verification notes
- `pnpm typecheck`, `pnpm lint`, and `pnpm build` passed after the follow-up fixes. Lint reported existing warnings, no errors.
- Targeted Prettier check and `git diff --check` passed.
- `pnpm test:core` passed: API 284 tests across 25 files, Telefun 158 across 11, and Web 213 across 16.
- `pdkt-settings-modal.test.tsx` passed (34/34), including both wizard regressions; `pdkt-session-create-route.test.ts` passed (15/15). The scenario-catalog projection test has a bounded 15-second timeout after exceeding Vitest's 5-second default under parallel core load.
- No dev server was listening for browser visual verification; the UI received a source-level accessibility/responsive audit. No migration or full suite was run.
