# KETIK/PDKT Scenario Image Persistence Fix

## Requirement

### Goal

Make repeated scenario image/PDF additions and saves lossless for KETIK and PDKT, while making the settings save boundary safe against stale React drafts, pending `FileReader` work, failed requests, duplicate clicks, and out-of-order persistence. Preserve the existing namespaced `user_settings.settings.ketik` and `user_settings.settings.pdkt` contracts; no UI redesign or database migration is part of the minimal fix.

### Acceptance criteria

- [ ] KETIK retains every accepted image when multiple files are selected in one input event, when additions are made in rapid succession, and when `FileReader` completions arrive out of order.
- [ ] PDKT retains every accepted image/PDF when attachments are added in rapid succession and completions arrive out of order.
- [ ] A scenario-local save cannot commit a draft before its accepted file reads finish. A pending/failed read cannot append an attachment to a newly opened or different scenario draft.
- [ ] KETIK scenario-local save produces the complete scenario in the modal draft, and the outer modal save sends that same complete scenario.
- [ ] PDKT wizard/local save produces the complete scenario in the modal draft, and the outer modal save sends that same complete scenario.
- [ ] KETIK `PUT /api/v1/ketik/settings` and PDKT `POST /api/v1/pdkt/settings` persist the correct module namespace without deleting the other module namespace.
- [ ] Save controls are disabled while a save is pending; a second click cannot create a second in-flight settings mutation.
- [ ] A failed settings save leaves the modal/draft available for retry, does not report the change as persisted, and does not silently replace the server value with an optimistic value.
- [ ] An out-of-date backend read/modify/write cannot silently overwrite a newer `user_settings` row. The API must return a conflict response (or use an equivalent atomic guarded write); the client must retain the unsaved draft and show a retry/reloadable error rather than overwrite newer data.
- [ ] Existing default merging, PDKT legacy migration, scenario identity, recipient, template, and attachment contracts remain unchanged.

### Edge cases

- File read completes after the user cancels the editor, closes the modal, or opens another scenario: the result must be ignored.
- `FileReader` returns a non-string result or emits an error: do not append a null/invalid attachment; show the existing user-facing upload error pattern.
- KETIK `multiple` selection: preserve all successful files from the selection; one invalid/oversized file must not discard other valid files.
- PDKT accepts both images and PDFs, with existing limits (500 KB image, 2 MB PDF, five attachments per scenario).
- The same file may be selected again after the input is reset; it must be treated as a new addition.
- Outer save is clicked while a scenario editor is open or while a file is still being read: it must not bypass the scenario-local commit.
- Two settings saves can be initiated from separate tabs/windows or separate module surfaces. The later request must not silently lose a newer row version.
- Network/API failure after local editing must not clear the draft or close the modal before the user has a durable success response.

### Constraints

- Edit only the implementation files and tests listed in the Tasklist when implementation begins; this diagnosis worker edits only the two plan files named by the user.
- Do not touch the unrelated dirty Telefun/OpenAI WebRTC work, graph artifacts caused by that work, or any unrelated documentation.
- Do not add a migration for this fix. Use the existing `user_settings.updated_at` as a compare-and-swap/concurrency guard, or stop and report if the deployed Supabase/PostgREST contract cannot support a guarded write.
- Keep the existing Hono/RPC route shapes and namespaced settings payloads. A `409` conflict response is additive error behavior; do not change successful response shapes.
- Follow React 19 guidance already supplied by the orchestrator: use functional state updaters for async callbacks and disable pending async mutation actions.
- No new image storage system, background queue, or client-side replacement for `user_settings` is in scope.

### References

