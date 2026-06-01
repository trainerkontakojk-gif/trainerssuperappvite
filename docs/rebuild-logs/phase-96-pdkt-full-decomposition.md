# Rebuild Log - Phase 96: PDKT Full Decomposition

## Deskripsi

Menyelesaikan dekomposisi penuh route handlers dan service layer dari file monolitik PDKT. Barrel files (`routes/pdkt.ts` dan `services/pdkt-service.ts`) direduksi menjadi facade murni, sementara logic didistribusikan ke 5 route sub-modules + 5 service sub-modules. Frontend `PdktScenariosTab` juga dipecah menjadi 5 sub-komponen terfokus. Analogi langsung dengan Phase 79 (SIDAK Route Full Decomposition) dan Phase 80 (Telefun Route Full Decomposition).

## Detail Perubahan

### PDKT Route Decomposition

| Sub-modul            | Baris | Endpoints                                                                                       |
|----------------------|-------|-------------------------------------------------------------------------------------------------|
| `pdkt/index.ts`      | 16    | Aggregate sub-routers ke satu `pdkt` Hono instance                                              |
| `pdkt/simulation.ts` | 162   | GET `/scenarios`, GET `/consumer-types`, POST `/generate-identity`, POST `/generate-template`, POST `/session/init`, POST `/session/create` |
| `pdkt/mailbox.ts`    | 167   | GET `/mailbox`, POST `/mailbox/batch`, DELETE `/mailbox/:id`, POST `/mailbox/reply`, POST `/mailbox/evaluate` |
| `pdkt/history.ts`    | 185   | GET `/history`, GET `/history/eval/:id`, POST `/history/retry-eval`, DELETE `/history`, DELETE `/history/:id` |
| `pdkt/settings.ts`   | 82    | GET `/settings`, POST `/settings`                                                               |
| `pdkt/route-utils.ts`| 91    | Shared `Variables` type, `getBearerToken`, `getUserClient`, `pdktErrorMessage`, `jsonNotFound`, `jsonAiError`, `jsonServerError` |
| **Total**            | **703** | **16 route handlers**                                                                          |

### PDKT Service Decomposition

| Sub-modul                  | Baris | Exports                                                                              |
|----------------------------|-------|---------------------------------------------------------------------------------------|
| `pdkt/catalog-service.ts`  | 167   | `DEFAULT_SCENARIOS`, `DEFAULT_CONSUMER_TYPES`, `getScenarios`, `getConsumerTypes`, `generateRandomIdentity` |
| `pdkt/session-service.ts`  | 407   | `generateScenarioEmailTemplate`, `initializeEmailSession`, `resolvePdktGenerationConfig`, policy wrappers |
| `pdkt/evaluation-service.ts` | 234 | `evaluateAgentResponse`, `processPdktEvaluation` (worker with claiming mechanism)    |
| `pdkt/mailbox-service.ts`  | 108   | `fetchMailboxItems`, `createMailboxItem`, `softDeleteMailboxItem`, `submitMailboxReply` |
| `pdkt/shared-utils.ts`     | 90    | `callAI` (provider routing), `isTransientAiError`, `normalizeSubject`               |
| **Total**                  | **1,006** | **14 service functions**                                                          |

> Catatan: `image-generation.ts` (127) dan `mailbox-session.ts` (71) sudah ada sejak Phase 95 dan tidak dipecah ulang. Keduanya tetap di bawah `pdkt/`.

### PDKT Scenarios Tab Frontend Decomposition

| Sub-komponen               | Baris | Tanggung Jawab                                                                |
|----------------------------|-------|-------------------------------------------------------------------------------|
| `scenarios/ScenarioList.tsx`     | 187 | Daftar skenario, control bar, image gen toggle, select all/unselect all |
| `scenarios/ScenarioForm.tsx`     | 172 | Form input skenario (kategori, judul, deskripsi, LJK toggle)              |
| `scenarios/ScenarioAttachments.tsx` | 62 | Upload + preview lampiran manual                                          |
| `scenarios/ScenarioAIGenerator.tsx` | 36 | Tombol "Generate" template AI + spinner                                  |
| `scenarios/ScenarioTemplateField.tsx` | 71 | Subject + body editor + toggle "Always use this email"                  |

`PdktScenariosTab.tsx` direduksi dari **467 → 263 baris** (orchestration only, import sub-komponen + handler delegation).

### File Terpengaruh

