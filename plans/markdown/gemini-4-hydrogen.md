# Add Gemini 4 Hydrogen alongside Gemini 3.8 Flash

Lane D: AI selection and billing. User requests an additional model, retaining Gemini 3.8 Flash.

## Requirement

- Add `gemini-4-hydrogen` as a text/image model and KETIK/PDKT choice; retain existing choices and all code defaults.
- Expose it in appropriate system-task options; leave Telefun audio capability disabled until dedicated audio verification (existing D6 contract).
- Seed standard paid pricing of USD 1.50 input / 7.50 output / 0.075 implicit cached input per million tokens without overwriting custom prices, changing 3.8 pricing/schedules, switching policies, or recalculating old logs.
- If Hydrogen pricing is absent, log tokens at zero cost as required by AGENTS.md; policy writes remain blocked by MODEL_NO_PRICING.
- Prepare and verify migration/rollback locally. Production mutation needs separate explicit approval for this new migration; the earlier approval covered two policy migrations only.

## Design

- Extend the shared registry and explicit KETIK/PDKT allowlist; existing API/UI consumers derive choices from these.
- Use existing Gemini GenerateContent transport, 180-second timeout, and supportsTemperature=false. No default model or policy changes.
- Add a narrowly scoped zero-cost fallback entry for Hydrogen in usage logging. Existing model fallback rates remain outside this task.
- Add a forward pricing migration with ON CONFLICT DO NOTHING and a scoped rollback.
- Reuse real-backend Monitoring API/browser harnesses and local provider stub. Verify catalog, session snapshot, request model, usage/billing, retention of Flash and unchanged defaults.

Official sources verified 2026-11-14:

- https://aistudio.google.com/docs/models/gemini-4-hydrogen
- https://aistudio.google.com/docs/whats-new-gemini-4-hydrogen
- https://aistudio.google.com/docs/pricing#gemini-4-hydrogen

Hydrogen supports GenerateContent, structured outputs, text/image input; sampling parameters are not honored and `minimal` thinking is rejected. Existing wrappers do not require a new SDK or transport.
Context7 confirmed the existing SDK thinkingLevel contract. Graphify query for KETIK_PDKT_MODEL_IDS located the shared registry/coercion and API consumers; live callers take precedence.
Agent Reach Exa backend was unavailable (Unknown MCP server 'exa'); official pages were read through its Jina route and built-in web fallback.

## Tasklist

- [x] Verify official ID/prices/capabilities, instructions, dirty paths and local target.
- [x] Write/run focused RED E2E before runtime edits.
- [x] Add registry/allowlist and pricing migration/rollback; keep Flash and defaults.
- [x] GREEN real-backend model selection/provider/usage and browser choices.
- [x] Thermo-nuclear self-review; root typecheck/lint/build, diff check; update docs/changelog.
- [x] Integrate one feature commit on main; report exact checks and production pricing status.
- [ ] Production pricing apply: separate explicit approval required.

Unrelated untracked plans are preserved. No paid/provider calls or production E2E.


## Verification and findings

- Initial RED: policy provider scenario, API catalogs, KETIK session model snapshot failed as expected (3 failed, exit 1). Missing-pricing RED after registry admission logged incorrect legacy Flash fallback (0.50/3.00), then the scoped Hydrogen zero-cost guard corrected it (exit 1 before fix).
- `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project monitoring-models-real-backend --reporter=line --workers=1`: 15 passed, exit 0. Model catalogs retain Flash/Flash-Lite, code defaults stay unchanged, Hydrogen is excluded from Telefun assessment, KETIK accepts either model, SIDAK/review requests and usage IDs match Hydrogen, seeded billing is 1.50/7.50 and missing pricing retains tokens at cost zero.
- Local SQL verification (psql with ON_ERROR_STOP against verified loopback 54322): migration applies, repeat insert preserves custom 2/10 prices, rollback/forward replay succeeds, Flash pricing plus schedules are byte-identical before/after. No production mutation.
- The second forecast fixture initially hit a stale SIDAK reference cache after SQL insert/delete; resetSidakReferenceCache now handles the existing SQL-fixture invalidation contract between parameterized model cases.
- UI RED: the additional option pushed Save outside the viewport. Fix follows docs/design.md: bounded dialog height, scrollable min-h-0 body, non-shrinking header/footer. Browser plugin not available; regular repository Playwright is used (T3 preview tools are not used to verify unrequested browser work).
- Scoped UI flow: Monitoring Model → choose Hydrogen while Flash remains visible → save via real Hono/JWT/local Supabase → verify database/audit name → reset to Flash default. Desktop 1280x720 and mobile 390x844; screenshots saved outside repo under /tmp.
- Documentation/code drift: the prior architecture listed only two KETIK/PDKT options and the prior plan listed Hydrogen registration as future work; both are updated. Legacy usage fallback rates for other models differ from the mandatory missing-price-zero rule; only the newly added Hydrogen path is corrected here. An existing legacy ai-models unit case incorrectly expects GPT IDs in KETIK_PDKT_MODELS already before this task; it is neither run nor changed.
- No unit suites or paid model calls were run. Actual Google provider behavior, Telefun audio smoke and production UI are unverified; provider transport is locally stubbed while product API/DB/billing code is real.