- `AGENTS.md`
- `docs/AGENT_WORKFLOW.md`
- `docs/architecture.md` — backend-first flow and namespaced settings contract
- `docs/database.md` — `user_settings`, RLS, and `updated_at` schema/security
- `docs/modules.md` — KETIK and PDKT module behavior
- `docs/design.md` — existing modal/button conventions; this is not a redesign
- `docs/rebuild-logs/phase-192-ketik-pdkt-custom-scenarios-draft.md` — draft-object compatibility
- `docs/rebuild-logs/phase-209-pdkt-scenario-editor-wizard.md` — PDKT three-step wizard and outer-save boundary
- Orchestrator-recorded Context7 React evidence: `/react/react/v19.2.7` recommends functional updaters for prior-state async callbacks and disabled pending actions to prevent duplicate async mutations.

## Design

### Root-cause evidence

| Finding | Evidence | Status | Impact |
|---|---|---|---|
| Async image accumulation reads a stale draft snapshot in KETIK | `apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx:106-110`: each `FileReader.onloadend` callback reads `scenarioForm.draft.images` from the render that created the readers, then constructs a replacement array. `apps/web/src/hooks/useCrudForm.ts:24-25` only applies the already-built patch functionally; it cannot recover the stale array. | **Proven bug** | Multiple readers created before a render can each append to the same old array, so only one completion survives. |
| The identical stale accumulation exists in PDKT | `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx:364-371`: the callback reads `scenarioForm.draft.attachmentImages` captured by the callback and writes a replacement array. | **Proven bug** | PDKT has the same data-loss risk for both images and PDFs. |
| A save can race a pending `FileReader` | KETIK local save is `KetikScenariosTab.tsx:77-94`; PDKT wizard save is `PdktScenariosTab.tsx:301-326`. Neither tracks pending reads. KETIK’s outer footer remains available while the scenario editor is open (`SettingsModal.tsx:190-205`), so it can also save the pre-read draft. | **Proven bug** | A valid file selected immediately before Save can be absent from the scenario snapshot; a late callback then updates a reset/closed draft instead of the saved scenario. |
| Scenario-local list commits are otherwise using the correct functional list boundary | KETIK `KetikScenariosTab.tsx:89-92` and PDKT `PdktScenariosTab.tsx:320-323` call `setLocalSettings(previous => ...)` and pass the current `previous.scenarios` into `scenarioForm.save`. | **Not the primary bug** | Do not replace these with captured-array writes; preserve this safe boundary. |
| KETIK can report/hold optimistic state after a failed outer save | `apps/web/src/routes/ketik/index.tsx:108-114` calls `setSettings(newSettings)` before awaiting `ketikApi.saveSettings`; `ketikApi.ts:54-57` also writes the local backup before the network request. The catch only logs. | **Proven bug** | A failed request can make the UI/local backup look newer than `user_settings`; reopening/reloading can lose the user’s image/scenario change or mask the failure. |
| PDKT closes the settings modal without awaiting the save callback | `apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts:260` calls `onSave(settingsToSave)` and immediately `onClose()`; the same pattern is used by both parent handlers at `apps/web/src/routes/pdkt/index.tsx:131-144` and `simulation.tsx:462-477`. | **Proven bug** | A failed request leaves the user outside the editor with no durable-success boundary and no retry of the still-local draft. |
| No pending guard exists for outer settings saves | KETIK `SettingsModal.tsx:190-205` and PDKT `SettingsModal.tsx:267-282` render Save buttons without a pending/disabled state; the draft hooks type `onSave` as `void` callbacks. | **Proven race enabler** | Rapid clicks or a close/reopen/new-save sequence can produce overlapping full-snapshot writes. |
| Both APIs perform non-atomic full-row read/merge/upsert | KETIK `apps/api/src/services/ketik/settings-history.ts:93-111` reads `user_settings`, spreads the root, replaces `ketik`, and upserts. PDKT `apps/api/src/routes/pdkt/settings.ts:46-70` does the same through `writePdktSettings` (`apps/api/src/lib/pdkt-settings.ts:72-80`). | **Proven race/data-loss capability; triggering overlap is a hypothesis** | Concurrent writes can be last-writer-wins: a stale same-module snapshot can replace a newer scenario list, and a KETIK/PDKT cross-module read can lose the other namespace. The repository does not currently prove which production timing triggered the reported intermittent symptom. |
| Persistence itself is namespaced and owner-protected | `supabase/migrations/006_create_user_settings.sql:4-10,20-34`; KETIK writes `settings.ketik`; PDKT writes `settings.pdkt`, preserving existing root keys. | **Proven contract** | Do not “fix” this by replacing the entire JSON document with one module’s settings. |

