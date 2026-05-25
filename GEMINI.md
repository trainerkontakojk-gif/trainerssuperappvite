# GEMINI.md - Trainers SuperApp Rebuild

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

## Superpowers Skills

**WAJIB** panggil `Skill` tool di setiap task — cek apakah ada skill yang relevan sebelum memulai pekerjaan. Skill tersedia untuk: brainstorming, writing-plans, TDD, customize-opencode, dll. Ikuti workflow skill secara disiplin.

## Commands (Monorepo)

Project ini menggunakan **pnpm** dan **Turborepo**.

- **Install:** `pnpm install`
- **Dev:** `pnpm dev` (Menjalankan web, api, dan telefun secara paralel)
- **Build:** `pnpm build`
- **Lint:** `pnpm lint` (ESLint 9 flat config — `eslint.config.mjs` di root)
- **Lint (single workspace):** `pnpm --filter @trainers/web lint`
- **Test:** `pnpm test` (vitest — 299+ tests covering API services + frontend hooks/components)
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

### 7. Selalu Referensi Context7 + Superpowers untuk Dokumentasi

Sebelum mengimplementasikan fitur yang menggunakan library eksternal (Supabase, Hono, Zod, TanStack, dsb), **WAJIB** lakukan:

1. Panggil `Skill` tool untuk cek apakah ada superpower skill yang relevan.
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


## Relevant Files

- `opencode.json` — project-level opencode config with context7 MCP
- `supabase/migrations/` — DB schemas (001 SIDAK, 002 KETIK/PDKT/AI, 003 Telefun, 004 Admin Core, 009 Storage RLS, 010 Activity Logs Index)
- `apps/api/src/lib/` — scoring, ai-models, ai-usage, gemini, openrouter, **report-docx-builder**
- `apps/api/src/services/` — sidak-service, ketik-service, pdkt-service, profiler-service, **admin-service**
- `apps/api/src/routes/` — Hono endpoints (sidak, ketik, pdkt, ai, profiler, **admin**)
- `apps/telefun/src/` — WebSocket proxy server (server, auth, usage, env)
- `apps/web/src/router.tsx` — centralized TanStack Router v1 routes (37 routes, all React.lazy())
- `apps/web/src/lib/excel-utils.ts` — Excel template gen, parse, validate
- `apps/web/src/lib/app-config.ts` — APP_MODULES definitions with accent colors/icons
- `apps/web/src/lib/profilerService.ts` — typed Profiler API client
- `apps/web/src/routes/` — page components per module (including `profiler/` with 8 sub-routes, and `dashboard/users`, `dashboard/access-groups`, `dashboard/access-approval`, `dashboard/activities`)
- `apps/web/src/hooks/useQueryParams.ts` — search params helper for TanStack Router v1
- `packages/types/src/index.ts` — all shared Zod schemas & TS interfaces (including Profiler and Admin types)
- `apps/web/src/components/Layout.tsx` — sidebar, SIDAK/Admin submenus, Suspense boundary for lazy routes
- `apps/web/src/lib/excel-utils.ts` — Excel template gen, parse, validate (dynamic xlsx/exceljs import)
- `apps/web/src/__tests__/` — frontend test files (useApi, useQueryParams, app-config, excel-utils, pdkt-mailbox, pdkt-settings, sidak-agents-load-more-copy)
- `apps/api/src/__tests__/` — API service test files (scoring, sidak-service, profiler-service, **admin-service**)
- `apps/web/vitest.config.ts` — Vitest config for frontend (jsdom, testing-library)
- `apps/api/vitest.config.ts` — Vitest config for API service tests
- `apps/web/src/lib/toast.ts` — sonner v2 wrapper (notify.success/error/warning)
- `apps/web/src/routes/unauthorized.tsx` — 403 role-denied page
- `apps/web/src/components/ui/Pagination.tsx` — shared pagination with page-size selector
- `apps/web/src/routes/telefun/telefunSettings.ts` — Telefun settings types (TelefunScenario, TelefunConsumerType), VOICE_MODELS, VOICE_OPTIONS, SCENARIO_PRESETS
- `apps/web/src/routes/telefun/components/SettingsModal.tsx` — 4-tab Telefun settings modal (Model, Skema/CRUD, Konsumen/CRUD)
- `apps/api/src/routes/telefun.ts` — Telefun settings GET/PUT endpoints (Zod schema validasi scenarios[] + consumerTypes[])
- `docs/checklist-audit-trainers-superapp.md` — frontend audit checklist (sections 1.1-1.8)
- `docs/rebuild-logs/` — per-phase completion logs (phase-1 through phase-29)

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
| 10  | `/sidak/agents/$id`          | Detail       | Score history + findings table                           |
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