- Browser GREEN: `pnpm --dir apps/web exec playwright test monitoring-models-real-backend.spec.ts monitoring-models.spec.ts --reporter=line --workers=1` — 3 passed, exit 0. Save asserted in viewport at 1280x720 and 390x844, no pageerror events, live save/reset/audit verified. Existing hermetic flow also passes. Desktop/mobile screenshots inspected once: `/tmp/hydrogen-model-dialog-1280.png`, `/tmp/hydrogen-model-dialog-390.png`; no clipping/overlap observed in the dialog.
- Impeccable context loaded incumbent PRODUCT/DESIGN; canonical docs/design.md already requires scrolling content and visible actions. Detector over ModelEditDialog returned [] (exit 0). Scoped self-audit: native labels/radios/focus primitives retained, semantic tokens unchanged, responsive content bounded, header/footer visible, CSS-only fix adds no fetch/render state. No broad visual redesign or unrelated repairs. React review found no new waterfall, effect, event orchestration or bundle dependency.
- Thermo-nuclear self-review: shared model metadata and allowlist only, no new model-selection abstraction or lifecycle; existing billing path reused with explicit zero-cost guard; SQL insertion idempotent; CSS constraint restores documented modal contract. Rollback also preserves customized modality prices (including cached-input price), verified locally in a rolled-back transaction.
- The first root typecheck/lint/build batch passed before the user supplied the pricing screenshot. Its in-progress Graphify refresh was stopped when cached-input scope was added; all final gates are repeated against the cache correction before commit.


### Pricing screenshot clarification

The user supplied the official Standard pricing screenshot and asked whether prices matched. Input/output matched the initial draft, but implicit cached input 0.075 was missing; this was corrected before commit/apply. The user question does not authorize production mutation.

- Cache RED: provider fixture reports 10000 input, including 8000 cached, and 500 visible output + 500 thinking tokens. Before correction the cached rate snapshot was 1.50 rather than 0.075 (exit 1).
- Migration now seeds cached_input_text_price_usd_per_million=0.075 along with input/output, leaving all other modality rates null so regular base-price edits still apply. Local draft row was safely reseeded (not applied prod history); rollback recognizes the default cache rate and preserves customized 0.05 cache pricing.
- Context7 SDK reference confirms promptTokenCount already includes cachedContentTokenCount. Gemini wrapper now passes only the cached subset through the existing cached token bucket; remaining input stays unspecified. No second pricing calculator, new schema column, or change to total input/output counters.
- Latest `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project monitoring-models-real-backend --reporter=line --workers=1`: 15 passed, exit 0, including discounted cache pricing and thinking tokens. Each Hydrogen call logs 10000 input total = 8000 cached + 2000 uncached, 1000 output total, and USD 0.011100. No-cache existing model scenario still passes.
- Grounding Search/Maps are not requested by these app calls; no grounding-fee implementation or paid tool call is added. Explicit Gemini caching is not enabled.


## Final gate

- After cached-input correction: `pnpm typecheck`, `pnpm lint`, `pnpm build` — exit 0 each. Lint retains pre-existing warnings in unrelated files. No new dependency, no unit suites.
- `graphify update .` — exit 0; 19823 nodes / 37892 edges / 1261 communities. Local graph updated; oversized HTML view skipped automatically.
- `pnpm --dir apps/web exec playwright test --config=playwright.api.config.ts --project monitoring-models-real-backend -g 'selected SIDAK and KETIK models.*gemini-4-hydrogen' --reporter=json --workers=1` — exit 0, 1 passed. Actual extracted local evidence: [Hydrogen provider paths, rates and cached/thinking usage](../evidence/gemini-4-hydrogen-usage-2026-11-14.json).
- Focused API gate: 15 passed after cached pricing correction; browser gate: 3 passed desktop/mobile + existing hermetic flow. Browser validation preceded the backend-only cached-token correction; no UI code changed afterward.
- `git diff --check`: exit 0. Source review confirms Gemini 3.8 Flash registry/capabilities/defaults and its current/future pricing remain intact. Production application of `20261114130615_add_gemini_4_hydrogen_pricing.sql` is still pending separate explicit approval under AGENTS.md.
