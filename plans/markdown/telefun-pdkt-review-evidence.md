# Telefun and PDKT review evidence

## Requirement

Lane D: backwards-compatible PDKT education contract and cross-module review fixes.
Telefun must separate concrete correct/correctable agent utterances from voice
scores, expose voice feedback and training advice at every score, and navigate
repeatedly between an inline transcript marker and the same review note. PDKT
must show education at every score and distinguish verified reply evidence from
general advice or unavailable explanations. Preserve scoring, recipient intent,
private reference redaction, existing annotations, and attachment behavior.

## Design

- Telefun good/fix tabs use content-review verdicts with original note indexes;
  a separate score tab shows every voice aspect's existing feedback and drills.
  Legacy records retain voice feedback and honest content-unavailable messaging.
- Each inline-marker activation creates a fresh navigation target; focus and
  scroll respect reduced-motion preferences.
- PDKT optional `edu.dimensionExplanations` maps dimensions to a reason and
  validated reply quote. Backend accepts only complete, bounded explanations
  whose quotes occur in the reply. Missing evidence never creates a diagnosis.
  Existing dimensionTips remain advice and display regardless of score.
- The model is asked for explanations at all five scores and tips when useful.
  Generic recipient fallback follows the expected reply party.
- No dependency, migration, or remote data change is in scope. Commit and push to main were explicitly authorized after verification.

## Tasklist

- [x] Read live callers, schemas, workflow and narrow Graphify relationships.
- [x] Add focused browser/API E2E and capture expected RED failures.
- [x] Implement Telefun grouping, score detail and repeat navigation.
- [x] Implement bounded PDKT explanations, all-score advice and disclosure.
- [x] GREEN focused E2E and owning regression suites; review UI/maintainability.
- [x] Root typecheck/lint/build, diff check, one Graphify update; record evidence.

## Verification

Browser tests use task-owned port 3006 with hermetic API interception;
the existing port 3005 belongs to another worktree. API tests use disposable
loopback Supabase and a local provider transport, never hosted targets.


### RED / initial GREEN

- Browser RED: `E2E_APP_ORIGIN=http://localhost:3006 pnpm --dir apps/web exec playwright test telefun-flow.spec.ts pdkt-flow.spec.ts --config test-results/ketik-config.ts --grep 'anotasi isi:|rincian skor|Telaah: skor' --workers=1`, exit 1: high-score advice missing in PDKT; repeated Telefun marker did not focus its note.
- API RED: `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project pdkt-review-evidence-real-backend`, exit 1 after correcting the fixture's required identity field: authenticated endpoint returned 200 but omitted `edu`.
- Initial GREEN: same API project exit 0 (1 passed); focused browser with grep `anotasi isi:|tahap Telaah: skor|skor suara tampil pertama` exit 0 (3 passed).
- Browser plugin unavailable; repository Playwright is the rendered verification path. Guarded targets are loopback, with all browser API/auth/provider calls intercepted fail-closed. No remote writes or paid AI calls.

### Review

- Thermo-nuclear self-review: extracted aspect rendering and PDKT score rendering; PDKT stage reduced from 1017 to 974 lines. No dependencies or scoring branches added. Existing partial unit coverage is retained: it tests ranking/failsafe/malformed legacy contracts beyond this E2E, so there is no fully superseded suite to delete.
- Impeccable audit: semantic buttons/tabs, visible keyboard focus, original note indexes, bounded dimensions, semantic color tokens, reduced-motion scroll; no new layout or decoration. Rendered HTML text contrast passes in light/dark themes. Telefun 390/1280 screenshots inspected; no horizontal overflow. PDKT score panel screenshot inspected. A11y 3/4 (native buttons/tabs, focus and reduced motion verified; no full screen-reader certification), performance 4/4 (bounded local rendering, no new fetches/dependencies), theming 4/4 (tokens and measured contrast), responsive 3/4 (tested widths; no exhaustive device sweep), anti-patterns 4/4 (incumbent visual language).
- Context7 skipped: existing React, Tabs, Hono, Zod, and quote-location APIs reused without adopting a new external API. Narrow Graphify queries resolved `buildPdktEdu` and `TelefunReviewResult` callers before implementation.


### Browser regression and rendered evidence

- Full owning suites: `E2E_APP_ORIGIN=http://localhost:3006 pnpm --dir apps/web exec playwright test telefun-flow.spec.ts pdkt-flow.spec.ts --config test-results/ketik-config.ts --workers=1`: exit 1, 71 passed, 3 failed in preflight, 34 skipped. The three failures were test hooks still calling the origin-aware guard without `APP_ORIGIN`, not product failures; all hooks corrected.
- Follow-up: same two specs with `--config test-results/review-evidence.config.ts --grep 'PDKT navigation|PDKT practice|anotasi isi:|tahap Telaah: skor|tanda kata pengisi' --workers=1`: exit 0, 40 passed. Together these runs cover all 108 owning scenarios; three review scenarios repeat.
- Visual follow-up: Telefun spec with `--config test-results/review-evidence.config.ts --grep 'anotasi isi:' --workers=1`: exit 0, 1 passed. Captures visible viewport details at 390/1280 and asserts no horizontal overflow; repeated marker navigation, high-score corrections and high-score drill all remain green.
- Logs and retained Telefun screenshots: `apps/web/test-results/review-evidence-artifacts/` (ignored local artifacts). Temporary configs spread the canonical Playwright config and change only Vite/baseURL to loopback port 3006, testDir and outputDir. On an unoccupied default port, the tracked canonical config runs the same specs directly.


### Final API and workspace gates

- `pnpm --dir apps/web exec playwright test --config playwright.api.config.ts --project pdkt-review-evidence-real-backend --project pdkt-evaluation-errors-real-backend --project pdkt-privacy-real-backend`: exit 0, 10 passed. New education contract, rejected invalid/empty/oversized/unknown-dimension evidence, private-reference redaction, direct-OJK fallback, existing error codes and mailbox privacy verified through real authenticated Hono routes and disposable local DB.
- `pnpm typecheck --concurrency=1`: exit 0, 4/4 workspaces (includes E2E TypeScript).
- `pnpm lint --concurrency=1`: exit 0, 4/4 workspaces; existing warnings remain API 8 / web 71, no errors.
- `pnpm build --concurrency=1`: exit 0, 3/3 build tasks.
- `git diff --check`: exit 0.
- Local Supabase was started from retained backup and stopped with `supabase stop --project-id trainerssuperappvite`, exit 0; task Vite port 3006 no longer listens. No reset, migration, hosted database operation or paid provider call.
- Implementation branch: `fix/telefun-pdkt-review-evidence`. After the gates passed, the user explicitly authorized committing and pushing this scoped change directly to `main`.
- `graphify update .`: exit 0, one final update; graph rebuilt (15972 nodes / 30383 edges). HTML visualization skipped at the existing size limit; graph JSON/report updated in ignored cache.
