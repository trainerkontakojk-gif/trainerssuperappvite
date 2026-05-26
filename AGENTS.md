# AGENTS.md - Trainers SuperApp Rebuild

## MCP Servers

- **context7** - Documentation lookup & code search via `@upstash/context7-mcp` (local mode, configured in `opencode.json`).
  - 2 tools: `resolve-library-id` (cari library ID) dan `query-docs` (ambil dokumentasi terbaru).
  - API key disimpan di `.env.local` sebagai `CONTEXT7_API_KEY`.
  - Wajib dipanggil SEBELUM mengimplementasikan fitur dengan library eksternal.
- **supabase-mcp-server** - Gunakan untuk query data Supabase dan operasi database.
- **shadcn** - Gunakan untuk mencari dan menginstall komponen shadcn/ui. Selalu cek registry sebelum membuat komponen custom.

## Subagent Usage

- Gunakan subagent untuk tugas yang memerlukan eksplorasi codebase mendalam atau riset multi-step.
- Berikan instruksi yang spesifik tentang arsitektur monorepo (apps/web, apps/api, packages/types).

## ECC Plugin

**WAJIB** gunakan plugin **ECC (Everything Claude Code)** (`ecc-universal`) di setiap task. ECC menyediakan 48 specialized agents, 183 skills, dan 79 commands. Pilih agent/skill yang sesuai dengan konteks task:

- Fitur kompleks / refactoring → **planner** agent
- Bug fix / fitur baru → **tdd-guide** agent
- Arsitektur / system design → **architect** agent
- Setelah menulis kode → **code-reviewer** agent
- Kode sensitif / security → **security-reviewer** agent
- Build error → **build-error-resolver** agent
- Cek dokumentasi library → **docs-lookup** agent (Context7)
- Autonomous loop / monitoring → **loop-operator** agent

ECS agents bisa dipanggil via `Task` tool dengan `subagent_type` yang sesuai.

## Commands (Monorepo)

Project ini menggunakan **pnpm** dan **Turborepo**.

- **Install:** `pnpm install`
- **Dev:** `pnpm dev` (Menjalankan web, api, dan telefun secara paralel)
- **Build:** `pnpm build`
- **Lint:** `pnpm lint` (ESLint 9 flat config — `eslint.config.mjs` di root)
- **Lint (single workspace):** `pnpm --filter @trainers/web lint`
- **Test:** `pnpm test` (vitest — 300+ tests covering API services + frontend hooks/components)
- **Test (api only):** `pnpm --filter @trainers/api test`
- **Test (web only):** `pnpm --filter @trainers/web test`
- **Format:** `pnpm format`
- **Telefun standalone:** `pnpm --filter @trainers/telefun dev`

## Verified Structure

Monorepo dengan pembagian tanggung jawab yang jelas:

- **`apps/api`**: Backend Hono. Pusat validasi, business logic, AI usage, dan database mutations.
- **`apps/web`**: Frontend Vite + React. Fokus pada UI dan interaksi, mengonsumsi API via Hono RPC.
- **`apps/telefun`**: Service khusus untuk persistent WebSocket.
- **`packages/types`**: Shared Zod schemas dan TypeScript interfaces.
- **`reference-repo/`**: Sumber referensi logic dari codebase lama (Next.js).

## Development Conventions

- **Architecture:** Monorepo Backend-First.
- **Type Safety:** Wajib menggunakan **Hono RPC**. Export `AppType` dari API dan gunakan `hc<AppType>` di Web untuk full type-safety.
- **Supabase Data Handling:**
  - **Hybrid Client Pattern**:
    - Default: Gunakan User JWT untuk menghormati RLS.
    - Admin Client (Service Role): Hanya di backend untuk AI logging, background jobs, dan heavy reports.
  - **NEVER** query data sensitif langsung dari frontend.
- **AI Integration**:
  - Semua AI calls wajib dicatat (logged) dari backend ke tabel `ai_usage_logs`.
  - Jika pricing model tidak ada, tetap catat token dengan cost 0.
- **Error Handling**: Jangan biarkan error database mentah (misal: foreign key error) muncul ke user. Berikan pesan yang manusiawi.
- **Linting**: ESLint 9 flat config (`eslint.config.mjs` di root) dengan `typescript-eslint` recommended, `react-hooks` recommended (kecuali `set-state-in-effect` dimatikan), dan `react-refresh`. Unused vars prefix `_` diperbolehkan (warning). `no-explicit-any` dimatikan. Formatting via Prettier (`pnpm format`).

## Golden Rules

### 1. FCP/LCP Wajib Dipertimbangkan di Setiap Build

- **Reference-repo (Next.js)** memiliki masalah FCP (First Contentful Paint) dan LCP (Largest Contentful Paint) yang memberatkan aplikasi karena bundle besar and SSR overhead.
- **Build kedepan WAJIB** mempertimbangkan FCP/LCP, disesuaikan dengan arsitektur Vite + React SPA:
  - Code splitting & lazy loading sudah diterapkan (fase 13) — jangan regresi saat menambah route baru.
  - Hindari static import library besar (Recharts >300 kB, ExcelJS/xlsx >400 kB) di komponen yang tidak selalu dikunjungi. Gunakan dynamic import.
  - Perhatikan ukuran bundle per-chunk. Jika ada chunk >200 kB yang bukan vendor stabil, pertimbangkan split lanjutan (`manualChunks`).
  - Tambahkan resource hints (`modulepreload`, `preconnect`, `dns-prefetch`) di `index.html` untuk mempercepat discovery chunk kritis.
  - Jangan tambahkan gambar/font besar tanpa optimasi (lazy loading, compression, responsive images via `srcset`).
  - Jika menambah library baru, selalu cek bundle impact-nya. Library ringan > library populer tapi berat.