### End-to-end data flow audit

#### KETIK

```text
<input type=file multiple>
  -> KetikScenariosTab.handleImageUpload (FileReader.onloadend)
  -> scenarioForm.setDraft({ images: ... })
  -> handleSaveScenario -> scenarioForm.save(prev.scenarios, normalizedDraft)
  -> setLocalSettings(prev => ({ ...prev, scenarios: ... }))
  -> useKetikSettingsDraft.handleSave -> buildKetikSettingsForSave
  -> SettingsModal onSave
  -> KetikLanding.handleSaveSettings
  -> ketikApi.saveSettings -> Hono RPC PUT /api/v1/ketik/settings
  -> ketik route zValidator(ketikAppSettingsSchema)
  -> ketikService.saveSettings
  -> select user_settings.settings, merge root + ketik, upsert user_settings
```

Read-back is `GET /ketik/settings` -> `ketikService.getSettings` -> `settings.ketik` -> default/custom scenario merge. Images remain JSON strings in the scenario; there is no separate upload/storage persistence path.

#### PDKT

```text
<input type=file image/PDF>
  -> PdktScenariosTab.uploadAttachment (FileReader.onloadend)
  -> scenarioForm.setDraft({ attachmentImages: ... })
  -> saveScenario -> scenarioForm.save(previous.scenarios, normalized)
  -> setLocalSettings(previous => ({ ...previous, scenarios: ... }))
  -> usePdktSettingsDraft.handleSave -> buildPdktSettingsForSave
  -> SettingsModal onSave
  -> PdktLanding.handleSaveSettings OR PdktSimulation.handleSaveSettings
  -> pdktClient.settings.$post -> Hono POST /api/v1/pdkt/settings
  -> settings route reads user_settings, writePdktSettings(existing, body.settings)
  -> upsert user_settings with root + pdkt namespace
```

Read-back is `GET /pdkt/settings` -> `readPdktSettings(data?.settings)`, including legacy migration and `isLicensed` stripping. The later `/pdkt/session/create` draft-object path consumes the saved scenario but is not the settings persistence boundary; it must not be used as a substitute for saving settings.

### Interfaces and decisions

1. **Functional draft patch:** Extend `useCrudForm.setDraft` to accept either the existing partial patch or a callback `(previousDraft) => partialPatch`. Keep all existing object-patch callers valid. FileReader callbacks must use the callback form so each completion appends to the latest draft.
2. **Read completion guard:** Use a small `readFileAsDataUrl`/pending-read mechanism in each scenario tab. Validate `reader.result` is a string, reject/notify on read errors, track the editor generation, and ignore callbacks from a cancelled/closed/replaced editor. Do not append an invalid `null` result.
3. **No save-before-read:** Disable scenario-local Save while that editor has pending reads. KETIK’s outer modal Save must also be disabled while its scenario editor is open (the user must commit/cancel the editor first), matching PDKT’s existing hidden outer footer during the wizard. This is safer than serializing an incomplete draft.
4. **Await the outer save:** Change draft-hook `onSave` contracts to `Promise<void>`, expose `isSaving`, and make `handleSave` await success before closing the scenario form/modal. Keep the draft on failure. Disable Save/close paths while the request is pending; do not use a success toast or close as a substitute for the API result.
5. **KETIK optimistic-state correction:** `KetikLanding.handleSaveSettings` must persist first and set React state/local backup only after success. On failure, notify the user and reject so the modal remains open. PDKT already updates React state after success; make both PDKT parent handlers return/reject the promise and let the draft hook own the close boundary.
6. **Out-of-order persistence guard:** Use `user_settings.updated_at` as a compare-and-swap token in both settings write paths. Read `settings` plus `updated_at`, then update only when `user_id` and the read timestamp still match. If the guarded update affects no row, return a typed `409 SETTINGS_CONFLICT` and do not overwrite the row. Handle the empty-row insert race without falling back to an unconditional upsert. The client keeps the local draft and reports a conflict/retry action; it must not silently retry a stale full snapshot.
7. **Namespace preservation:** Retain KETIK’s root merge and PDKT’s `writePdktSettings` sanitation, but apply them to the guarded write. Do not add a migration or change the successful route response shape.

