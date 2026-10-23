# Telefun — categorized language evidence

## Requirement

Fajar wants Telaah to mark concrete repetitions, ineffective sentences and other communication findings, not only show generic good/fix notes. Lane D: an additive shared assessment/API contract plus backend AI normalization and web navigation. Implement locally; no commit, push, deployment, migration, production data or paid AI call is authorized.

Acceptance:

- Explicit categories: repetition, effectiveness, clarity, empathy, politeness, accuracy, confirmation; no invented finding simply to fill a category.
- Each finding retains a real agent quote and timestamp, a reason and a replacement for corrections. Repetition requires a verified earlier comparison; necessary confirmation is not automatically an error.
- Both repetition occurrences are marked and navigate to the same finding; finding quote buttons navigate back to either transcript line. Same-line repetition selects a distinct later occurrence.
- Old uncategorized stored assessments still display without fabricated categories. No automatic rerun or scoring change.
- Audio-only judgments (intonation, articulation, tempo) are not inferred from transcript categories.

## Design

- Extend `TelefunAgentNote` with optional category, optional exact character offset, optional comparison evidence (quote/startMs/offset). Keep old fields and undefined legacy metadata readable.
- Add a shared bounded note limit of 16 and a shared category label catalog. Ask the existing assessment call to inspect each language dimension with no per-category quota; do not add AI calls.
- Backend normalizes category and verifies real speaker/whole-word quotes. A repetition must explicitly name both lines, with the comparison before the repeated quote (or earlier non-overlapping occurrence in the same line); invalid comparisons discard that finding, not the assessment.
- Keep existing numbered marker identities and good/fix sections. Add plain category labels and a comparison quote button. Extend quote placement with optional verified offsets while preserving legacy matching.
- Guard against overlapping findings losing markers: retain marker navigation for all evidence, including shared/overlapping text ranges.
- No database migration: assessment JSON already stores these fields. No new dependencies. No model or score changes. Existing result needs explicit trainer/admin Telaah ulang to obtain new findings.

## Owned files

`packages/types/src/telefun-assessment.ts`, `apps/api/src/lib/telefun-content-review.ts`, shared quote mark renderer, Telefun content mark helper/result component, focused Telefun browser/API E2E and API Playwright registration, canonical Telefun/E2E docs and this plan/changelog.

## Tasklist

- [x] Inspect clean checkout, live main SHA 8a4c10dd9a39bee535f655b46039e109bb194444, workflow, callers, schemas, existing E2E.
- [x] Load repository TDD adapter; classify Lane D before edits.
- [x] Check tools: Graphify and Context7 unavailable; use direct imports/callers. No external API adoption or dependency change requires a new lookup.
- [x] Backend E2E RED → GREEN through real score HTTP handler and real assessment/provider parsing; database/storage/provider transport fixtures are local and fail-closed (not a real DB/RLS certification).
- [x] Browser E2E RED → GREEN for categories, both repetition markers, repeated navigation, same-line occurrences and old notes.
- [x] Malformed evidence and missing/wrong-speaker/forward/same-occurrence references do not produce repetition findings; score/legacy behavior remains intact.
- [x] Refactor/self-review, inspect rendered mobile/desktop light/dark evidence and overflow.

Final integration procedure: stage the complete intended change set, fingerprint it,
then run root typecheck/lint/build, owning safe Telefun E2E and shared-renderer
KETIK Telaah regression, artifact read-back and diff checks with start/end guards.
The actual final outcome is recorded **outside the frozen tree**, in
`/home/ubuntu/Downloads/TelefunEvidence/verification.json` and sibling logs/screenshots;
this plan itself does not assert that a future gate passed. No commit or deployment.

## Review and coverage notes

- Implementer review, not independent review: traced AI response → backend quote
  validation → shared parser → persist RPC → API result → category/markers/UI.
  No auth, RLS, scoring formula, AI model selection or live configuration changed.
- Existing Telefun browser suite is already over 1,000 lines. Keep this single
  additional language-evidence flow with its owning hermetic fixture/helpers
  rather than duplicate the entire session/review setup in another suite.
- Main feature API/browser tests were run RED before their implementations.
  Additional malformed-evidence, category-limit and partial-overlap assertions
  characterize the resulting boundary; do not claim they each had a RED run.
- Lint passes with warnings in unrelated existing files; do not expand this
  feature into their cleanup. No non-E2E suite was run.
- Repository `impeccable` adapter is not installed on this host. Performed direct
  rendered screenshot inspection and mechanical overflow/navigation checks;
  no claim of an unavailable tool/independent specialist audit.
- Old cached assessments do not gain new categories without an explicit rerun
  after release. Local transport fixtures prove orchestration/evidence checks,
  not live model semantic accuracy or production DB/JWT/RLS behavior.

## Verification

Only Playwright E2E for behavior (repository policy); no non-E2E tests run without approval. Browser config starts Vite only with loopback service targets; API spec pins loopback env before dynamic API imports and replaces provider HTTP at its transport boundary. No live credentials are used. The API harness validates application orchestration and normalization, not AI semantic reliability or production database behavior.