#### Backend (API)
- **[MODIFY]** `apps/api/src/routes/pdkt.ts` — 723 → 8 baris (facade: `export { pdkt } from "./pdkt/index"`)
- **[MODIFY]** `apps/api/src/services/pdkt-service.ts` — 980 → 15 baris (barrel: `export * from "./pdkt/..."` + re-export `parseJsonFromModelText`)
- **[NEW]** `apps/api/src/routes/pdkt/index.ts` — Hono aggregate (16 baris)
- **[NEW]** `apps/api/src/routes/pdkt/simulation.ts` — scenarios + consumer-types + generate-identity + generate-template + session/init + session/create
- **[NEW]** `apps/api/src/routes/pdkt/mailbox.ts` — mailbox CRUD + reply + evaluate
- **[NEW]** `apps/api/src/routes/pdkt/history.ts` — history list + eval status + retry + delete
- **[NEW]** `apps/api/src/routes/pdkt/settings.ts` — settings GET/PUT
- **[NEW]** `apps/api/src/routes/pdkt/route-utils.ts` — shared `Variables`, `getUserClient`, error mapper helpers
- **[NEW]** `apps/api/src/services/pdkt/catalog-service.ts` — scenario/consumer defaults + identity generator
- **[NEW]** `apps/api/src/services/pdkt/session-service.ts` — template + initial email generation + config resolver
- **[NEW]** `apps/api/src/services/pdkt/evaluation-service.ts` — AI eval + background worker (claiming + lease)
- **[NEW]** `apps/api/src/services/pdkt/mailbox-service.ts` — mailbox RPC wrappers (fetch, create, soft-delete, reply)
- **[NEW]** `apps/api/src/services/pdkt/shared-utils.ts` — `callAI` provider router + transient error detection + subject normalization
- **[MODIFY]** `apps/api/src/services/pdkt/image-generation.ts` — typed error handling (`unknown` narrowing)
- **[MODIFY]** `apps/api/src/services/pdkt/mailbox-session.ts` — typed `SupabaseClient` parameter + typed error handling

#### Frontend (Web)
- **[MODIFY]** `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx` — 467 → 263 baris (delegates ke 5 sub-komponen)
- **[NEW]** `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioList.tsx` (187 baris)
- **[NEW]** `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioForm.tsx` (172 baris)
- **[NEW]** `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioAttachments.tsx` (62 baris)
- **[NEW]** `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioAIGenerator.tsx` (36 baris)
- **[NEW]** `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioTemplateField.tsx` (71 baris)

#### Test
- **[MODIFY]** `apps/api/src/__tests__/pdkt.test.ts` — type-cast mockSupabase ke `Parameters<typeof pdktService.fetchMailboxItems>[0]` setelah strict typing di `mailbox-service.ts` (`SupabaseClient` alih-alih `any`)

#### Graph
- **[MODIFY]** `graphify-out/*` — auto-sync setelah `graphify update .`

## Pengujian & Verifikasi

- **API tests**: `pnpm --filter @trainers/api test` — **519 passed** (520 total, 1 skipped), 0 failures
- **Web tests**: `pnpm --filter @trainers/web test` — **503 passed** (503 total), 0 failures
- **Graphify**: `graphify update .` — completed (no topology changes vs cached graph; re-validates decomposition)
- **Structural integrity**: kedua barrel files hanya berisi re-exports, tidak ada logic
- **Backward compatibility**: `pdkt-service.ts` re-export publik tetap sama (`fetchMailboxItems`, `createMailboxItem`, `initializeEmailSession`, `generateScenarioEmailTemplate`, dll.) — semua consumer imports masih valid

## Catatan Tambahan

- `mailbox-session.ts` tidak di-merge ke `mailbox-service.ts` walau serupa nama — `mailbox-session` adalah **orchestrator** (resolve config → init session → create mailbox row), sedangkan `mailbox-service` adalah **RPC wrappers** murni. Pemisahan ini menjaga single-responsibility.
- `route-utils.ts` bukan "service" melainkan route-level helpers (auth context extraction, error response builders) yang dipakai lintas sub-router. Tidak dipecah per-sub-modul karena volume kecil (~90 baris) dan shared.
- `session-service.ts` (407 baris) adalah sub-modul terbesar — menyimpan 3 public functions yang punya alur serupa (resolve config → call AI → validate → retry). Dipertahankan sebagai satu file karena retry logic + policy validation-nya share helper internal yang banyak.