### UI states

- `idle`: existing editor and Save controls behave normally.
- `uploading`: file input remains usable within existing limits; scenario-local Save and KETIK outer Save are disabled; an existing compact pending indicator or disabled copy is sufficient, with no decorative redesign.
- `saving`: outer Save is disabled; close/cancel controls cannot discard the in-flight request; button may show the existing “Menyimpan...” style.
- `save failed`: modal remains open with the current draft and a user-facing error; Save becomes enabled again for retry.
- `save conflict (409)`: modal remains open with the current draft; tell the user that settings changed elsewhere and require reload/retry against fresh data rather than overwriting the server.

### Non-goals

- No change to AI generation, draft-object prompt contracts, scenario identity/recipient semantics, mailbox persistence, attachment rendering, or default catalog behavior.
- No replacement of base64 JSON settings with Supabase Storage.
- No broad settings architecture rewrite or cross-module state store.
- No attempt to prove the exact production interleaving without runtime telemetry; tests must prove the deterministic races described above.

## Tasklist

### RED → GREEN → REFACTOR implementation sequence

| Step | RED test first | Minimal GREEN change | Refactor/verification |
|---|---|---|---|
| 1. KETIK async accumulation | Add a KETIK modal test that controls two `FileReader` completions and asserts both images survive scenario-local Save and outer Save. Add a completion-order variant. | Add functional draft patch support in `useCrudForm`; use it in KETIK image callbacks with string/error guards. | Keep current KETIK list functional update; run the focused KETIK modal and hook/helper tests. |
| 2. PDKT async accumulation | Add a PDKT wizard test that controls two rapid image/PDF reads completing out of order and asserts both `attachmentImages` survive local wizard save and outer Save. | Apply the same functional updater/read guard to PDKT attachments. | Preserve existing PDF/image limits and ScenarioAttachments rendering; run focused PDKT modal tests. |
| 3. Pending read vs save | Add tests that hold a reader unresolved, click local Save (and KETIK outer Save), and assert no incomplete scenario is committed; then resolve and assert the attachment can be saved. Add a late completion after cancel/reopen and assert it is ignored. | Track pending read count/editor generation in both scenario tabs; disable the relevant save controls and invalidate late callbacks. | Keep the input reset behavior and existing user-facing validation; run both modal suites. |
| 4. Failed/duplicate outer save | Add KETIK and PDKT modal tests with an unresolved/rejected `onSave` promise: Save is disabled during the request, a second click calls once, failure keeps the modal/draft open, and success closes once. | Make draft-hook save handlers async, await `onSave`, expose `isSaving`, and wire disabled/close behavior through both SettingsModal components. | Update existing sync `onSave` test doubles to resolved promises only where needed; run the focused web suite. |
| 5. KETIK parent persistence semantics | Add a focused KETIK landing/API-client test (or the smallest existing route-level seam) proving state/backup is not committed before a successful API response and that failure is surfaced. | Persist first in `apps/web/src/routes/ketik/index.tsx`; notify and reject on failure. Do not write the local backup before API success unless it is explicitly marked as a pending cache. | Verify no existing settings fallback behavior regresses. |
| 6. PDKT parent promise propagation | Add focused coverage for both PDKT save handlers if the test seam permits; at minimum, assert the modal awaits a rejecting parent callback. | Return the API promise/rejection from `apps/web/src/routes/pdkt/index.tsx` and `simulation.tsx`; keep `setSettings` after success. | Avoid changing mailbox/evaluation flows. |
| 7. Guarded API writes | Add KETIK service and PDKT settings-route tests for: preserving the other namespace, updating a matching `updated_at`, rejecting a stale timestamp with `SETTINGS_CONFLICT`/409, and not falling back to unconditional upsert. Add an empty-row/unique-insert race characterization if the Supabase mock can represent it. | Implement the smallest shared or equivalent compare-and-swap helper in the existing KETIK service and PDKT settings route. Use `updated_at` already present in migration 006; do not add a migration. | Run API settings/session suites and inspect every successful/error response shape. |
| 8. Conflict UI behavior | Add a web test where `onSave` rejects with the API conflict error and assert the draft remains visible and retry is possible. | Map 409 to a human message; do not auto-retry a stale full snapshot. | Confirm failure and conflict paths have no data-loss side effect. |