### 2. Dokumentasi Wajib Update Sebelum Commit

Setiap perubahan behavior, arsitektur, atau fitur baru wajib diiringi update docs di folder `docs/` atau update `AGENTS.md` / `GEMINI.md` jika ada konvensi baru.

### 3. Dokumentasi Ramah Awam (Human-Readable)

Pastikan README dan panduan modul mudah dipahami oleh pembaca non-teknis.

### 4. File Editing Harus Pakai Unified Diff

Baca file terbaru, buat patch minimal, dan terapkan. Hindari overwrite penuh jika tidak perlu.

### 5. Spec-Driven Development Wajib

Setiap memulai pekerjaan baru (fitur, bug fix, refactor), WAJIB menerapkan **Spec-Driven Development (SDD)**:

1. Tulis spec terlebih dahulu: tujuan, acceptance criteria, edge cases, dan constraint teknis.
2. Buat plan implementasi (lihat aturan #6) sebelum menulis kode.
3. Jangan memulai coding sebelum plan diverifikasi / disetujui.

### 6. Plan Wajib Dibuat (wajib di folder `plan/`)

Setiap plan implementasi **WAJIB** dibuat dan disimpan di folder `plan/markdown/<nama-fitur>.md` dalam format **Markdown** — gunakan struktur terstruktur dengan heading, tabel, checklist, dan code block.

Format **HTML** (`plan/html/<nama-fitur>.html`) bersifat **opsional** — buat hanya jika ada perubahan visual signifikan dan perlu menampilkan mockup visual. Gunakan styling HTML + CSS inline agar mudah dibuka di browser.

Setiap file plan WAJIB mengandung 3 seksi utama (mengadopsi struktur `.kiro`):

1. **Requirement** — Tujuan, acceptance criteria, edge cases, constraint teknis, dan spec references.
2. **Design** — Arsitektur, alur data, component tree, interface changes, dan keputusan teknis.
3. **Tasklist** — Langkah-langkah implementasi terperinci, file affected, test strategy, timeline estimasi, dependensi, risk register, dan rollback plan.

### 7. Selalu Referensi Context7 + ECC untuk Dokumentasi

Sebelum mengimplementasikan fitur yang menggunakan library eksternal (Supabase, Hono, Zod, TanStack, dsb), **WAJIB** lakukan:

1. Panggil ECC **docs-lookup** agent (via `Task` tool) untuk cek dokumentasi terbaru library.
2. Gunakan tool `context7` (via MCP server `@upstash/context7-mcp`) untuk mengecek dokumentasi terbaru. Alur:
   - Panggil `resolve-library-id` dulu untuk mendapatkan library ID (format: `/org/project`).
   - Panggil `query-docs` dengan library ID tersebut untuk ambil dokumentasi.
     Hindari penggunaan API yang deprecated dari data training lama.

## AI Integration Conventions

- **Model registry**: `apps/api/src/lib/ai-models.ts` adalah sumber kebenaran untuk ID model dan provider mapping.
- **Usage logging**: Setiap AI call via `generateGeminiContent()` atau `generateOpenRouterContent()` mewajibkan `UsageContext` dan `userId`. Log otomatis ke `ai_usage_logs` via `logAiUsage()`.
- **Provider routing**: `resolveModelProvider()` mendeteksi Gemini (tanpa `/`) vs OpenRouter (dengan `/`).
- **Retry**: OpenRouter punya 4-attempt retry dengan backoff untuk 429. Gemini punya fallback jika `developer instruction not enabled`.
- **Error handling**: Jangan asumsikan `response.text` stabil antar versi SDK. Ekstraksi teks defensif: cek string, function, lalu fallback ke candidates.
- **Scenarios & constants**: Didefinisikan server-side di `apps/api/src/services/ketik-service.ts` dan `pdkt-service.ts` (belum DB-backed).

## Specialized Sub-Agents

- **SIDAK-Auditor**: Fokus pada audit logic SIDAK dari `reference-repo` ke `apps/api`. Pastikan validasi indicator_id dan service_type ketat sebelum insert.
- **AI-Usage-Guard**: Memastikan setiap modul AI (KETIK, PDKT, Telefun) melakukan logging usage secara konsisten melalui service backend.

## Environment Variables

- **Frontend (`apps/web`)**: Menggunakan prefix `VITE_` (e.g., `VITE_SUPABASE_URL`, `VITE_TELEFUN_WS_URL`).
- **Backend (`apps/api`)**: Menggunakan variabel langsung (e.g., `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`).
- **Telefun Server (`apps/telefun`)**: Menggunakan variabel langsung (e.g., `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`).
- **MCP / Tools**: `CONTEXT7_API_KEY` disimpan di `.env.local` untuk context7 MCP server.
- File `.env.local` di root diabaikan oleh git, tapi isinya harus disinkronkan ke masing-masing apps jika diperlukan (atau load dari root).

## Phase Progress

1. Monorepo Foundation (DONE)
2. Auth & Layout (DONE)
3. SIDAK Core (DONE)
4. KETIK & PDKT (DONE)
5. Report AI (DONE)
6. Upload Excel SIDAK (DONE)
7. Telefun WS (DONE)
8. Hardening (P0 Critical — DONE)
9. Deployment (P0 Critical — DONE)
10. Frontend Matching & Profiler Module (DONE)
11. SIDAK Reports (DONE)
12. Polish & QA — Loading states, empty states, error handling (DONE)
13. Perf — Code splitting + lazy loading (DONE)
14. Testing — Vitest API unit tests + Frontend component tests (DONE)
15. Admin Management Parity (DONE)
16. Dashboard Visual & Data Parity (DONE)
17. KETIK Carbon Copy (DONE)
18. PDKT Carbon Copy (DONE)
19. Frontend Checklist Fixes — Toast, route guards, pagination, transcript export, draft autosave, Telefun settings, QA versioning (DONE)
20. Audit Gaps Fix — Telefun replay HTTP layer, profiler duplicate integrity, annotation deletion policy (DONE)
21. Role Hardening + AI Logging — QA removed from mutation endpoints, adminOnly middleware, AI usage status/error logging, showArchived filter (DONE)
22. Telefun Parity & Advanced Voice Metrics — Realistic mode, voice assessment AI, high-fidelity UI (DONE)
23. Profiler Parity Fixes — Backend cascade/rename-sync/batch-move, labelJabatan expansion, 2 new modal components, useQueryParams bug fix, html2canvas-tailwind-fix, isReadOnly auth context, label consistency (DONE)
24. SIDAK Dashboard Legacy Parity — Restored legacy defaults, filter bar, KPI cards, trend panel, leaderboard, parity test (DONE)
25. SIDAK Agent Service Pill Stability — Service pills from raw temuan rows, regression test for refresh collapse (DONE)
26. SIDAK Parameter Legacy Parity — Rebuilt versioned settings shell, history picker, weights slider, parameters list card view, and publish flow (DONE)
27. SIDAK Agent Detail Findings Parity — Local score badges, month accordion, ticket grouping, and role-based action permission (DONE)
28. SIDAK Ranking Fatal Legacy Parity — Strict `nilai===0` + critical predicate for `hasCritical`, phantom-padding exclusion, API + frontend regression tests (DONE)
29. SIDAK Agent Directory Load-More Copy — Dynamic next-batch copy for `/sidak/agents`, accurate remaining-count label, and regression test (DONE)
30. SIDAK Input Stability & QA Baseline Recovery — Fixed agents.map crash via defensive response parsing, added draft-empty CTA warning/CTA, unlinked indicator guard on save/import, and improved validation messaging (DONE)
31. Dashboard User Management Legacy Parity — Restored trainer+admin role parity in admin routes, deleted-user filtering in getUsers, server-side reset password flow, guided access-group builder (Team/Service/Agent), aligned access-approval contract, synced activity log schema with delete action, and rollback-safe reassign for leader access (DONE)
32. SIDAK Period Delete Fail-Closed Guard — Hardened `deletePeriod()` to abort when verification queries fail, preventing fail-open cascade deletion risk; added API regression test for verification-error path (DONE)
33. Access Approval & Access Group Legacy Parity Hardening — Added re-check `status=approved` before delete in reassign, guarded `reviewed_by` audit update, locked builder Specific Agent to team-first flow, added 6 API + 3 web regression tests (DONE)
34. Monitoring & Activity Logs Legacy Parity — 3-tab monitoring (history/usage/pricing), WIB boundary, unified history endpoint, role matrix (trainer/leader/admin), sidebar link fix, shared logActivity helper, activity logging coverage for SIDAK (8 events) and Profiler (10 events) (DONE)
35. Monitoring Unauthorized & Visual Legacy Parity Fix — Replaced raw unauthenticated fetch() with getApi/putApi/postApi helpers, added human-friendly error mapping, applied legacy visual patterns (hero header, tab strip, refined cards), added toast feedback for pricing saves, 20 regression tests (DONE)
36. Dashboard Post-Login Legacy Parity — Auth-aware data fetching (Bearer token on all protected API calls), recent activity parity (5 items), analytics lazy loading (Recharts split from main bundle with Suspense skeleton) (DONE)
37. Database Legacy Parity Audit — Read-only audit terhadap hosted target (ruosnjmtywcrghjgqugz). 13 tabel hilang, 29 fungsi hilang, 10+ tabel data kosong. App smoke tests lulus (258/258) tapi data parity tidak tercapai dari sisi live database. (DONE)
38. Database Legacy Parity Remediation — May qa_temuan incremental sync (144 rows, 0 conflicts), QA Parameter recovery (rule-version parity + baseline-aware UI empty state), dashboard summary function fix (Vite schema compatible), MV contract restored (29 rows, concurrent refresh OK), summary backfill (29 period + 320 agent rows). Scripts + migrations + tests + docs. (DONE)
39. Railway Deployment OOM Fix — Replaced `vite` dev server with `vite preview` in production (Railway). Exit 137/OOM caused by Vite dependency pre-bundling in dev mode. Added `railway.toml` for explicit build/start commands, `--host 0.0.0.0` flag, `PORT` env support in vite.config.ts, `turbo` `start` task with `dependsOn: ^build`, and `.node-version` pinning Node.js 22 (Vite 8.0.13 requires >=22, Nixpacks defaulted to 18). Healthcheck fix: Vite separates `server.port` and `preview.port`; default `preview.port` is 4173 so Railway dynamic `PORT` was ignored. Explicit `preview` block with shared `appPort`, `host: "0.0.0.0"`, and `strictPort: true` ensures Railway healthcheck hits the correct port. (DONE)
40. Railway Healthcheck Hardening — Root `start` locked to web-only (`pnpm run start:web`) to prevent multi-service PORT collision. Added service-specific scripts (`start:web`, `start:api`, `start:telefun`, `build:web`, `build:api`, `build:telefun`, `start:all`). Created smoke test (`scripts/deployment/railway-web-healthcheck-smoke.mjs`) that spawns web on test PORT, polls `/`, asserts HTTP 200. Updated `docs/deployment.md` with Railway Settings table (build/start commands + healthcheck paths per service). Context7-verified against Railway monorepo + healthcheck docs. (DONE)
41. Railway Web Start Command Drift Guard — Railway Web service was still running `@trainers/web dev`/`vite` in production, triggering Vite optimizer OOM (`Exit 137`). Added guard (`scripts/deployment/guard-no-railway-dev.mjs`) that blocks Vite dev server execution when Railway env vars detected. Prefixed `apps/web/package.json` `dev` script with guard. Created 5-case regression test (`railway-dev-guard.test.ts`). Documented troubleshooting flow in `docs/deployment.md` with exact Railway service settings to fix drift. Also fixed cross-service connectivity: `VITE_API_URL` must have `/api/v1` suffix (API routes under `basePath("/api")` + `/v1/...`), `NODE_ENV=production` mandatory on API (CORS fallback to `localhost:3000` without it), `ALLOWED_ORIGINS` must be set per service. (DONE)
42. Logout Redirect & Auth Guard Hardening — Added manual href redirect on logout, implemented requireAuth helper, secured 7 unprotected modules, added regression test and rebuild log. (DONE)
43. Telefun Schema & Recharts Dimension Guard — Added Telefun setting types, Recharts dynamic import error boundary, and regression tests. (DONE)
44. Telefun Railway Force-Close & Legacy Parity Fix — JSON audio base64, settings/model/identity parity, close-code mapping, duration cues, RLS recording path, session deduplication (DONE)
45. Telefun Production Voice And Session Save Repair — DB migrations for missing feedback column, client-side session finalizer sequence repair, base64 inline audio decoding for model responses, gated client audio until setup complete, added contract tests (DONE)
46. Telefun V2 End-Call Lifecycle & Finalizer Hardening — introduced normalizing state, guarded premature unmounting, automated session fallback creation, handled granular upload failures, added 18 unit tests (DONE)
47. Telefun Call UI Parity, Replay Seek/Retry, dan Prompt Perilaku Legacy (Final Audit) — Full system instruction parity (emotion branching, KONSISTENSI SUARA, ATURAN ROLEPLAY, expanded ATURAN BICARA), ringtone+hold music+hold timer, volume segments+avatar upgrade+per-state status card+circular controls, dead air/interruption/stalled watchdog hardening, AI annotation generation endpoint, 19 prompt builder tests (DONE)
48. KETIK Legacy Parity Upgrade — 3-tier time instruction (near end/wrap up/still long) via SessionTimingContext, strictScriptMode for OpenRouter with scenario scripts, allowSolutionAcknowledgement timeout guard (11 instructional cues + 7 action verbs), timing data passthrough from frontend to backend (DONE)
49. PDKT Legacy Parity Hardening — Settings contract alignment ({success,data}), access matrix role lock (trainer/qa/admin), history replay without active mailbox, client_request_id idempotency, bounded usage delta retry, human-friendly error mapping, DUMMY_PROFILES 5→20 + city randomization, coercion robustness (writingStyle + consumerNameMention), legacy script migration, test uplift 27+14 tests (DONE)
50. Railway Login Non-Admin E2E Fix — Backend auth middleware hardened (is_deleted check, legacy status normalization via normalizeAuthProfileStatus, differentiated error codes: ACCOUNT_DELETED/ACCOUNT_PENDING/ACCOUNT_INACTIVE/PROFILE_NOT_FOUND/PROFILE_ERROR), .single() → .maybeSingle() for defensive null handling, CORS warning log when ALLOWED_ORIGINS empty in production, frontend fetchApi HTML response detection for SPA fallback errors, 18 API + 3 web regression tests (DONE)
51. Auth Login, Reset Redirect & Approval Guard Hardening — Added `qa` to type unions (UserProfile, ManagedUser), CSRF header (`X-Requested-With`) + 401 interception with auto-redirect in fetchApi, beforeLoad guards for `/reset-password` (blocks non-recovery access) and `/waiting-approval` (redirects active users), optimized waiting-approval double query polling, client-side password complexity validation (min 8 chars, 1 uppercase, 1 digit), 27 regression tests across 3 test files (DONE)
52. Approval Leader KTP & SIDAK Scope Hardening — KTP/Profiler backend scope filtering (new `getAccessiblePesertaIds()` in profiler-service.ts, parity with SIDAK's `getAccessibleAgentIds()`), scope injection at 5 GET endpoints (peserta, counts, global-pool, batch, by-id), new `GET /v1/me/access-status` API endpoint, frontend `LeaderAccessGate` component with submit-request flow via RLS INSERT, integration in KTP/SIDAK landing pages, 18 API + 11 web regression tests (DONE)
53. Materialized View Security Hardening — Lock down `mv_qa_period_summary` to prevent unauthenticated/client-side access (REVOKE ALL FROM anon, public, authenticated), restrict refresh function to service_role, add regression tests (DONE)
54. MV QA Period Summary Post-Restore Re-Hardening — Fix ordering gap: 017 hardening runs before contract restore (20260525000200) which regrants to authenticated; added terminal migration 20260526090000 after restore, order-aware regression tests, docs sync (DONE)
55. Telefun Communication Profile Radar Chart — 2-series radar chart (Target QA + Hasil Anda) on `0-100` domain, semantics-aware metrics (Fillers as `lower_better`, Speaking Rate as `optimal_range`), AI insight (overallSummary, strengths, improvementPriorities), CommunicationProfileZoomModal with Escape/overlay/button close, score guard (`/10` vs `/100`) in ReviewModal, backend enrichment via `telefun-communication-profile.ts`, fix kontrak `POST /telefun/score/:id` envelope normalization, sessionFinalizer forwards `assessment` to `record.voiceAssessment`, 40+ tests across 5 test files, 0 new deps, 0 new migrations (DONE)
56. Leader Folder/Service Scope Visibility Hardening — Shared `LeaderScopeSnapshot` helper eliminating duplicate scope parsing; KTP metadata scoped (years/folders/teams filtered by leader pesertaIds); SIDAK `service_type` first-class enforcement via `getAccessibleSidakFilters()` including `allowedServiceTypes` in dashboard/ranking/agent-detail queries; SIDAK `folder_ids` real filtering (resolve batch_name from folder IDs); frontend normalization (`availableServices` prop, invalid service/folder/batch auto-reset with redirect); 16 files modified, 0 migrations, all 390 API + 314 web tests passing (DONE)
57. SIDAK Import Duplicate Logic Fix & no_tiket Passthrough — Fixed Excel import dropping no_tiket (hardcoded null), updated validateTemuanBatch() duplicate detection key with service_type and no_tiket mapping for legacy parity, and resolved frontend reverse() crash after batch creation (DONE)
58. SIDAK Input Visual & Navigation Parity — Restored vertical list card layout (matching legacy), compact inline breadcrumb with actual selected values, added Estimasi Skor card (live score with NC/CR breakdown + progress bar), added Konfigurasi Audit card (service dropdown + tim info) moved from step 3 to step 4, added Show All Data toggle (eye icon) in step 1, fixed navigation pre-fill from agent detail page to skip directly to period step via URL params consumption, added client-side scoring utility (`apps/web/src/lib/scoring.ts`), 24 regression tests (DONE)
59. **SIDAK Input Railway Build Fix (ArrowLeft Import)** — Added missing `ArrowLeft` lucide-react import in `input.tsx` that caused Railway deployment build failure (TS2304). TypeScript error `Cannot find name 'ArrowLeft'` at line 1032. (DONE)
60. **Top 5 Pengurang Skor Terbesar Legacy Parity** — Fixed `topTickets` computation to match legacy: month scoping, `scoreSession()` with weighted/flat/no_category modes, service weights from `qa_service_weights` table with `DEFAULT_SERVICE_WEIGHTS` fallback, 3-level tiebreaker sort, and renamed properties (`deduction`→`scoreDeduction`, `count`→`findingCount`). Added shared scoring functions to `apps/web/src/lib/scoring.ts`, weights field to API response, and 17 regression tests. Post-commit fixes: resolved Railway build TS errors (`ScoringMode` import, `ParsedImportRow`→`ImportRowType`), fixed 2 pre-existing `STACK_TRACE_ERROR` test failures (vitest 4.x `importOriginal` mock pattern + jsdom `scrollTo` stub). Final: 387 web PASS + 407 API PASS, 0 failures. (DONE)
61. **SIDAK Input Period + Temuan Legacy Refresh** — Service weights fetch from API, `handleServiceChange`, `resolveServiceTypeFromTeam`, mode-aware `calculateQAScoreFromTemuan`, client-side duplicate check, phantom padding. 3 new components (`ScoreCard`, `ManualForm`, `ImportPanel`). `TemuanGroupCard` upgraded (session#, category chip, NILAI_LABELS). 52 tests. (DONE)
61. **SIDAK Input Period + Temuan Legacy Refresh** — Audit ditemukan 7 gap kritikal (tidak fetch service weights, inline liveScore tidak mode-aware, tidak ada handleServiceChange, scoringMode tidak di-pass ke dropdown, tidak fetch indikator+weights saat period select, phantom padding filter hilang, tidak ada client-side duplicate check). Implementasi: expanded scoring.ts dengan `calculateQAScoreFromTemuan` + `resolveServiceTypeFromTeam` + `NILAI_LABELS`, created 3 new components (`SidakInputScoreCard`, `SidakInputManualForm`, `SidakInputImportPanel`), major-modified `input.tsx` (add activeWeight state, handleServiceChange, leader role guard, filtering), upgraded `TemuanGroupCard` (session number, category chip, NILAI_LABELS, canEdit). 52 total tests passing (32 existing + 20 new). (DONE)

## Key Files Changed (Phase 58 — 61)

- `apps/web/src/routes/sidak/input.tsx` — Major refactor: vertical list cards, compact breadcrumb, Estimasi Skor card, Konfigurasi Audit card, Show All toggle, URL param consumption for pre-fill; **Phase 61**: added `activeWeight` state, `handleServiceChange` with 3-fetch (indikator+weights+temuan), `resolveServiceTypeFromTeam`, `categoryMap`, `scoringMode`, leader role guard (`role !== "leader"`), client-side duplicate check, replaced inline form/import/score JSX with component imports
- `apps/web/src/hooks/useAgentDetail.ts` — Fixed `handleInputAudit` to pass `folder` param; rewritten `topTickets` with legacy parity
- `apps/web/src/lib/scoring.ts` — **NEW**: client-side scoring helpers (scoreColor, scoreBg, scoreLabel); **Phase 60**: added `scoreSession()`, `calculateSessionScoreFromTemuan()`, `DEFAULT_SERVICE_WEIGHTS`; **Phase 61**: added `resolveServiceTypeFromTeam()`, `calculateQAScoreFromTemuan()` full version with session grouping/MODE_SAMPLING/mode branching, `NILAI_LABELS`, `NILAI_BADGE_COLORS`
- `apps/web/src/components/sidak/SidakInputScoreCard.tsx` — **NEW Phase 61**: mode-aware score card (weighted→NC/CR split with weight %, flat→flat panel, no_category→BKO panel)
- `apps/web/src/components/sidak/SidakInputManualForm.tsx` — **NEW Phase 61**: legacy-like manual form with subtitle, full-width parameter button, scoringMode pass, 4-col nilai grid, cancel button
- `apps/web/src/components/sidak/SidakInputImportPanel.tsx` — **NEW Phase 61**: legacy-like import panel with tips, file state, card summary, card preview, duplicate banner
- `apps/web/src/components/sidak/TemuanGroupCard.tsx` — **Phase 61**: session number header (gIdx), category chip (Critical/Non-Critical), NILAI_LABELS badge, canEdit prop, legacy-like edit panel
- `apps/web/src/__tests__/sidak-input-parity.test.tsx` — **NEW**: 24 regression tests covering layout, breadcrumb, pre-fill, toggle, cards, scoring
- `apps/web/src/__tests__/sidak-input-legacy-refresh.test.tsx` — **NEW Phase 61**: 20 regression tests for scoring helpers, component contracts, NILAI_LABELS
- `apps/web/src/__tests__/top-tickets-legacy-parity.test.ts` — **NEW Phase 60**: 10 regression tests for scoring modes, tiebreaker, contract
- `apps/api/src/__tests__/sidak-agent-detail-weights.test.ts` — **NEW Phase 60**: 7 regression tests for weights resolution
- `apps/web/src/__tests__/setup.ts` — **Phase 60 fix**: Added `window.scrollTo = vi.fn()` jsdom stub
- `apps/web/src/__tests__/route-guards.test.ts` — **Phase 60 fix**: Replaced `vi.importActual` with `importOriginal` in `@tanstack/react-router` mock factory
- `apps/web/src/routes/sidak/input.tsx` — **Phase 60 fix**: `ParsedImportRow` → `ImportRowType` (build fix)

## Relevant Files

- `opencode.json` — project-level opencode config with context7 MCP
- `supabase/migrations/` — DB schemas (001 SIDAK, 002 KETIK/PDKT/AI, 003 Telefun, 004 Admin Core, 009 Storage RLS, 010 Activity Logs Index, **017 MV hardening**, **20260526090000 MV terminal re-hardening**)
- `supabase/rollbacks/` — DB rollbacks (including **rollback_017**, **rollback_20260526090000**)
- `apps/api/src/__tests__/mv-qa-period-summary-security.test.ts` — order-aware regression tests for MV security hardening (Phase 53+54)
- `apps/api/src/__tests__/database-parity-post-sync.test.ts` — parity tests with MV terminal re-hardening validation
- `docs/database.md` — database architecture and security reference
- `apps/api/src/services/profiler-service.ts` — profiler CRUD + **getAccessiblePesertaIds()** leader scope filter
- `apps/api/src/services/admin-service.ts` — admin user mgmt + **getLeaderAccessStatus()** + leader request approval
- `apps/api/src/routes/profiler.ts` — profiler routes with scope-filter injection at 5 GET endpoints
- `apps/api/src/routes/admin.ts` — admin routes including leader request management
- `apps/api/src/app.ts` — Hono app with `/v1/me/access-status` endpoint
- `apps/web/src/hooks/useAccessStatus.ts` — leader access status fetch + submit via RLS INSERT
- `apps/web/src/components/LeaderAccessGate.tsx` — wraps module landing pages, shows status card + submit button
- `apps/web/src/routes/profiler/index.tsx` — KTP landing wrapped with LeaderAccessGate
- `apps/web/src/routes/sidak/index.tsx` — SIDAK landing wrapped with LeaderAccessGate
- `apps/api/src/__tests__/profiler-scope-filter.test.ts` — 18 API regression tests for getAccessiblePesertaIds + getLeaderAccessStatus
- `apps/web/src/__tests__/leader-access-gate.test.tsx` — 11 web regression tests for LeaderAccessGate component
- `docs/LEADER_APPROVAL_ACCESS.md` — full architecture doc updated with backend scope enforcers, access status API, and frontend gate
- `apps/api/src/lib/` — scoring, ai-models, ai-usage, gemini, openrouter, **timezone**, **report-docx-builder**, **profile** (normalizeAuthProfileStatus), **telefun-communication-profile** (Phase 55: benchmark defaults, status evaluator, legacy mapper)
- `apps/api/src/middleware/auth.ts` — authentication middleware with is_deleted check + legacy status normalization
- `apps/api/src/__tests__/auth-middleware.test.ts` — 18 regression tests for auth middleware (deleted/inactive/pending/legacy/non-admin)
- `apps/telefun/src/` — WebSocket proxy server (server, auth, usage, env)
- `apps/web/src/router.tsx` — centralized TanStack Router v1 routes (37 routes, all React.lazy())
- `apps/web/src/lib/excel-utils.ts` — Excel template gen, parse, validate
- `apps/web/src/lib/app-config.ts` — APP_MODULES definitions with accent colors/icons
- `apps/web/src/lib/profilerService.ts` — typed Profiler API client
- `apps/web/src/routes/` — page components per module (including `profiler/` with 8 sub-routes, `dashboard/DashboardTrendPanel.tsx` (lazy analytics), and `dashboard/users`, `dashboard/access-groups`, `dashboard/access-approval`, `dashboard/activities`)
- `apps/web/src/hooks/useQueryParams.ts` — search params helper for TanStack Router v1
- `apps/web/src/hooks/useAgentDetail.ts` — agent detail hook with multi-service support
- `apps/web/src/hooks/useProfilerAccess.ts` — profiler role/isReadOnly hook via Supabase auth
- `apps/web/src/lib/html2canvas-tailwind-fix.ts` — Tailwind v4 oklch() fix for html2canvas exports
- `packages/types/src/index.ts` — all shared Zod schemas & TS interfaces (including Profiler, Admin, and **TelefunCommunicationProfile** types — Phase 55)
- `apps/web/src/components/Layout.tsx` — sidebar, SIDAK/Admin submenus, Suspense boundary for lazy routes
- `apps/web/src/lib/excel-utils.ts` — Excel template gen, parse, validate (dynamic xlsx/exceljs import)
- **`apps/web/src/__tests__/logout-redirect.test.ts`** — regression test for logout redirects and guards
- `railway.toml` — Railway production deployment config (build/start commands, healthcheck) — **removed; see Phase 40**
- `.node-version` — Node.js version pinning for Railway/Nixpacks (22, required by Vite 8)
- `apps/web/vite.config.ts` — Vite config (PORT env, API proxy, Tw v4, react plugin, preview block for Railway)
- `apps/web/vite.config.test.ts` — Regression test: Vite preview port follows Railway `PORT` env
- `scripts/deployment/railway-web-healthcheck-smoke.mjs` — Smoke test: spawn web on test PORT, poll `/`, assert 200
- `scripts/deployment/guard-no-railway-dev.mjs` — Guard: block Vite dev server execution on Railway
- `apps/web/src/__tests__/railway-dev-guard.test.ts` — Regression test: guard blocks dev when Railway env detected
- `apps/web/vitest.config.ts` — Vitest config for frontend (jsdom, testing-library)
- `apps/api/vitest.config.ts` — Vitest config for API service tests
- `apps/web/src/lib/toast.ts` — sonner v2 wrapper (notify.success/error/warning)
- `apps/web/src/routes/unauthorized.tsx` — 403 role-denied page
- `apps/web/src/components/ui/Pagination.tsx` — shared pagination with page-size selector
- `apps/web/src/routes/telefun/telefunSettings.ts` — Telefun settings types (TelefunScenario, TelefunConsumerType), VOICE_MODELS, VOICE_OPTIONS, SCENARIO_PRESETS
- `apps/web/src/routes/telefun/components/SettingsModal.tsx` — 4-tab Telefun settings modal (Model, Skema/CRUD, Konsumen/CRUD)
- `apps/api/src/routes/telefun.ts` — Telefun settings GET/PUT endpoints (Zod schema validasi scenarios[] + consumerTypes[])
- **`apps/web/src/routes/telefun/components/VoiceRadarChart.tsx`** — Phase 55: 2-series radar chart (Target QA + Hasil Anda), domain 0-100, 5 axis with direction hints
- **`apps/web/src/routes/telefun/components/VoiceAssessmentSection.tsx`** — Phase 55: Profil Komunikasi card with chart, AI insight, zoom affordance, status badges, Cara Membaca
- **`apps/web/src/routes/telefun/components/CommunicationProfileZoomModal.tsx`** — Phase 55: full-dialog modal with large chart, Escape/overlay/button close, metric detail cards
- **`apps/web/src/lib/voiceAssessmentUtils.ts`** — Phase 55: +normalizeTelefunScoreResponse, +getCommunicationProfileFromAssessment, fallback builder
- **`apps/web/src/routes/telefun/sessionFinalizer.ts`** — Phase 55: forwards assessment to record.voiceAssessment
- **`apps/api/src/lib/telefun-communication-profile.ts`** — Phase 55: benchmark defaults, status evaluator, legacy mapper, enrichment
- **`apps/api/src/lib/telefun-analysis.ts`** — Phase 55: AI schema extended, assessment enrichment before DB save
- **`apps/api/src/__tests__/telefun-communication-profile.test.ts`** — Phase 55: 20 unit tests (evaluation modes, legacy fallback, enrichment)
- **`apps/web/src/__tests__/telefun-communication-profile.test.tsx`** — Phase 55: 12 component tests (chart, zoom modal, Fillers explanation, Escape key)
- **`apps/web/src/__tests__/telefun-voice-assessment-utils.test.ts`** — Phase 55: +envelope normalization, +legacy fallback tests
- **`apps/web/src/__tests__/telefun-session-finalizer.test.ts`** — Phase 55: +voiceAssessment in record test
- `docs/checklist-audit-trainers-superapp.md` — frontend audit checklist (sections 1.1-1.8)
- **`apps/web/src/__tests__/auth-login-flow.test.ts`** — 7 regression tests: CSRF header, 401 interception, qa type check
- **`apps/web/src/__tests__/route-guards.test.ts`** — 12 regression tests: reset password + waiting approval guards
- **`apps/web/src/__tests__/reset-password-validation.test.ts`** — 8 regression tests: password complexity rules
- `docs/rebuild-logs/` — per-phase completion logs (phase-1 through phase-58a)
- `docs/deployment.md` — full deployment guide with Railway settings, env vars, and troubleshooting

## Routes Reference (apps/web)

| #   | Route                        | Page Type    | Notes                                                    |
| --- | ---------------------------- | ------------ | -------------------------------------------------------- |
| 1   | `/`                          | Landing      | Hero, stats, modules showcase, benefits                  |
| 2   | `/dashboard`                 | Overview     | Recharts charts, KPI cards, module grid                  |
| 3   | `/sidak`                     | Landing      | 6 card links                                             |
| 4   | `/sidak/dashboard`           | QA Dashboard | 4 metric cards, bar charts, top agents                   |
| 5   | `/sidak/input`               | Form         | Multi-step audit input + Excel                           |
| 6   | `/sidak/ranking`             | Table        | Agent ranking sorted by defects                          |
| 7   | `/sidak/settings`            | CRUD         | Service weights configuration                            |
| 8   | `/sidak/periods`             | Manager      | Create/view audit periods                                |
| 9   | `/sidak/agents`              | Directory    | Searchable agent list                                    |
| 10  | `/sidak/agents/$id`          | Detail       | Per-service pills, separate trend chart per service, score badges in temuan history |
| 11  | `/ketik`                     | Landing      | Chat simulation intro                                    |
| 12  | `/ketik/simulation`          | Chat UI      | Scenario selection + chat interface                      |
| 13  | `/ketik/history`             | Placeholder  | Session history                                          |
| 14  | `/pdkt`                      | Landing      | Email simulation intro                                   |
| 15  | `/pdkt/simulation`           | Email UI     | Scenario + inbound email + evaluate                      |
| 16  | `/pdkt/history`              | Placeholder  | Session history                                          |
| 17  | `/telefun`                   | Voice UI     | WebSocket-based call simulation                          |
| 18  | `/monitoring`                | Dashboard    | AI usage + pricing management                            |
| 19  | `/account`                   | Settings     | Edit name + change password                              |
| 20  | `/profiler`                  | Landing      | Year/folder sidebar + action tiles                       |
| 21  | `/profiler/table`            | Table        | Search/filter/edit participant data                      |
| 22  | `/profiler/slides`           | Slides       | Slide view per participant                               |
| 23  | `/profiler/analytics`        | Charts       | Recharts analytics (4 charts)                            |
| 24  | `/profiler/export`           | Export       | Excel/CSV export                                         |
| 25  | `/profiler/add`              | Form         | Manual participant input                                 |
| 26  | `/profiler/import`           | Import       | Excel template + upload + results                        |
| 27  | `/profiler/teams`            | CRUD         | Custom team management                                   |
| 28  | `/sidak/reports`             | Landing      | Data vs AI report selection                              |
| 29  | `/sidak/reports-data`        | Table        | Filter form + temuan table + Excel export                |
| 30  | `/sidak/reports-ai`          | Form         | AI-powered report generation                             |
| 31  | `/waiting-approval`          | Auth         | Status polling page                                      |
| 32  | `/reset-password`            | Auth         | Password recovery form                                   |
| 33  | `/dashboard/users`           | Table        | User status/role management, password reset, soft delete |
| 34  | `/dashboard/access-groups`   | Builder      | Dynamic access data rule scopes builder for leaders      |
| 35  | `/dashboard/access-approval` | Action       | Assign access groups and approve leader requests         |
| 36  | `/dashboard/activities`      | Table        | System-wide audit logs with CSV export                   |
| 37  | `/unauthorized`              | Error        | 403 role-denied page                                     |
| 38  | 404                          | Catch-all    | Custom not-found page                                    |

## API Endpoints Reference (apps/api)

| Prefix             | Endpoints    | Service                         |
| ------------------ | ------------ | ------------------------------- |
| `/api/v1/sidak`    | 15 endpoints | `sidak-service.ts`              |
| `/api/v1/ketik`    | 4 endpoints  | `ketik-service.ts`              |
| `/api/v1/pdkt`     | 6 endpoints  | `pdkt-service.ts`               |
| `/api/v1/ai`       | 7 endpoints  | —                               |
| `/api/v1/profiler` | 18 endpoints | `profiler-service.ts`           |
| `/api/v1/admin`    | 8 endpoints  | `admin-service.ts`              |
| `/api/v1/telefun`  | 2 endpoints  | `telefun.ts` (settings GET/PUT) |