### Exact affected implementation files

- `apps/web/src/hooks/useCrudForm.ts`
- `apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx`
- `apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts`
- `apps/web/src/routes/ketik/components/SettingsModal.tsx`
- `apps/web/src/routes/ketik/index.tsx`
- `apps/web/src/routes/ketik/ketikApi.ts` (only if the conflict/error type needs mapping; do not change successful payloads)
- `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx`
- `apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts`
- `apps/web/src/routes/pdkt/components/SettingsModal.tsx`
- `apps/web/src/routes/pdkt/index.tsx`
- `apps/web/src/routes/pdkt/simulation.tsx`
- `apps/api/src/services/ketik/settings-history.ts`
- `apps/api/src/routes/ketik.ts` (only to map the typed settings conflict to HTTP 409)
- `apps/api/src/routes/pdkt/settings.ts`
- `apps/api/src/lib/pdkt-settings.ts` (only if conflict/error helper belongs at the existing namespace boundary)

### Exact affected tests

- `apps/web/src/__tests__/ketik-settings-modal.test.tsx`
- `apps/web/src/__tests__/pdkt-settings-modal.test.tsx`
- `apps/web/src/__tests__/settings-draft-helpers.test.ts`
- `apps/web/src/__tests__/settings-draft-normalizers.test.ts` (only if the file-read helper is placed beside the existing normalizers)
- `apps/api/src/__tests__/ketik-service.test.ts`
- `apps/api/src/__tests__/pdkt-settings.test.ts` (extend pure namespace tests only where appropriate)
- `apps/api/src/__tests__/pdkt-settings-route.test.ts` (new, if no existing route test seam is suitable)
- `apps/api/src/__tests__/ketik-settings-route.test.ts` (new, if route-level conflict mapping is not covered by an existing test)

Do not edit Telefun files, migrations, generated graph output, or unrelated tests.

### Test strategy and commands

Run each RED test alone and record that it fails for the intended missing behavior before the corresponding production change. Then run GREEN commands:

```bash
# Web focused regression tests
pnpm --filter @trainers/web exec vitest run \
  src/__tests__/ketik-settings-modal.test.tsx \
  src/__tests__/pdkt-settings-modal.test.tsx \
  src/__tests__/settings-draft-helpers.test.ts \
  src/__tests__/settings-draft-normalizers.test.ts

# API focused settings and existing contract tests
pnpm --filter @trainers/api exec vitest run \
  src/__tests__/ketik-service.test.ts \
  src/__tests__/pdkt-settings.test.ts \
  src/__tests__/ketik-generate-route.test.ts \
  src/__tests__/pdkt-session-create-route.test.ts \
  src/__tests__/pdkt-session-service.test.ts

# Progressive product gates required by AGENTS.md for the eventual code change
pnpm lint
pnpm build
pnpm test:core

git diff --check
git status --short
```

Expected result for the focused suites after implementation: zero failures, including the new regressions. Do not claim the full gates passed unless their commands actually run and exit 0. The existing baseline observed during diagnosis was:

- `pnpm --filter @trainers/web exec vitest run src/__tests__/ketik-settings-modal.test.tsx src/__tests__/pdkt-settings-modal.test.tsx src/__tests__/settings-draft-helpers.test.ts src/__tests__/settings-draft-normalizers.test.ts` — exit `0` (4 files, 44 tests passed).
- `pnpm --filter @trainers/api exec vitest run src/__tests__/ketik-service.test.ts src/__tests__/pdkt-settings.test.ts src/__tests__/pdkt-session-service.test.ts src/__tests__/pdkt-session-create-route.test.ts src/__tests__/ketik-generate-route.test.ts` — exit `0` (5 files, 67 tests passed).

These baseline tests do not cover the diagnosed FileReader, pending-save, or concurrent-write races; their passing status is not evidence that the bug is fixed.

### Estimates and dependencies

| Work item | Estimate | Dependencies |
|---|---:|---|
| Functional draft/read guards and KETIK/PDKT attachment tests | 1.5–2 hours | None |
| Pending-read/save UI state and async outer-save contract | 1.5–2.5 hours | Attachment tests establish RED behavior |
| Guarded API writes and conflict mapping/tests | 2–3 hours | Confirm Supabase client supports conditional update/select in this repo |
| Focused suite, typecheck/build/lint repair, diff/scope review | 1–2 hours | All implementation slices green |
| Total | 6–9.5 hours | No migration or remote DB operation assumed |

If conditional writes cannot be expressed with the current Supabase client without a migration/RPC, stop before inventing a weaker in-memory lock; report the blocker and preserve the client-side pending/failure safeguards as a separate safe slice.

### Risk register

| Risk | Likelihood/impact | Mitigation |
|---|---|---|
| Changing `setDraft` typing breaks existing object-patch callers | Medium/medium | Add a union/callback overload, keep object calls unchanged, run TypeScript/build and all settings tests. |
| A late reader mutates a newly opened draft | Medium/high | Generation token invalidation on cancel/close/new add/edit; test cancel/reopen explicitly. |
| Disabling KETIK outer Save while the scenario editor is open changes an undocumented convenience flow | Medium/medium | Make the local scenario Save the explicit required boundary; add an accessible disabled reason and test that no incomplete draft can bypass it. |
| Awaiting save leaves existing callers with `void` callback types | Medium/medium | Change both module callback contracts to `Promise<void>` and update test doubles/parent handlers together. |
| Conflict response inconveniences a user editing stale settings | Medium/medium | Preserve the local draft, show a clear reload/retry message, and never silently overwrite the newer row. |
| `updated_at` precision/trigger behavior prevents a conditional update | Low/ high | Add a focused mock/DB-contract check; stop and report if the current PostgREST behavior cannot safely compare the value. |
| Existing PDKT legacy sanitation is accidentally bypassed | Low/high | Keep `writePdktSettings` at the namespace boundary and retain all existing PDKT settings tests. |
| A test passes only because jsdom FileReader ordering is deterministic | Medium/medium | Stub FileReader and explicitly invoke completion callbacks in reverse order. |

### Rollback plan

1. Revert only the listed implementation/test files, not the dirty Telefun files or graph artifacts.
2. If the guarded API write is blocked, revert that API slice independently; do not replace it with an unconditional upsert. Keep the functional FileReader updater and pending/failure UI fix if those focused tests remain green.
3. Re-run the two baseline focused commands, `git diff --check`, and `git status --short`; report any pre-existing failures separately.
4. No database rollback is needed because this plan adds no migration.
