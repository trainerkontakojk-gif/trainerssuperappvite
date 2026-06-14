# AGENTS.md - Trainers SuperApp Rebuild

## MCP Servers

- **context7** - Documentation lookup & code search via `@upstash/context7-mcp` (local mode, configured in `opencode.json`).
  - 2 tools: `resolve-library-id` (cari library ID) dan `query-docs` (ambil dokumentasi terbaru).
  - API key disimpan di `.env.local` sebagai `CONTEXT7_API_KEY`.
  - Wajib dipanggil SEBELUM mengimplementasikan fitur dengan library eksternal.
- **supabase-mcp-server** - Gunakan untuk query data Supabase dan operasi database.
- **shadcn** - Gunakan untuk mencari dan menginstall komponen shadcn/ui. Selalu cek registry sebelum membuat komponen custom.

## Subagent Usage

- Gunakan **Superpower Skill** (`subagent_type: "general"`) untuk sebagian besar task — eksplorasi, implementasi, riset multi-step.
- Untuk task kompleks, kombinasikan dengan ECC specialized agents (planner, architect, dll).
- Berikan instruksi yang spesifik tentang arsitektur monorepo (apps/web, apps/api, packages/types).

## UI/UX Pro Max Skill

**WAJIB** gunakan skill **UI/UX Pro Max** (`ui-ux-pro-max`) untuk semua task yang berhubungan dengan perubahan UI/UX — baik itu build, design, create, implement, review, fix, atau improve tampilan. Skill ini menyediakan:

- **67 UI Styles** — Glassmorphism, Neumorphism, Bento Grid, dll.
- **161 Color Palettes** — Industri-specific
- **57 Font Pairings** — Typography recommendations
- **161 Reasoning Rules** — Design system generation sesuai industri
- **99 UX Guidelines** — Best practices & anti-patterns
- **Stack-specific guidelines** — React, Tailwind, shadcn/ui, Next.js, dan lainnya

Skill ter-install di `.opencode/skills/ui-ux-pro-max/` dan akan aktif otomatis saat ada permintaan UI/UX.

## Superpower Skill + ECC Plugin

Gunakan **Superpower Skill** sebagai default untuk semua task — dipadukan dengan **ECC (Everything Claude Code)** jika kompleksitas task membutuhkan specialized agents.

### Superpower Skill (Default)

Superpower Skill adalah pendekatan general-purpose yang optimal untuk sebagian besar task. Cukup panggil `Task` tool dengan `subagent_type: "general"` — agent akan menangani eksplorasi, implementasi, debugging, dan testing secara otonom.

Gunakan Superpower Skill untuk:

- Task yang membutuhkan eksplorasi codebase mendalam
- Implementasi fitur dengan kompleksitas rendah-sedang
- Riset multi-step dan debugging umum

### ECC Plugin (Task Kompleks)

Jika task membutuhkan specialized agent, kombinasikan dengan **ECC (Everything Claude Code)** (`ecc-universal`):

- Fitur kompleks / refactoring → **planner** agent
- Bug fix / fitur baru → **tdd-guide** agent
- Arsitektur / system design → **architect** agent
- Setelah menulis kode → **code-reviewer** agent
- Kode sensitif / security → **security-reviewer** agent
- Build error → **build-error-resolver** agent
- Cek dokumentasi library → **docs-lookup** agent (Context7)
- Autonomous loop / monitoring → **loop-operator** agent
- **Perubahan UI/UX** → **ui-ux-pro-max** skill (aktivasi otomatis)

ECC agents bisa dipanggil via `Task` tool dengan `subagent_type` yang sesuai.

## Commands (Monorepo)

Project ini menggunakan **pnpm** dan **Turborepo**.

- **Install:** `pnpm install`
- **Dev:** `pnpm dev` (Menjalankan web, api, dan telefun secara paralel)
- **Install (CI mode):** `CI=true pnpm install` (pnpm 11 requires `CI=true` to skip TTY prompts on module recreation)
- **Build:** `pnpm build`
- **Lint:** `pnpm lint` (ESLint 9 flat config — `eslint.config.mjs` di root)
- **Lint (single workspace):** `pnpm --filter @trainers/web lint`
- **Test (targeted — development):** `pnpm test:targeted` (10-30s, test terkait perubahan via `vitest --changed`)
- **Test (core — pre-push):** `pnpm test:core` (30-60s, kontrak kritis lintas modul)
- **Test (fast — pre-merge):** `pnpm test:fast` (1-2min, seluruh unit test ringan)
- **Test (full — CI/release):** `pnpm test` atau `pnpm test:full` (~5min, semua tests termasuk component rendering)
- **Test (api only):** `pnpm --filter @trainers/api test`
- **Test (web only):** `pnpm --filter @trainers/web test`
- **Test (web fast):** `pnpm --filter @trainers/web test:fast`
- **Format:** `pnpm format`
- **Telefun standalone:** `pnpm --filter @trainers/telefun dev`

### Test Tiering Strategy

| Tier         | Command                           | Duration | Coverage                                         | Kapan                    |
| ------------ | --------------------------------- | -------- | ------------------------------------------------ | ------------------------ |
| **Targeted** | `pnpm test:targeted`              | 10-30s   | Changed files only (vitest --changed)            | Development, quick check |
| **Core**     | `pnpm test:core`                  | 30-60s   | Kontrak kritis lintas modul                      | Pre-push                 |
| **Fast**     | `pnpm test:fast`                  | 1-2min   | Seluruh unit test ringan (no .tsx)               | Pre-merge                |
| **Full**     | `pnpm test` atau `pnpm test:full` | ~5min    | Semua tests (unit + component rendering + jsdom) | CI, release              |

**Core tests mencakup:**

- Authentication, authorization, dan RLS
- API route/service contract kritis
- SIDAK scoring dan period/version resolution
- Telefun session finalizer dan assessment boundary
- KETIK/PDKT session lifecycle
- Migration/security contract

**Fast tests exclude:**

- `.test.tsx` files (React component rendering)
- React hook tests (`useApi`, `useQueryParams`, `authInit`, `auth-login-flow`)

**Development workflow:**

```bash
# Quick check saat development
pnpm test:targeted  # 10-30s

# Sebelum commit
pnpm test:core      # 30-60s

# Sebelum push
pnpm test:fast      # 1-2min

# Sebelum merge/release
pnpm test:full      # ~5min
```

### Risk-Based Testing Policy

**Wajib test baru:**

- Perubahan behavior atau business logic
- Bug fix (tulis regression test)
- Perubahan security/permission
- Perubahan database schema/migration
- Perubahan API contract

**Tidak wajib test baru:**

- Refactor tanpa perubahan behavior (jalankan test terkait)
- UI kosmetik/styling
- Dokumentasi
- Konfigurasi sederhana

**Pre-push checklist:**

```bash
pnpm lint
pnpm build
pnpm test:core  # 30-60s, targeted tests
```

**Pre-merge/CI:**

```bash
pnpm test  # ~5min, full suite
```

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

## Migration Status — RPC Migration Complete ✅

Semua fungsi yang sebelumnya menggunakan `getApi`, `postApi`, `putApi`, `deleteApi` dari `hooks/useApi` sudah dimigrasi ke `fetchApi` (dari hooks/useApi — hanya untuk internal) atau menggunakan RPC/hc pattern. `getApi`/`postApi`/`putApi`/`deleteApi` sudah dihapus — jangan gunakan di kode baru. Gunakan `fetchApi` dari `hooks/useApi` untuk panggilan API langsung, atau gunakan Hono RPC client.

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

### 8. Wajib Test Sebelum Push ke GitHub

Saat user meminta push ke GitHub (`git push` atau `git commit && git push`), **WAJIB** lakukan pre-push checklist berikut secara berurutan:

0. **Gitignore Audit:** Jalankan `git status` — periksa apakah ada file tidak sengaja ter-track yang seharusnya di `.gitignore` (misal: `.env`, `*.log`, `dist/`, file editor config). Jika ada, update `.gitignore`, hapus dari staging/index, lalu commit fix terpisah.
1. **Lint:** Jalankan `pnpm lint` — pastikan 0 error (warning diperbolehkan).
2. **Build:** Jalankan `pnpm build` — pastikan 0 error. Build failure = Railway deploy failure.
3. **Test:** Jalankan `pnpm test:core` — pastikan seluruh suite lulus (30-60s, kontrak kritis lintas modul). Untuk validasi penuh sebelum merge, jalankan `pnpm test` (~5min, termasuk component rendering). Jika ada test failure, perbaiki sebelum push.

Jika ada langkah yang gagal, **HENTIKAN** proses push dan informasikan ke user beserta output error-nya. Jangan melanjutkan push sampai semua langkah hijau.

### 7. Selalu Referensi Context7 + ECC untuk Dokumentasi

Sebelum mengimplementasikan fitur yang menggunakan library eksternal (Supabase, Hono, Zod, TanStack, dsb), **WAJIB** lakukan:

1. Panggil ECC **docs-lookup** agent (via `Task` tool dengan `subagent_type` yang sesuai) untuk cek dokumentasi terbaru library. Alternatifnya, gunakan Superpower Skill dengan instruksi lookup dokumentasi.
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

Sub-agent ini bisa dipanggil via Superpower Skill (`general`) dengan instruksi spesifik, atau via ECC agent yang sesuai untuk audit lebih mendalam.

## Environment Variables

- **Frontend (`apps/web`)**: Menggunakan prefix `VITE_` (e.g., `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TELEFUN_WS_URL`).
- **Backend (`apps/api`)**: Menggunakan variabel langsung (e.g., `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `GEMINI_API_KEY`).
- **Telefun Server (`apps/telefun`)**: Menggunakan variabel langsung (e.g., `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`).
- **MCP / Tools**: `CONTEXT7_API_KEY` disimpan di `.env.local` untuk context7 MCP server.
- File `.env.local` di root diabaikan oleh git, tapi isinya harus disinkronkan ke masing-masing apps jika diperlukan (atau load dari root).

## Phase Progress

66. **KETIK Review Progress & Scoring Fix** — Fixed 2 critical UX bugs: (1) progress bar stuck at 5% during AI review — added auto-transition timer (starting→processing after 2s), improved non-linear progress curve, standalone progress bar with visible ETA; (2) all scores displayed as 0 — backend now returns scores in `POST /ketik/review` response, frontend maps `detail.scores` to session object in `handleViewReview` as fallback. Also enhanced score card UI: grade-based color coding, mini progress bars, category descriptions, "Tata Tulis" label rename, rubric legend with collapsible details, improved text contrast per UX guidelines. 6 files modified, 17 frontend + 22 API regression tests passing. (DONE)
67. Auth & Layout (DONE)
68. SIDAK Core (DONE)
69. KETIK & PDKT (DONE)
70. Report AI (DONE)
71. Upload Excel SIDAK (DONE)
72. Telefun WS (DONE)
73. Hardening (P0 Critical — DONE)
74. Deployment (P0 Critical — DONE)
75. Frontend Matching & Profiler Module (DONE)
76. SIDAK Reports (DONE)
77. Polish & QA — Loading states, empty states, error handling (DONE)
78. Perf — Code splitting + lazy loading (DONE)
79. Testing — Vitest API unit tests + Frontend component tests (DONE)
80. Admin Management Parity (DONE)
81. Dashboard Visual & Data Parity (DONE)
82. KETIK Carbon Copy (DONE)
83. PDKT Carbon Copy (DONE)
84. Frontend Checklist Fixes — Toast, route guards, pagination, transcript export, draft autosave, Telefun settings, QA versioning (DONE)
85. Audit Gaps Fix — Telefun replay HTTP layer, profiler duplicate integrity, annotation deletion policy (DONE)
86. Role Hardening + AI Logging — QA removed from mutation endpoints, adminOnly middleware, AI usage status/error logging, showArchived filter (DONE)
87. Telefun Parity & Advanced Voice Metrics — Realistic mode, voice assessment AI, high-fidelity UI (DONE)
88. Profiler Parity Fixes — Backend cascade/rename-sync/batch-move, labelJabatan expansion, 2 new modal components, useQueryParams bug fix, html2canvas-tailwind-fix, isReadOnly auth context, label consistency (DONE)
89. SIDAK Dashboard Legacy Parity — Restored legacy defaults, filter bar, KPI cards, trend panel, leaderboard, parity test (DONE)
90. SIDAK Agent Service Pill Stability — Service pills from raw temuan rows, regression test for refresh collapse (DONE)
91. SIDAK Parameter Legacy Parity — Rebuilt versioned settings shell, history picker, weights slider, parameters list card view, and publish flow (DONE)
92. SIDAK Agent Detail Findings Parity — Local score badges, month accordion, ticket grouping, and role-based action permission (DONE)
93. SIDAK Ranking Fatal Legacy Parity — Strict `nilai===0` + critical predicate for `hasCritical`, phantom-padding exclusion, API + frontend regression tests (DONE)
94. SIDAK Agent Directory Load-More Copy — Dynamic next-batch copy for `/sidak/agents`, accurate remaining-count label, and regression test (DONE)
95. SIDAK Input Stability & QA Baseline Recovery — Fixed agents.map crash via defensive response parsing, added draft-empty CTA warning/CTA, unlinked indicator guard on save/import, and improved validation messaging (DONE)
96. Dashboard User Management Legacy Parity — Restored trainer+admin role parity in admin routes, deleted-user filtering in getUsers, server-side reset password flow, guided access-group builder (Team/Service/Agent), aligned access-approval contract, synced activity log schema with delete action, and rollback-safe reassign for leader access (DONE)
97. SIDAK Period Delete Fail-Closed Guard — Hardened `deletePeriod()` to abort when verification queries fail, preventing fail-open cascade deletion risk; added API regression test for verification-error path (DONE)
98. Access Approval & Access Group Legacy Parity Hardening — Added re-check `status=approved` before delete in reassign, guarded `reviewed_by` audit update, locked builder Specific Agent to team-first flow, added 6 API + 3 web regression tests (DONE)
99. Monitoring & Activity Logs Legacy Parity — 3-tab monitoring (history/usage/pricing), WIB boundary, unified history endpoint, role matrix (trainer/leader/admin), sidebar link fix, shared logActivity helper, activity logging coverage for SIDAK (8 events) and Profiler (10 events) (DONE)
100.  Monitoring Unauthorized & Visual Legacy Parity Fix — Replaced raw unauthenticated fetch() with getApi/putApi/postApi helpers, added human-friendly error mapping, applied legacy visual patterns (hero header, tab strip, refined cards), added toast feedback for pricing saves, 20 regression tests (DONE)
101.  Dashboard Post-Login Legacy Parity — Auth-aware data fetching (Bearer token on all protected API calls), recent activity parity (5 items), analytics lazy loading (Recharts split from main bundle with Suspense skeleton) (DONE)
102.  Database Legacy Parity Audit — Read-only audit terhadap hosted target (ruosnjmtywcrghjgqugz). 13 tabel hilang, 29 fungsi hilang, 10+ tabel data kosong. App smoke tests lulus (258/258) tapi data parity tidak tercapai dari sisi live database. (DONE)
103.  Database Legacy Parity Remediation — May qa_temuan incremental sync (144 rows, 0 conflicts), QA Parameter recovery (rule-version parity + baseline-aware UI empty state), dashboard summary function fix (Vite schema compatible), MV contract restored (29 rows, concurrent refresh OK), summary backfill (29 period + 320 agent rows). Scripts + migrations + tests + docs. (DONE)
104.  Railway Deployment OOM Fix — Replaced `vite` dev server with `vite preview` in production (Railway). Exit 137/OOM caused by Vite dependency pre-bundling in dev mode. Added `railway.toml` for explicit build/start commands, `--host 0.0.0.0` flag, `PORT` env support in vite.config.ts, `turbo` `start` task with `dependsOn: ^build`, and `.node-version` pinning Node.js 22 (Vite 8.0.13 requires >=22, Nixpacks defaulted to 18). Healthcheck fix: Vite separates `server.port` and `preview.port`; default `preview.port` is 4173 so Railway dynamic `PORT` was ignored. Explicit `preview` block with shared `appPort`, `host: "0.0.0.0"`, and `strictPort: true` ensures Railway healthcheck hits the correct port. (DONE)
105.  Railway Healthcheck Hardening — Root `start` locked to web-only (`pnpm run start:web`) to prevent multi-service PORT collision. Added service-specific scripts (`start:web`, `start:api`, `start:telefun`, `build:web`, `build:api`, `build:telefun`, `start:all`). Created smoke test (`scripts/deployment/railway-web-healthcheck-smoke.mjs`) that spawns web on test PORT, polls `/`, asserts HTTP 200. Updated `docs/deployment.md` with Railway Settings table (build/start commands + healthcheck paths per service). Context7-verified against Railway monorepo + healthcheck docs. (DONE)
106.  Railway Web Start Command Drift Guard — Railway Web service was still running `@trainers/web dev`/`vite` in production, triggering Vite optimizer OOM (`Exit 137`). Added guard (`scripts/deployment/guard-no-railway-dev.mjs`) that blocks Vite dev server execution when Railway env vars detected. Prefixed `apps/web/package.json` `dev` script with guard. Created 5-case regression test (`railway-dev-guard.test.ts`). Documented troubleshooting flow in `docs/deployment.md` with exact Railway service settings to fix drift. Also fixed cross-service connectivity: `VITE_API_URL` must have `/api/v1` suffix (API routes under `basePath("/api")` + `/v1/...`), `NODE_ENV=production` mandatory on API (CORS fallback to `localhost:3000` without it), `ALLOWED_ORIGINS` must be set per service. (DONE)
107.  Logout Redirect & Auth Guard Hardening — Added manual href redirect on logout, implemented requireAuth helper, secured 7 unprotected modules, added regression test and rebuild log. (DONE)
108.  Telefun Schema & Recharts Dimension Guard — Added Telefun setting types, Recharts dynamic import error boundary, and regression tests. (DONE)
109.  Telefun Railway Force-Close & Legacy Parity Fix — JSON audio base64, settings/model/identity parity, close-code mapping, duration cues, RLS recording path, session deduplication (DONE)
110.  Telefun Production Voice And Session Save Repair — DB migrations for missing feedback column, client-side session finalizer sequence repair, base64 inline audio decoding for model responses, gated client audio until setup complete, added contract tests (DONE)
111.  Telefun V2 End-Call Lifecycle & Finalizer Hardening — introduced normalizing state, guarded premature unmounting, automated session fallback creation, handled granular upload failures, added 18 unit tests (DONE)
112.  Telefun Call UI Parity, Replay Seek/Retry, dan Prompt Perilaku Legacy (Final Audit) — Full system instruction parity (emotion branching, KONSISTENSI SUARA, ATURAN ROLEPLAY, expanded ATURAN BICARA), ringtone+hold music+hold timer, volume segments+avatar upgrade+per-state status card+circular controls, dead air/interruption/stalled watchdog hardening, AI annotation generation endpoint, 19 prompt builder tests (DONE)
113.  KETIK Legacy Parity Upgrade — 3-tier time instruction (near end/wrap up/still long) via SessionTimingContext, strictScriptMode for OpenRouter with scenario scripts, allowSolutionAcknowledgement timeout guard (11 instructional cues + 7 action verbs), timing data passthrough from frontend to backend (DONE)
114.  PDKT Legacy Parity Hardening — Settings contract alignment ({success,data}), access matrix role lock (admin/trainer/leader/tl/spv/om/agent), history replay without active mailbox, client_request_id idempotency, bounded usage delta retry, human-friendly error mapping, DUMMY_PROFILES 5→20 + city randomization, coercion robustness (writingStyle + consumerNameMention), legacy script migration, test uplift 27+14 tests (DONE)
115.  Railway Login Non-Admin E2E Fix — Backend auth middleware hardened (is_deleted check, legacy status normalization via normalizeAuthProfileStatus, differentiated error codes: ACCOUNT_DELETED/ACCOUNT_PENDING/ACCOUNT_INACTIVE/PROFILE_NOT_FOUND/PROFILE_ERROR), .single() → .maybeSingle() for defensive null handling, CORS warning log when ALLOWED_ORIGINS empty in production, frontend fetchApi HTML response detection for SPA fallback errors, 18 API + 3 web regression tests (DONE)
116.  Auth Login, Reset Redirect & Approval Guard Hardening — Added `qa` to type unions (UserProfile, ManagedUser), CSRF header (`X-Requested-With`) + 401 interception with auto-redirect in fetchApi, beforeLoad guards for `/reset-password` (blocks non-recovery access) and `/waiting-approval` (redirects active users), optimized waiting-approval double query polling, client-side password complexity validation (min 8 chars, 1 uppercase, 1 digit), 27 regression tests across 3 test files (DONE)
117.  Approval Leader KTP & SIDAK Scope Hardening — KTP/Profiler backend scope filtering (new `getAccessiblePesertaIds()` in profiler-service.ts, parity with SIDAK's `getAccessibleAgentIds()`), scope injection at 5 GET endpoints (peserta, counts, global-pool, batch, by-id), new `GET /v1/me/access-status` API endpoint, frontend `LeaderAccessGate` component with submit-request flow via RLS INSERT, integration in KTP/SIDAK landing pages, 18 API + 11 web regression tests (DONE)
118.  Materialized View Security Hardening — Lock down `mv_qa_period_summary` to prevent unauthenticated/client-side access (REVOKE ALL FROM anon, public, authenticated), restrict refresh function to service_role, add regression tests (DONE)
119.  MV QA Period Summary Post-Restore Re-Hardening — Fix ordering gap: 017 hardening runs before contract restore (20260525000200) which regrants to authenticated; added terminal migration 20260526090000 after restore, order-aware regression tests, docs sync (DONE)
120.  Telefun Communication Profile Radar Chart — 2-series radar chart (Target QA + Hasil Anda) on `0-100` domain, semantics-aware metrics (Fillers as `lower_better`, Speaking Rate as `optimal_range`), AI insight (overallSummary, strengths, improvementPriorities), CommunicationProfileZoomModal with Escape/overlay/button close, score guard (`/10` vs `/100`) in ReviewModal, backend enrichment via `telefun-communication-profile.ts`, fix kontrak `POST /telefun/score/:id` envelope normalization, sessionFinalizer forwards `assessment` to `record.voiceAssessment`, 40+ tests across 5 test files, 0 new deps, 0 new migrations (DONE)
121.  Leader Folder/Service Scope Visibility Hardening — Shared `LeaderScopeSnapshot` helper eliminating duplicate scope parsing; KTP metadata scoped (years/folders/teams filtered by leader pesertaIds); SIDAK `service_type` first-class enforcement via `getAccessibleSidakFilters()` including `allowedServiceTypes` in dashboard/ranking/agent-detail queries; SIDAK `folder_ids` real filtering (resolve batch_name from folder IDs); frontend normalization (`availableServices` prop, invalid service/folder/batch auto-reset with redirect); 16 files modified, 0 migrations, all 390 API + 314 web tests passing (DONE)
122.  SIDAK Import Duplicate Logic Fix & no_tiket Passthrough — Fixed Excel import dropping no_tiket (hardcoded null), updated validateTemuanBatch() duplicate detection key with service_type and no_tiket mapping for legacy parity, and resolved frontend reverse() crash after batch creation (DONE)
123.  SIDAK Input Visual & Navigation Parity — Restored vertical list card layout (matching legacy), compact inline breadcrumb with actual selected values, added Estimasi Skor card (live score with NC/CR breakdown + progress bar), added Konfigurasi Audit card (service dropdown + tim info) moved from step 3 to step 4, added Show All Data toggle (eye icon) in step 1, fixed navigation pre-fill from agent detail page to skip directly to period step via URL params consumption, added client-side scoring utility (`apps/web/src/lib/scoring.ts`), 24 regression tests (DONE)
124.  **SIDAK Input Railway Build Fix (ArrowLeft Import)** — Added missing `ArrowLeft` lucide-react import in `input.tsx` that caused Railway deployment build failure (TS2304). TypeScript error `Cannot find name 'ArrowLeft'` at line 1032. (DONE)
125.  **Top 5 Pengurang Skor Terbesar Legacy Parity** — Fixed `topTickets` computation to match legacy: month scoping, `scoreSession()` with weighted/flat/no_category modes, service weights from `qa_service_weights` table with `DEFAULT_SERVICE_WEIGHTS` fallback, 3-level tiebreaker sort, and renamed properties (`deduction`→`scoreDeduction`, `count`→`findingCount`). Added shared scoring functions to `apps/web/src/lib/scoring.ts`, weights field to API response, and 17 regression tests. Post-commit fixes: resolved Railway build TS errors (`ScoringMode` import, `ParsedImportRow`→`ImportRowType`), fixed 2 pre-existing `STACK_TRACE_ERROR` test failures (vitest 4.x `importOriginal` mock pattern + jsdom `scrollTo` stub). Final: 387 web PASS + 407 API PASS, 0 failures. (DONE)
126.  **SIDAK Input Period + Temuan Legacy Refresh** — Audit ditemukan 7 gap kritikal (tidak fetch service weights, inline liveScore tidak mode-aware, tidak ada handleServiceChange, scoringMode tidak di-pass ke dropdown, tidak fetch indikator+weights saat period select, phantom padding filter hilang, tidak ada client-side duplicate check). Implementasi: expanded scoring.ts dengan `calculateQAScoreFromTemuan` + `resolveServiceTypeFromTeam` + `NILAI_LABELS`, created 3 new components (`SidakInputScoreCard`, `SidakInputManualForm`, `SidakInputImportPanel`), major-modified `input.tsx` (add activeWeight state, handleServiceChange, leader role guard, filtering), upgraded `TemuanGroupCard` (session number, category chip, NILAI_LABELS, canEdit). 52 total tests passing (32 existing + 20 new). (DONE)
127.  **SIDAK Ranking Service Filter Fix** — Fixed bug where Ranking Agen and Dashboard service filter dropdowns only showed "Call" instead of all services with data. Root cause: `availableServices` was derived from `dashboardData.serviceData` (already filtered by active `service_type`). Fix: added parallel `distinctQuery` (SELECT `service_type` WITHOUT `service_type` filter) in `getDashboardData()`, simplified `/ranking` endpoint to use `dashboardData.availableServices` directly. Leader scope enforcement preserved via `allowedSvcs` intersection. 4 new regression tests. Zero frontend changes. 411 API + 385 web tests passing. (DONE)
128.  **SIDAK Sesi Tanpa Temuan Legacy Parity** — Added "Sesi Tanpa Temuan" (phantom padding) feature for SIDAK Input. Users with trainer/admin role can create 5 phantom sessions (nilai=3, is_phantom_padding=true) when agent has no bad findings (nilai < 3). New `POST /temuan/perfect-session` API endpoint with RBAC guard, duplicate batch protection, rule version resolution, activity logging, and dashboard summary refresh. Frontend green button "Sesi Tanpa Temuan" with hasBadFindings guard (disabled → "Sudah Ada Temuan"), hidden when form/import active or role===leader. 4 API + 7 web regression tests. 415 API + 394 web tests passing. (DONE)
129.  **SIDAK Ranking Month Filter Fix** — Fixed bug where monthly Agent Ranking filter showed YTD historical findings instead of filtering strictly by the selected month. Passed `period_ids` (and conditionally set `year` to undefined for all-time selections) from Hono route `/ranking` to `getDashboardData()`. Added 4 API integration tests in `sidak-ranking-route.test.ts`. 423 API + 394 web tests passing. (DONE)
130.  **SIDAK YTD & Monthly Agent Ranking Change Indicator** — Added rank position change indicators to the Agent Ranking page for both YTD and Monthly selections. Compares current ranking with previous ranking (preceding YTD or preceding month) to calculate `rankChange` (+X/-X index shift). Renders red upward arrows (`▲ +X`) for rank increases (higher defects, worse performance), green downward arrows (`▼ -X`) for rank decreases (fewer defects, better performance), and blue badges (`Baru`) for new agents evaluated in the period. Added optional `limit` parameter to `getDashboardData()`, implemented rank shift calculations, updated types, added integration tests, removed top 20 limit constraint, and added a dynamic context subtitle `"Sebelumnya Posisi X"` under the ranking badges for clearer UX. 425 API + 394 web tests passing. (DONE)
131.  **KETIK Review Progress & Scoring Fix** — Fixed 2 critical UX bugs in AI review: (1) progress bar stuck at 5% — added auto-transition timer (starting→processing after 2s), non-linear progress curve, standalone progress bar with visible ETA; (2) all scores displayed as 0 — backend returns scores in `POST /ketik/review` response, frontend maps `detail.scores` fallback. Score card UI overhaul: grade color coding, mini progress bars, rubric legend. 6 files modified, 17 frontend + 22 API tests. (DONE)
132.  **PDKT Mailbox Error Handling & API Env Bootstrap** — Null-safe auth header extraction across all PDKT endpoints, ExecutionContext guard for test compatibility, structured error logging, human-friendly error wrapping in service (4 functions). Frontend error state UI with retry, success toast on reply, error message passthrough, diagnostic warnings for empty scenarios. Added `VITE_SUPABASE_ANON_KEY` / `SUPABASE_ANON_KEY` env vars with Zod validation + test coverage. Fixed `createAdminClient()` to use env variable. 5 new frontend tests. 425 API + 394 web tests passing. (DONE)
133.  **AI Usage Delta Fix & Monitoring Cost Separation** — Fixed 4 issues: (1) KETIK "Kenaikan setelah sesi terakhir" kosong — replaced inline 8-retry polling (14s) with shared `pollUsageDelta()` utility (15 retries, 32s, `after.totalCalls > baseline.totalCalls` guard); (2) PDKT delta menampilkan Rp0 — fixed `finally` clearing `sessionDeltaPending` during retries, zero delta filtered; (3) Telefun delta — added missing `sessionDeltaPending` state, replaced raw fetch with `pollUsageDelta()`; (4) Period label "30 mei - 31 mei" — fixed WIB timezone offset bug in `/ai/usage/summary`. Monitoring separation: added `action_category` filter to `/ai/monitoring/aggregation` with `SIMULATION_ACTIONS`/`REVIEW_ACTIONS` constants, 2 new KPI cards (Biaya Simulasi + Penilaian AI), toggle pills, simulation/review columns, action category badges. 7 files modified, 1 new test file (12 tests). 457 API + 424 web tests passing. (DONE)
134.  **AI Usage Cost Breakdown in Module Usage Buttons & Modals** — Extended `GET /ai/usage/summary` to return `simulationCostIdr` + `reviewCostIdr`. Upgraded shared `UsageModal` with "Biaya Simulasi" (green) and "Biaya Penilaian AI" (amber) KPI cards, plus simulation/review split in session delta section. Added post-simulation cost toasts in all 3 modules (`"Biaya sesi ini: +RpXrb | Simulasi Rp... | Penilaian AI Rp..."`). Extended baseline capture with new fields. 9 new tests (3 API + 4 component + 2 unit). 460 API + 431 web tests passing. (DONE)
135.  **Monitoring Telefun History Schema Fix** — Fixed `GET /api/v1/ai/monitoring/history` and review endpoint querying `telefun_history` with legacy column names (`date`, `duration`, `recording_url`) that don't exist in the Vite schema. Aligned to actual columns: `created_at`, `duration_seconds`, `recording_path`. Fixed frontend `TelefunReviewPanel` interface + usages. Added 5 regression tests verifying no legacy column usage. No migration required — DB schema was already correct. (DONE)
136.  **Monitoring Redesign & Visual Polish** — Visual redesign of `/monitoring` under `ui-ux-pro-max` guidelines. Removed visual noise, excessive colors, boxy sub-grids, and high-contrast progress bars. Consolidated KPI metric grids (from 7 to 4 cards on history tab, and from 6 to 4 cards on usage tab). Unified module tabs, status dropdown, and search query filters into a single horizontal container. Simplified table rows, exchange rate inputs, and outline details buttons. Added `sr-only` elements for module statistics queries to maintain 100% compatibility with existing integration tests. 6 files modified, 452 frontend + 425 API regression tests passing. (DONE)
137.  **Monitoring Overstimulation Fix & Paginated Table Redesign** — Redesigned `/monitoring` page into a spacious, premium paginated table to prevent card fatigue and overstimulation. Added top KPI cards with growth rates, inline date-range popover picker, and modular submetric columns. Case-converted module badges and card titles to lowercase and used CSS transforms to fix Testing Library duplicate queries. 3 files modified, 39/39 regression tests passing. (DONE)
138.  **Monitoring Category Filter Toggle Removal** — Removed the non-functioning "Semua", "Simulasi", and "Penilaian" category toggle buttons from the Token Usage tab. Cleaned up lifted React state variables, API fetch parameters, and component props to simplify the interface, eliminate visual redundancy, and prevent visual layout issues with empty columns. 2 files modified, 452 web + 425 API regression tests passing. (DONE)
139.  **SIDAK Agent Current Month Display** — Added the latest audited month name in parentheses next to the agent's average score percentage on the Directory Agent page (Vite parity + UX improvement). Added `periodMonth` to backend `getAgentDirectorySummary` response, updated shared `AgentDirectoryEntry` interface, re-added `%` to frontend score, and implemented a baseline-aligned flex layout displaying Indonesian short month names. Added 4 frontend tests for `AgentCard` component. 4 files modified, 1 new test file, 477 API + 457 web regression tests passing. (DONE)
140.  **Maintainability Refactor & Recording Fix** — SIDAK service decomposition into 13 sub-modules (shared-constants, access-scope, period-indicator, temuan-service, agent-directory, rule-versions, service-trends, dashboard-data, dashboard-aggregation, dashboard-trends, dashboard-types, report-data, report-archives) + extracted ranking-service.ts + shared math-utils.ts; Telefun API adapter replacing raw `fetch()`, shared AI model registry eliminating duplicate model lists, KETIK/PDKT settings modal layout decomposition. Post-review fix: Telefun recording endpoint `{ success, url }` → `{ success, data: { url }, url }` (fetchApi unwrap compat + backward-compat), fixed 3 frontend recording consumers. 28 files modified/added. Full suite: build pass, API 475 + web 468 tests pass, 0 failures. (DONE)
141.  **Types Circular Dependency Fix** — Resolved circular dependencies between `packages/types/src/index.ts` and `packages/types/src/ai-models.ts` causing Railway deployment syntax crashes during build/runtime. Moved types to be self-contained in `ai-models.ts` and unidirectional in `index.ts`. All tasks build successfully. (DONE)
142.  **SIDAK Service Thermo-Nuclear Code Quality Refactor** — Performed code quality refactor on decomposed SIDAK service modules: simplified barrel file `sidak-service.ts` using `export * from` statements (reduced from 176 lines to 14), extracted shared `buildTrendResult` helper to eliminate ~100 lines of duplicated trend aggregation in `service-trends.ts`, defined unified `REPORT_ADMIN_ROLES` constant to clean up repeated inline arrays in `report-archives.ts`, and optimized array allocation loops (from `concat`/spread to `.push(...)`) in `agent-directory.ts` and `service-trends.ts`. All 479 API + 468 web tests passing. (DONE)
143.  **SIDAK Route AI Report & Folders/Agents Extraction** — Extracted AI report generation (`generateAiReport`, `aiReportSchema`) from `routes/sidak.ts` into new `sidak/ai-report-service.ts` sub-module. Extracted `getAllFolders()` and `getAgentsByFolder()` into `sidak/access-scope.ts`. Replaced ~150 lines of inline route logic with delegated service calls. Added gemini/openrouter mocks to sidak-service.test.ts for AI report test coverage. 1 new file, 4 modified, 479 API + 468 web tests passing. (DONE)
144.  **SIDAK Route Full Decomposition** — Completed full decomposition of monolithic `routes/sidak.ts` (1,503 → 19 lines, 27 handlers across 5 sub-modules: core, dashboard, temuan, rule-versions, reports). All helpers preserved. Graphify synced. (DONE)
145.  **Telefun Route Full Decomposition** — Completed full decomposition of monolithic `routes/telefun.ts` (1,240 → 21 lines, 12 handlers across 4 sub-modules: sessions, recordings, settings, annotations). All helpers re-exported for test backward compatibility. Graphify synced. (DONE)
146.  **KETIK ChatInterface Message Utils & Pacing Extraction** — Extracted inline constants, helpers, and pacing functions from `ChatInterface.tsx` (277 → 16 lines) into `ketik/lib/message-utils.ts` (193 lines) and `ketik/lib/pacing.ts` (69 lines). Pure extraction, zero logic change. (DONE)
147.  **KETIK Service Decomposition** — Decomposed monolithic `ketik-service.ts` (1,400 → 5 lines barrel file) into 5 sub-modules under `apps/api/src/services/ketik/`: `shared-utils.ts` (9 lines — `extractJsonObjectText`), `consumer-response.ts` (347 lines — scenario defaults, consumer response generation), `review-lifecycle.ts` (317 lines — `triggerKetikAIReview` lifecycle), `review-processor.ts` (353 lines — `processKetikReviewJob` with AI scoring), `settings-history.ts` (369 lines — session CRUD, settings history). Backward compatible — all consumers import via barrel unchanged. 484 API tests passing. (DONE)
148.  **Settings Modal Full Decomposition** — Decomposed 3 monolithic SettingsModal components (Telefun 1,232→78, KETIK 915→58, PDKT 976→63 lines) into per-tab sub-modules. Created shared `useCrudForm` hook (87 lines) with generic CRUD form state management (openAdd/openEdit/close, save/remove, isDirty/isValid). Extracted all tab content to dedicated components: Telefun (Scenarios/Consumers/Identity/SystemTabs), KETIK (Scenarios/Consumers/Identity/TemplateTabs), PDKT (Scenarios/Consumers/IdentityTabs). 18 files modified/added, pure decomposition with zero logic change. (DONE)
149.  **SIDAK Input Hooks Decomposition** — Extracted 3 custom hooks from monolithic `input.tsx` (767→274 lines): `useTemuanEdit` (106 lines — edit/delete state + save handler), `useTemuanForm` (217 lines — manual form entries, validation, duplicate check, batch save, perfect score), `useTemuanImport` (327 lines — Excel template download, file parse, import save with duplicate/preview). Also extracted `newEntry()` helper and `FormEntry` interface. Pure decomposition, zero logic change. (DONE)
150.  **Thermo Quality Gate Hardening** — Post-decomposition cleanup: immutable settings draft saves, typed collection-draft helper, SIDAK input rule indicator source-of-truth, whitespace/lint blockers cleared. (DONE)
151.  **Settings Draft Type Safety Hardening** — Eliminated 15+ `as T`/`as any` assertions from settings draft system. Added `createItem`/`updateItem` factories to `useCrudForm`, `create` factory to `useCollectionDraft` (replacing `idPrefix`/`extraDefaults`), `isEqual` comparator (replacing `JSON.stringify`), typed all `setLocalSettings` dispatches and inline callbacks, added `TelefunTransport` type alias + `TelefunVoiceModel` interface. 14 files modified, behavior-preserving. (DONE)
152.  **Settings Draft Canonical Commit** — Unified tab-level save and modal-level save into canonical commit path via `useCrudForm.save(items, draftOverride)`. Removed `applyCollectionDraft` helper that duplicated commit behavior. KETIK/Telefun scenario script toggle now clears draft script when disabled to prevent stale saves. Telefun settings parser uses coercion helpers for persisted enum-like values. 4 files modified, 0 new tests. (DONE)
153.  **Settings Draft Normalization Hardening** — Extracted default entity logic from tab-level saves and `createItem` factories into pure per-domain normalizer functions for KETIK (scenario, consumer, quick template), PDKT (scenario, consumer), and Telefun (scenario, consumer). Hardened Telefun persisted settings parser with item-level validation for `scenarios` and `consumerTypes`. Normalizers reused from both tab-level saves and modal-level `createItem` factories, eliminating drift risk between save paths. 4 new normalizer files, 1 new test file (134 lines, 5 test cases), 6 modified tab files. 35 tests passing, 0 TS errors. (DONE)
154.  **pnpm 11 Migration** — Upgraded pnpm from 9.0.0 → 11.5.0. Two breaking changes fixed: (1) `allowBuilds` block added to `pnpm-workspace.yaml` for 5 packages (pnpm 11 blocks all build scripts by default), (2) `CI=true` required to skip TTY prompt on module recreation. No pnpm config in `package.json` or `.npmrc` meant other migration rules were moot. 3 files modified, 504 API + 485 web tests passing. (DONE)
155.  **Mega Maintainability Refactor** — Massive decomposition across 5 areas: (1) Profiler pages (export/slides/table) → 11 components + 5 utils + 1 hook, (2) SIDAK Settings → 4 components + constants, (3) `packages/types` barrel → 8 domain files, (4) data integrity scripts → 6 sub-modules, (5) API test suites (RLS, SIDAK dashboard, data integrity) → 10 focused test files + shared fixtures. ~9,081 lines removed from monolithic files, ~38 new files created. Zero logic change. (DONE)
156.  **AI Usage Post-Session Detail Breakdown** — Extended `/ai/usage/summary` API to return `breakdown: { simulation, review, uncategorized }` per-category stats (calls, input/output tokens, cost IDR/USD) classified via `SIMULATION_ACTIONS`/`REVIEW_ACTIONS`. Frontend: new `fetchUsageSummary()` shared helper, `UsageBreakdownRows` component (3 categories with icon+label+cost+token+call), upgraded `UsageModal`, toast with category split (`Biaya sesi ini: +RpX | Simulasi RpY | Penilaian AI RpZ`), post-session delta computed per-category. Refactored all 3 module landing pages (KETIK, PDKT, Telefun) to use shared helper. 6 files modified + 2 new (`usage-summary.ts` lib + test), 19 new tests. Zero new deps, zero new migrations. 493 API + 477 web tests passing. (DONE)
157.  **Identity & Company Context Fallback** — Ensured KETIK, PDKT, and Telefun never display identity/company placeholders when fields are blank. PDKT: new `pdkt-template-resolver.ts` + `pdkt-company-names.ts` services centralize placeholder resolution (licensed Perbankan/Asuransi pools, fictive unlicensed names), generic `ANY_PLACEHOLDER_PATTERN` plus split `CONSUMER_PLACEHOLDER_PATTERNS` / `COMPANY_PLACEHOLDER_PATTERNS` with `sanitizePdktTemplateText` for subject+body, AI generation now retries once on leftover placeholders or short word count with combined hints and final post-retry guard. KETIK: extracted `resolveKetikSessionIdentity` pure helper from `index.tsx`. Telefun: locked `resolveFinalIdentity` fallback with regression tests. Follow-up: broadened placeholder regex to cover consumer aliases (`[Nama Nasabah]`, `[Nama Pengirim]`, etc.), applied sanitization to subject in addition to body, and unified retry path. 5 files modified + 2 new service files, regression tests added across `pdkt-template-resolver.test.ts`, `pdkt.test.ts`, `ketik-identity.test.ts`, `telefun-settings-model-default.test.ts`. (DONE)
158.  **Telefun Hold Overtime & Deterministic Assessment** — Hold pertama memakai batas 1 menit dan hold berikutnya 3 menit tanpa auto-release; UI beralih ke overtime yang terus berjalan sampai agen kembali. Interval hold dipersist di `session_metrics.hold`, dinilai deterministik sebagai N/A/Baik/Kurang, dan ditampilkan sebagai aspek operasional terpisah dari radar suara. Post-execution audit memperbaiki fallback assessment historis, feedback summary, cached score synchronization, malformed interval handling, duplicated constants, dan render timer berfrekuensi tinggi. 65 focused web + 58 focused API tests passing; web/API builds passing. (DONE)
159.  **PDKT Consumer Name & Realistic Mode Hardening** — Centralized PDKT prompt policy module (`pdkt-email-policy.ts`) as single source of truth for name mention patterns (upfront/middle/late/none), realistic writing style rules, and compliance validators. Refactored `pdkt-service.ts` to delegate prompt generation to policy module. Added meta-language and mention pattern compliance validation with retry-once-then-fail-closed. Template resolver updated to respect name positioning rules. 514 API tests passing. (DONE)
160.  **PDKT Settings Visual Polish** — Aligned PDKT SettingsModal visual language with KETIK and Telefun modals: lighter overlay (`bg-background/80 backdrop-blur-md`), smoother spring animations (bounce 0.1, duration 0.4), consistent `bg-muted/20` header bar, `border-l-2 border-primary` left-border banner pattern, compact card styling (`p-5`, `gap-3`), `rounded-lg` interactive elements with `cursor-pointer`, consistent typography scale (`text-xs` body, `text-[10px] font-bold uppercase tracking-widest` labels), "Lampiran" label for attachment badges. 5 files modified, pure visual refinement with zero logic change. (DONE)
161.  **PDKT AI Image Generation Remediation & Robust JSON Parsing** — Created decoupled backend image generation service (`pdkt/image-generation.ts`) with provider-agnostic fallback. Updated model registry with `AiModelCapabilities` metadata (`supportsImage`, `imageGenerationMode`). Refactored `initializeEmailSession` to orchestrate pipeline: generate email → resolve attachment policy (Manual > AI > None) → generate AI images. Graceful fallback: AI image failure doesn't break session. Updated Gemini/OpenRouter multimodal parsers for `inlineData` and `message.images`. New unified `POST /session/init` endpoint, simplified frontend start-session flow. Added explanatory microcopy under AI toggle. **Follow-up**: Extracted robust JSON parsing library `ai-json.ts` with iterative brace-matching algorithm, replacing fragile regex-based parsing across PDKT, KETIK, SIDAK AI report, and Telefun analysis services. 12 files modified + 4 new files, 4 API + 1 web regression tests passing. (DONE)
162.  **PDKT Full Decomposition** — Completed full decomposition of monolithic PDKT route and service layer (analogous to Phase 79 SIDAK and Phase 80 Telefun). `routes/pdkt.ts` reduced 723→8 lines, `services/pdkt-service.ts` reduced 980→15 lines (both pure barrel/facade files). New route sub-modules under `routes/pdkt/`: `index.ts` (16), `simulation.ts` (162), `mailbox.ts` (167), `history.ts` (185), `settings.ts` (82), `route-utils.ts` (91). New service sub-modules under `services/pdkt/`: `catalog-service.ts` (167), `session-service.ts` (407), `evaluation-service.ts` (234), `mailbox-service.ts` (108), `shared-utils.ts` (90). Frontend `PdktScenariosTab.tsx` reduced 467→263 lines, decomposed into 5 sub-components under `scenarios/`: `ScenarioList`, `ScenarioForm`, `ScenarioAttachments`, `ScenarioAIGenerator`, `ScenarioTemplateField`. `mailbox-session.ts` (Phase 95) and `image-generation.ts` retained as orchestrator + provider-agnostic image gen. Typed `SupabaseClient` parameters and `unknown` error narrowing across `mailbox-service.ts`/`mailbox-session.ts`/`image-generation.ts`. 519 API + 503 web tests passing. (DONE)

163.  **PDKT Natural Name, Clues, and AI Image Diagnostics** — Fixed 3 critical issues in PDKT: (1) Identity name leakage — `bodyName` (e.g. "Susanto") now correctly used in email body instead of header `name` (e.g. "Black Cat"), with forbidden name cleaning post-render; (2) Generic intro elimination — replaced hardcoded fallbacks with 11 natural context clue templates (document/SLIK/billing context) across upfront/middle/late placements, deterministic seed-based indexing; (3) Structured AI image diagnostics — `generatePdktScenarioImages` returns `PdktImageGenerationDiagnostics` with `warning`/`reason`/`error`, propagated as `attachmentWarning` to frontend via `emailMessageSchema`, rendered as amber AlertCard. Added compliance validation for forbidden name leakage and generic intro phrases (`"Perkenalkan, nama saya..."`). 9 files modified, ~318 lines added. (DONE)
164.  **Lint Debt & Gemini 3.5 Flash** — Cleaned up lint debt (unused imports, `require()` → static import, Error `cause` param) and integrated Gemini 3.5 Flash model across all modules via shared `TEXT_SIMULATION_MODELS` registry. Added smoke test, unit tests, and SIDAK Report AI model filtering. 15+ files modified. (DONE)
165.  **AI Usage Categories Extraction & KETIK Review State Machine** — Centralized AI action classification into `ai-usage-categories.ts` with 14-action definition map replacing inline `SIMULATION_ACTIONS`/`REVIEW_ACTIONS` sets. Extracted `/usage/summary` inline logic into `ai-usage-summary-service.ts` with enriched `breakdownItems` (per-key labeled items). Extracted KETIK review lifecycle state logic into pure `resolveKetikReviewState()` function with 12 deterministic transition cases. Added PDKT `attachmentWarning` AlertCard rendering. 5 new files, 13 files modified. (DONE)
166.  **Profiler Reorder Auth & Grid View** — Fix reorder authorization (bulk_reorder_profiler_peserta now handles service_role properly with auth.uid() bypass). Terminal migration `20260602000000_fix_bulk_reorder_profiler_peserta_auth.sql` with dedup/validity checks. Backend error mapping (`mapReorderError` with human-friendly messages, removed fallback row-by-row update). Frontend API transport cleanup (replaced custom fetchApi with unified `getApi` helper). New grid view components: `ProfilerParticipantCard` (glassmorphism card) and `ProfilerParticipantGrid` (responsive CSS grid 1→4 cols). Sort disabled on filter with tooltip. 540 API + 509 web tests passing. (DONE)
167.  **SIDAK Input Selection Grid & Card Refactor** — Extracted shared `SidakSelectionCard`, `SidakSelectionGrid`, and `TemuanGroupGrid` components from inline code in `input.tsx`. Changed folder/agent/period selection from single-column vertical list to responsive multi-column grid (1→3 cols). Changed card layout from horizontal to vertical (`flex-col min-h-32 p-5`). Changed temuan list from `space-y-3` to responsive grid (1→3 cols). Exported `TemuanItem`/`TemuanGroup`/`TemuanGroupCardProps` interfaces. Updated all tests. 0 logic changes. (DONE)
168.  **SIDAK Parameter Period Isolation** — Period-aware rule version resolution with `resolveEffectiveRuleVersionForPeriod()`. Period-scoped superseding: publish hanya menggantikan versi published di periode target yang sama. Dashboard & summary menggunakan snapshot bobot/indikator per `(service_type, period_id)`. New `DELETE /rule-versions/:id` endpoint untuk hapus draft. Rule versions sorted newest-first di backend. Frontend: dynamic confirm dialog copy, sorted period dropdown, clarified publish warning. Tests updated with table-aware mock pattern. (DONE)
169.  **SIDAK Dashboard KPI Delta & Compliance Sparkline Fix** — New `buildKpiDelta()` utility with direction/magnitude/tone, two unit modes (relative-percent for counts, percentage-point for percentages). KpiCard refactored to accept `KpiDeltaViewModel` instead of raw `delta`+`invertDelta`. Compliance sparkline now uses `complianceRate` (percentage) instead of raw count. New `DashboardSparklinePoint` type with `count`/`totalAudited`. 3 new test files. (DONE)
170.  **SIDAK ParetoChart Tooltip Fix (RCA BKO)** — Exported custom `ParetoTooltip` with full parameter name, counts, cumulative %, category, and layanan label; hover cursor highlight; `minPointSize={4}` for short bars; normalized category color mapping; No Category legend item. Added `SERVICE_LABELS` constant. 4 files modified, 2 test files. (DONE)
171.  **PDKT Shared Mailbox Ownership** — Changed PDKT mailbox from per-user fanout copies to a single shared canonical mailbox accessible by all authenticated users (admin, trainer, leader, agent). Added creator metadata display (`created_by_user` with full_name/role/is_current_user), role-based delete authorization (admin/trainer can delete any, others only their own), new RPC `soft_delete_pdkt_mailbox_item` with SECURITY DEFINER, backfill of `created_by_user_id` null values, updated `submit_pdkt_mailbox_batch`/`submit_pdkt_mailbox_reply` RPCs, 403-aware error passthrough in `jsonServerError`, human-friendly tooltip for disabled delete button, creator label in sidebar and detail pane. 1 terminal migration, 1 rollback, 14 files modified, 40+ API + web regression tests passing. (DONE)
172.  **PDKT Bulk Delete & Soft Delete RPC Fix** — Added bulk soft delete for PDKT mailbox items via `POST /pdkt/mailbox/batch-delete` endpoint; fixed `soft_delete_pdkt_mailbox_item` RPC to use `COALESCE(created_by_user_id, user_id)` for legacy data where creator is NULL. Bulk delete service uses per-item permission check via `canDeletePdktMailboxItem`, parallel `Promise.allSettled` execution, and detailed `BulkDeleteResult` summary. Frontend: bulk selection mode with checkboxes, disabled checkbox for non-deletable items with tooltip, batch delete confirmation dialog, partial success/failure toast. 1 terminal migration, 1 rollback, 10 files modified, 3 new test suites. (DONE)
173.  **PDKT Shared Mailbox Evaluation Access Sharing Fix** — Fixed AI evaluation polling and retry access blocks for non-owner users when mailbox items are shared. Implemented a two-tier verification check: first tries user client (respecting owner-only RLS on pdkt_history), then queries pdkt_mailbox_items to check if linked to a visible mailbox item, falling back to adminClient query. Removed user_id constraints from background worker processPdktEvaluation. Added 4 E2E route tests. (DONE)
174.  **SIDAK Dashboard Trend Toggle & Total Temuan Filter** — Added "Tampilkan Semua"/"Sembunyikan Semua" toggle for parameter trend chart with rotation animation; "Total Temuan" filter button on Agent Trend Tab isolates only total trend line with active pill styling. 2 files modified. (DONE)
175.  **SIDAK Agent Score Caching & Score Card UI Overhaul** — Agent detail now queries `qa_dashboard_agent_period_summary` MV for cached per-period scores with real-time fallback using `resolveEffectiveRuleVersionForPeriod`. SidakInputScoreCard complete UI overhaul: SVG radial progress ring, glassmorphism, live pulse badge, ShieldAlert/ShieldCheck icons. 3 files modified. (DONE)
176.  **SIDAK Dashboard Summary Consistency Fix** — Dashboard summary KPI cards (`totalDefects`, `avgAgentScore`, `complianceRate`) now computed real-time from `qa_temuan` via app scoring engine, replacing chain MV/cache lookups. Ensures consistency with trend chart data. Multi-period summaries aggregate weighted averages from `periodMetrics`. Compliance description differentiates single vs multi-month. Documentation synced across 4 docs files. 10 files modified. (DONE)
177.  **Telefun Finalizer Status Refactor** — Replaced 3 mutable failure flags (`scoringFailed`, `saveFailed`, `uploadFailed`) scattered across `sessionFinalizer.ts` with a typed `FinalizerStatus` object and explicit marking helpers (`createFinalizerStatus()`, `markUploadFailed()`, `markSaveFailed()`, `markScoringFailed()`). Behavior-preserving refactor — public return contract unchanged. 2 characterization tests added. 1 file modified. (DONE)
178.  **Type Safety & Maintainability Refactor** — Three independent type safety improvements: (1) KETIK ChatInterface — extracted `KetikMessageBubble`, `KetikImageLightbox`, `getKetikScenarioImages` into dedicated files; `ChatInterface.tsx` reduced 277→16 lines. (2) SIDAK dashboard types — added 9 typed converter functions in `dashboard-types.ts`, replaced all `(agent as any).xxx` mutations with `withDashboardAgentMetrics()`, added `DashboardAgentWithMetrics` type, added `no_tiket`/`created_at` fields to `DashboardTemuanRow`. (3) Telefun realistic mode — added `RealisticModeMetrics` interface, typed AudioContext fallback, removed `(metrics as any)` casts via `SessionMetricsExtended.realisticModeMetrics`. 3 new boundary test files. Zero logic change. (DONE)
179.  **Profiler Slides Label Fix** — Renamed slide mode labels for clarity: "Original" → "Landscape" (title: "Versi Landscape"), "Opsi 2" → "Portrait" (title: "Portrait A4"). Updated `ParticipantSlide.tsx` subtitle from "Opsi 2 · Portrait A4" to "Portrait A4". 2 files modified. (DONE)
180.  **Telefun Live Audio, Orchestrator, Radar, dan Identity Fix** — Fixed 5 Telefun bugs: (1) Gender-first identity resolver (`resolveFinalIdentity()` gender-first, `pickIdentityProfileForGender()` helper, Kore voice auto-normalize), (2) Orchestrator removal from live path (prompt-only realistic mode + SILENT HANDLING section), (3) Audio encoding hardening (`float32ToPcm16Buffer()` helper, base64 roundtrip validation), (4) Canonical communication profile builder (`packages/types/src/telefun-communication-profile.ts` shared source-of-truth), (5) Radar chart explicit dataKey (`userValue`/`targetValue`), ResizeObserver dimension guard. 14 files modified, 1 new shared helper file, 199 tests passing (164 web + 30 API + 5 proxy). (DONE)

181.  **KETIK [NO_RESPONSE] Tag Leak Fix** — Tag internal `[NO_RESPONSE]` yang bocor ke UI chat KETIK di-strip dengan defense-in-depth: (1) Backend `sanitizeConsumerText()` stripping regex + collapse double spaces, (2) Frontend guard di `ChatInterface.tsx` dengan pattern `NO_RESPONSE_PATTERN_GLOBAL` dari `message-utils.ts`, (3) `sanitizeConsumerText()` di-export untuk testing langsung. 9 backend + 6 frontend regression tests, 581 API + ~469 web tests passing. 6 files modified/added. (DONE)

182.  **Telefun Disable Silence & Dead-Air Detectors** — Mematikan `SilenceDetector` server-side Telefun (5 detik) dan client `Dead Air Detector` (7 detik + cooldown 12 detik), termasuk hapus auto prompt `[INSTRUKSI SISTEM - DEAD AIR]`. Silent instruction di `promptBuilder.ts` diperpanjang 3x (<10→<30, 10-15→30-45 detik). Gemini VAD tidak disentuh. 8 files modified/added, 30 regression tests (7 + 23) passing. (DONE)
183.  **KTP Manual Input Storage Bucket Fix** — Memperbaiki kegagalan CRUD KTP saat role `trainer` menambahkan peserta manual dengan foto. Root cause: mismatch kontrak storage bucket antara frontend (`profiler-assets`), backend (`foto-avatar`), dan docs (`profiler-foto`). Fix: canonical helper frontend (`profilerPhotoStorage.ts`) dan backend (`profiler-photo-storage.ts`) dengan bucket `profiler-foto`, terminal migration storage policy, route contract test untuk trainer create. 6 new files, 4 modified files, 40 tests passing. (DONE)
184.  **Telefun AI Assessment Radar Consistency** — Pemisahan dan normalisasi kualitas skor (0-10), displayScore (0-100), raw value, dan target QA (Speaking Rate 70, Intonation 80, Articulation 90, Fillers 20, Tone 85) untuk data assessment AI Telefun. Memperkenalkan reusable component `VoiceMetricCards.tsx`, memperbarui `VoiceRadarChart.tsx` dan `CommunicationProfileZoomModal.tsx` dengan visual copy target-distance. Rebuild profil stale/invalid secara otomatis di backend (`enrichAssessmentWithCommunicationProfile`) dan frontend (`getCommunicationProfileFromAssessment`). 8 files modified, 41 API + 44 web regression tests passing. (DONE)
185.  **Monitoring History Delete Atomicity** — Refactored monitoring history delete from manual multi-table orchestration in `routes/ai.ts` into a transactional PostgreSQL RPC `delete_monitoring_history` with SECURITY DEFINER. New typed service `monitoring-history-delete-service.ts` with domain error mapping (NOT_FOUND/DELETE_FAILED). Route validation with Zod enum+UUID schemas and human-friendly error responses. Terminal migration `20260605100000_atomic_monitoring_history_delete.sql`. 3 test files covering migration contract, service unit tests, and route integration tests. 29 tests passing across 5 test files, 626 API tests passing overall. (DONE)
186.  **Telefun Metrics Trust Boundary** — Memusatkan validasi assessment dan score Telefun di `@trainers/types`. Schema dan parser kanonik untuk assessment, hold, communication profile, dan score result. Menolak payload inti tidak lengkap dan angka non-finite. Menetapkan score Telefun `0..10`, mempertahankan nilai `0`. Memvalidasi cache dan output Gemini sebelum digunakan atau disimpan. Persistence assessment fail-closed ketika update Supabase gagal. Menghapus compatibility normalizer frontend yang mengubah payload invalid jadi skor nol. Mengetik dependency finalizer dan transport row tanpa `any`. 17 files modified, 639 API + 623 web tests passing. (DONE)
187.  **Test Suite Optimization & Tiering** — Removed 23 low-value tests (import verification, hardcoded CSS assertions, built-in API tests). Implemented 4-tier testing: `test:targeted` (10-30s, vitest --changed), `test:core` (30-60s, 175 critical contract tests), `test:fast` (1-2min, 983 unit tests), `test:full` (~5min, 1239 all tests). New `vitest.config.fast.ts` + `setup-fast.ts` for web. Pre-push workflow uses `test:core`. 10 files modified/added, 639 API + 600 web tests passing. (DONE)
188.  **Access Approval Module Information** — Added explicit KTP/SIDAK/KTP + SIDAK module badges to pending and approved request cards in the left list, module-aware search, accessible fallback handling, and frontend regression coverage. 3 files modified + 1 new test file + 1 rebuild log, 16 regression tests passing. (DONE)
189.  **Access Approval Grouped Leader Cards** — Consolidated KTP/SIDAK request rows into one Leader identity card using leader_user_id, added per-module detail switching, preserved request-level approval/revoke/group mutations, and added contract plus UI regression coverage. 5 files modified + 4 new files + 3 test files, 39 regression tests passing. (DONE)
190.  **Telefun Speaker & Timestamp Transcript** — Mengubah transcript Telefun dari satu paragraf AI-generated menjadi daftar percakapan bertimestamp dan berlabel pembicara dari Gemini Live transcription events. Added canonical `TelefunTranscriptEntry` contract, fragment-safe `TranscriptCollector`, typed server extractor, `outputAudioTranscription` setup, shared transcript UI for ReviewModal and Monitoring, API boundary validation, and legacy fallback. Post-execution audit removed internal `clientContent` prompt leakage, fixed streaming fragment whitespace/cumulative partial handling, separated model `turnComplete` from input chunks, added Monitoring and PATCH route coverage, and deleted dead `UtteranceBuffer`/`silence.ts`. 33 Telefun + 22 focused API + 38 focused Web tests passing; core tests, lint, and all workspace builds passing. (DONE)

191.  **Telefun Transcript Ordering & Graceful Shutdown** — Fix 2 critical bugs: (1) TranscriptCollector pake single buffer → di-refactor per-speaker lanes (`agent`/`consumer`) dengan logical turn, snapshot clamp timestamp monoton; (2) Graceful shutdown handshake — client stop audio → `audioStreamEnd` → `session_end_request`, server drain via `DrainCoordinator` (open→draining→finalized), quiet window 2s setelah Gemini boundary + hard timeout 10s. 59 telefun + 677 web tests passing. (DONE)
192.  **KETIK/PDKT Custom Scenarios & Consumer Types via Draft Payload** — KETIK `POST /ketik/generate` dan PDKT `POST /pdkt/session/create` tidak bisa menggunakan scenario/consumer type kustom dari Settings UI karena backend hanya lookup by ID. Fix: implementasi draft-object pattern — frontend kirim full object (scenarioDraft/consumerTypeDraft), backend prioritaskan draft atas ID lookup. Base64 images di-strip dari draft untuk hindari payload besar. 9 files modified, 166/166 core tests passing. (DONE)
193.  **Mobile Bottom Tab Navigation** — Added bottom tab navigation for mobile devices to access main modules (Dashboard, KETIK, PDKT, Telefun) on viewport < 1024px. Desktop tetap menggunakan sidebar. Included `allowedHosts` for tunnel testing (.trycloudflare.com, .lhr.life), dev mode CORS fallback in API, and established z-index contract for all layers (Header z-30, tabs z-50 through modals z-260). 3 files modified. (DONE)
194.  **Landing Page Total Redesign** — Complete visual overhaul of landing page to match pixel-perfect mockup. Dark mode by default, Outfit/Inter typography, precise SVG layout. Added CSS variables `--surface`, font setup, text stroke utilities. Includes navbar (56px), ultra-large hero type (`clamp(64px, 12vw, 160px)`) with outline text, dual-lane marquee ticker, premium bento grid module showcase, and polished CTA. 2 files modified. (DONE)
195.  **KETIK/PDKT Mobile Responsive Enhancement** — Mobile responsive fixes after bottom tab nav. KETIK: responsive header/avatar/button sizing, MapPin icon, cursor-pointer consistency, responsive padding. PDKT: sidebar/detail pane toggle on mobile with back button, auto-clear selection on viewport change, test coverage for back button. 4 files modified. (DONE)
196.  **Landing Page Hero Stack Cards** — Added interactive hero stack cards — visual previews of KETIK (chat bubbles), PDKT (email draft), and TELEFUN (call interface) as stacked glassmorphism cards with hover animation. Enhanced with animated state transitions: PDKT email with send button click → "Draft Terkirim!" success state; TELEFUN two-state machine (incoming call with ringing/accept/decline → active call with mute/end/live timer) running 10s CSS animation loop per card. 2 files modified. (DONE)
197.  **UI Radical Redesign Wave — Design System, Layout, SIDAK, Dashboard, Users** — Massive UI redesign across 8+ modules following `docs/design.md` design system. (1) Canonical CSS variable tokens (`--bg`, `--surface`, `--border`, `--fg`, `--fg2`, `--fg3`, `--inv-bg`, `--inv-fg`) replacing hardcoded Tailwind colors in `index.css` with Tailwind compatibility aliases. (2) Layout decomposition — extracted Sidebar, AppHeader, MobileTabBar, MobileDrawer, UserMenu, nav-config into `layout/` components, reducing Layout.tsx from 566→18 lines. (3) Motion primitives — FadeIn, StaggerList, StaggerItem, PageTransition for consistent entrance animations. (4) SIDAK Module radical redesign — all 21 SIDAK components updated with new design tokens (AgentCard, AgentProfileBar, AgentTemuanTab, Dashboards, KpiCard, ParetoChart, ScoreDetailCard, etc.). (5) Dashboard Bento layout — minimal greeting with date, 3-column bento grid with module cards, quick stats panel, SIDAK sparkline overview, recent activities card. (6) User Management redesign — stripped decorative icons/colored badges, clean card layout, CSS variables, AnimatePresence transitions. (7) Activity Logs refactor — semantic colors, responsive padding, clean table with module badges. (8) Profiler workspace redesign — updated BatchHero, HierarchyPanel, InsightPanel, ActionToolTile, WorkspaceNavigator. (9) Monitoring visual polish — consistent surface/border tokens across KetikReviewPanel, PdktEvaluationPanel, TelefunReviewPanel. 68 files modified, ~3049 insertions, ~2222 deletions. (DONE)
198.  **SIDAK Dashboard Forecast Stale Attention & Persistence Hardening** — Implemented batch forecast persistence for SIDAK Dashboard with SHA-256 fingerprinting. 3-state lifecycle (missing/fresh/stale) with visual attention effects (pulse animation on stale, reduced-motion support). Batch generation produces forecast series for total temuan + all parameters in one Gemini call. Deterministic linear regression for numbers, Gemini 3.1 Flash Lite for narrative insight. `POST /api/v1/sidak/dashboard/forecast` endpoint with `cacheOnly`/`forceRefresh` modes. Migration `20260614090000` creates `sidak_dashboard_forecast_snapshots` table with RLS locked to service_role. New components: `ForecastActionButton`, `ForecastInsightPanel`, `ForecastInsightParser`, upgraded `ParamTrendChart` with dashed forecast lines. 17+ files modified, 40+ regression tests. (DONE)

## Key Files Changed (Phase 58 — 118)

- `packages/types/src/index.ts` — **Phase 65**: Added `rankChange?: number | null` property to `TopAgentData` interface; **Phase 74**: Added `periodMonth?: number | null` property to `AgentDirectoryEntry` interface; **Phase 90**: Reduced from 1,158→9 lines (pure re-export barrel), types split into 8 domain files.
- `apps/web/src/routes/profiler/export.tsx` — **Phase 90**: Reduced 1,490→28 lines, delegates to ProfilerExportToolbar/ProfilerExportGrid + useProfilerExport hook
- `apps/web/src/routes/profiler/slides.tsx` — **Phase 90**: Reduced 682→~200 lines, delegates to ParticipantSlide/SlideCanvas/SlideModeControls components
- `apps/web/src/routes/profiler/table.tsx` — **Phase 90**: Reduced 810→~200 lines, delegates to ProfilerTableView/ProfilerTableFilters/EditPesertaModal/MoveFolderModal
- `apps/web/src/routes/sidak/settings.tsx` — **Phase 90**: Reduced 416→44 lines, delegates to RuleVersionPicker/ServiceWeightsPanel/RuleIndicatorsPanel/PublishRulePanel
- `scripts/data-integrity-checker.ts` — **Phase 90**: Reduced 1,072→137 lines (thin CLI wrapper), logic extracted to `scripts/data-integrity/` sub-modules
- `apps/api/src/__tests__/rls-verification.test.ts` — **Phase 90**: Reduced 1,309→181 lines (smoke-only), per-pattern tests extracted to 3 new test files
- `apps/api/src/services/sidak-service.ts` — **Phase 65**: Added optional `limit` parameter to `getDashboardData` to support custom slicing limits or bypass slicing (limit <= 0) to allow full agent listing; **Phase 74**: Populated `periodMonth` in `getAgentDirectorySummary` from the latest period associated with the agent's findings.
- `apps/web/src/components/sidak/AgentCard.tsx` — **Phase 74**: Added `%` sign back to score and rendered abbreviated audited month name in Indonesian next to the score percentage.
- `apps/api/src/routes/sidak.ts` — **Phase 64**: Forwarded `period_ids` query param and conditionally disabled `year` filter when `period === "alltime"` inside the `/ranking` endpoint; **Phase 65**: Implemented YTD and Monthly rank shift calculation by fetching current and previous lists and calculating rank index changes.
- `apps/api/src/__tests__/sidak-ranking-route.test.ts` — **NEW Phase 64**: Added 4 route integration tests validating parameter parsing and forwarding; **Phase 65**: Added tests validating previous vs current rank calculation for YTD and Monthly filters.
- `apps/web/src/routes/sidak/ranking.tsx` — **Phase 65**: Custom rendering of `rankChange` in Status column for YTD and Monthly views with red `▲ +X` upward badges, green `▼ -X` downward badges, gray `-` for neutral, and blue `Baru` badges, along with subtitle context `"Sebelumnya Posisi X"`.

- `apps/api/src/services/monitoring-history-service.ts` — **Phase 70**: Fixed Telefun history query to use Vite schema columns (`created_at`, `duration_seconds`, `recording_path`) instead of legacy aliases (`date`, `duration`, `recording_url`).
- `apps/api/src/routes/ai.ts` — **Phase 70**: Fixed Telefun review endpoint to query and return `recording_path`/`duration_seconds` instead of `recording_url`/`duration`.
- `apps/web/src/routes/monitoring/components/TelefunReviewPanel.tsx` — **Phase 70**: Updated `TelefunReviewData` interface and usages to match correct API response keys.
- `docs/rebuild-logs/phase-71-monitoring-redesign.md` — **NEW Phase 71**: Documentation for the monitoring dashboard visual redesign.
- `apps/web/src/routes/monitoring/components/HistoryCard.tsx` — **Phase 71**: Clean inline dot-separated metadata representation, simplified button styling, fully clickable card with hover effects.
- `apps/web/src/routes/monitoring/components/HistoryTab.tsx` — **Phase 71**: Consolidated 7 cards into 4 clean cards, integrated filters container, added hidden test query elements.
- `apps/web/src/routes/monitoring/components/UsageTab.tsx` — **Phase 71**: Consolidated 6 cards into 4 clean usage summary cards, aligned tables and typography.
- `apps/web/src/routes/monitoring/components/PricingTab.tsx` & `components/PricingRow.tsx` — **Phase 71**: Refined Exchange rate inputs and input borders.
- `apps/web/src/routes/monitoring/MonitoringPage.tsx` — **Phase 71**: Refined headers and unified active tab border-primary indicator; **Phase 72**: Redesigned headers and sub-tab switcher for visually clean OBS layout.
- `apps/web/src/routes/monitoring/components/HistoryTab.tsx` — **Phase 71**: Consolidated 7 cards into 4 clean cards; **Phase 72**: Fully rebuilt as a spacious data table with client-side pagination, KPI cards with growth rates, date picker popover.
- `apps/web/src/routes/monitoring/utils/formatting.tsx` — **Phase 72**: Added `getScenarioDescription` and `getTelefunSubmetrics` helpers.

- `apps/api/src/services/ketik-service.ts` — **Phase 66**: `processKetikReviewJob()` now returns `scores` alongside `status` for direct passthrough to API response.
- `apps/api/src/routes/ketik.ts` — **Phase 66**: `POST /review` response now includes `data.scores` when processing completes synchronously.
- `apps/web/src/routes/ketik/index.tsx` — **Phase 66**: Auto-transition progress from `starting`→`processing` after 2s timeout; maps `detail.scores` to session object in `handleViewReview`; non-linear progress curve (2/1.2/0.6/0.2/0.05 per-phase increments).
- `apps/web/src/routes/ketik/components/SessionReviewModal.tsx` — **Phase 66**: Standalone progress bar (removed scaleX button overlay), unified processing/loading UI, delayed message inside progress section, ETA countdown visible; score card UI overhaul — grade-based color coding, mini progress bars, category descriptions, "Tata Tulis" label rename, rubric legend with collapsible details, improved text contrast per UX guidelines.
- `apps/api/src/__tests__/ketik-review-route.test.ts` — **Phase 66**: NEW test verifying scores returned in `POST /review` response with correct shape.
- `apps/web/src/__tests__/ketik-review-progress.test.tsx` — **NEW Phase 66**: 17 regression tests covering progress bar visibility, score display, status text transitions, and action button states.

- `apps/api/src/routes/pdkt.ts` — **Phase 67**: Null-safe auth headers (`authHeader || ""`), ExecutionContext try-catch guard, structured error logging, human error mapper with type narrowing
- `apps/api/src/services/pdkt-service.ts` — **Phase 67**: Error message wrapping in 4 functions (fetchMailboxItems, createMailboxItem, softDeleteMailboxItem, submitMailboxReply)
- `apps/api/src/lib/env.ts` — **Phase 67**: Added `VITE_SUPABASE_ANON_KEY` and `SUPABASE_ANON_KEY` Zod schema validation
- `apps/api/src/lib/supabase.ts` — **Phase 67**: Fixed `createAdminClient()` to use `env.VITE_SUPABASE_ANON_KEY`
- `apps/api/src/__tests__/api-env-bootstrap.test.ts` — **Phase 67**: Anon key env var set/cleanup in Supabase client tests
- `apps/web/src/routes/pdkt/simulation.tsx` — **Phase 67**: Error state UI (AlertCircle + Coba Lagi), success toast on reply, empty scenarios/consumer-type warnings
- `apps/web/src/__tests__/pdkt-mailbox.test.tsx` — **Phase 67**: 5 regression tests for error state rendering, retry refetch, loading state

- `apps/web/src/routes/sidak/input.tsx` — Major refactor: vertical list cards, compact breadcrumb, Estimasi Skor card, Konfigurasi Audit card, Show All toggle, URL param consumption for pre-fill; **Phase 61**: added `activeWeight` state, `handleServiceChange` with 3-fetch (indikator+weights+temuan), `resolveServiceTypeFromTeam`, `categoryMap`, `scoringMode`, leader role guard (`role !== "leader"`), client-side duplicate check, replaced inline form/import/score JSX with component imports
- `apps/web/src/hooks/useAgentDetail.ts` — Fixed `handleInputAudit` to pass `folder` param; rewritten `topTickets` with legacy parity
- `apps/web/src/lib/scoring.ts` — **NEW**: client-side scoring helpers (scoreColor, scoreBg, scoreLabel); **Phase 60**: added `scoreSession()`, `calculateSessionScoreFromTemuan()`, `DEFAULT_SERVICE_WEIGHTS`; **Phase 61**: added `resolveServiceTypeFromTeam()`, `calculateQAScoreFromTemuan()` full version with session grouping/MODE_SAMPLING/mode branching, `NILAI_LABELS`, `NILAI_BADGE_COLORS`
- `apps/web/src/components/sidak/SidakInputScoreCard.tsx` — **NEW Phase 61**: mode-aware score card (weighted→NC/CR split with weight %, flat→flat panel, no_category→BKO panel)
- `apps/web/src/components/sidak/SidakInputManualForm.tsx` — **NEW Phase 61**: legacy-like manual form with subtitle, full-width parameter button, scoringMode pass, 4-col nilai grid, cancel button
- `apps/web/src/components/sidak/SidakInputImportPanel.tsx` — **NEW Phase 61**: legacy-like import panel with tips, file state, card summary, card preview, duplicate banner
- `apps/web/src/components/sidak/TemuanGroupCard.tsx` — **Phase 61**: session number header (gIdx), category chip (Critical/Non-Critical), NILAI_LABELS badge, canEdit prop, legacy-like edit panel
- `apps/web/src/__tests__/sidak-input-parity.test.tsx` — **NEW**: 24 regression tests covering layout, breadcrumb, pre-fill, toggle, cards, scoring
- `apps/web/src/__tests__/sidak-input-legacy-refresh.test.tsx` — **NEW Phase 61**: 20 regression tests for scoring helpers, component contracts, NILAI_LABELS
- `apps/api/src/services/sidak-service.ts` — **Phase 62**: Added parallel `distinctQuery` (SELECT `service_type` WITHOUT `service_type` filter) in `getDashboardData()`, pre-resolved folder names to enable parallel execution, replaced `availableServices` derivation from `auditedAgents` (filtered) with distinct query results intersected with `allowedSvcs`
- `apps/api/src/routes/sidak.ts` — **Phase 62**: Simplified `/ranking` endpoint — replaced manual `availableServices` re-derivation with `dashboardData.availableServices` + leader `allowedServices` intersection; removed unused `VALID_SERVICE_TYPES` import
- `apps/api/src/__tests__/sidak-service-dashboard.test.ts` — **Phase 62**: 4 new regression tests (multi-service distinct, leader scope intersection, empty results, leader scope without serviceTypeLocked)
- `apps/web/src/__tests__/top-tickets-legacy-parity.test.ts` — **NEW Phase 60**: 10 regression tests for scoring modes, tiebreaker, contract
- `apps/api/src/__tests__/sidak-agent-detail-weights.test.ts` — **NEW Phase 60**: 7 regression tests for weights resolution
- `apps/web/src/__tests__/setup.ts` — **Phase 60 fix**: Added `window.scrollTo = vi.fn()` jsdom stub
- `apps/web/src/__tests__/route-guards.test.ts` — **Phase 60 fix**: Replaced `vi.importActual` with `importOriginal` in `@tanstack/react-router` mock factory
- `apps/web/src/routes/sidak/input.tsx` — **Phase 63**: Added `hasBadFindings` computed, `handlePerfectScore` handler, green "Sesi Tanpa Temuan" button with hasBadFindings guard + form/import hide + leader role hide
- `apps/api/src/services/sidak-service.ts` — **Phase 63**: Added `createPerfectScoreSession()` — phantom padding creation with rule version resolution, duplicate guard, and indicator fallback
- `apps/api/src/routes/sidak.ts` — **Phase 63**: Added `POST /temuan/perfect-session` endpoint with RBAC, activity logging, and dashboard summary refresh
- `apps/api/src/__tests__/sidak-service.test.ts` — **Phase 63**: 4 regression tests for `createPerfectScoreSession`
- `apps/web/src/__tests__/sidak-input-legacy-refresh.test.tsx` — **Phase 63**: 7 regression tests for hasBadFindings logic + component contract

- `apps/web/src/hooks/useCrudForm.ts` — **Phase 86**: Added `createItem`/`updateItem` factories, `isEqual` comparator, `shallowEqualDraft` default
- `apps/web/src/hooks/useCollectionDraft.ts` — **Phase 86**: Replaced `idPrefix`/`extraDefaults` with `create` factory, removed `as T` assertions
- `apps/web/src/routes/telefun/telefunSettings.ts` — **Phase 86**: Added `TelefunTransport` type alias + `TelefunVoiceModel` interface, typed `VOICE_MODELS`
- `apps/web/src/routes/telefun/components/settings/useTelefunSettingsDraft.ts` — **Phase 86**: Added `createItem` to useCrudForm calls
- `apps/web/src/routes/telefun/components/settings/TelefunConsumersTab.tsx` — **Phase 86**: Typed `setLocalSettings`, `create` factory in applyCollectionDraft, removed `as any`
- `apps/web/src/routes/telefun/components/settings/TelefunScenariosTab.tsx` — **Phase 86**: Typed `setLocalSettings`, `create` factory in applyCollectionDraft
- `apps/web/src/routes/ketik/components/settings/useKetikSettingsDraft.ts` — **Phase 86**: Added `createItem` to 3 useCrudForm calls
- `apps/web/src/routes/ketik/components/settings/KetikConsumersTab.tsx` — **Phase 86**: Typed `setLocalSettings`, `create` factory, removed `as any`
- `apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx` — **Phase 86**: Typed `setLocalSettings`, `create` factory, removed `as any`
- `apps/web/src/routes/pdkt/components/settings/usePdktSettingsDraft.ts` — **Phase 86**: Added `createItem` to 2 useCrudForm calls
- `apps/web/src/routes/pdkt/components/settings/PdktConsumersTab.tsx` — **Phase 86**: Typed `setLocalSettings`, `create` factory, removed `as any`
- `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx` — **Phase 86**: Typed `setLocalSettings`, `create` factory, removed `as any`
- `apps/web/src/routes/pdkt/components/settings/PdktIdentityTab.tsx` — **Phase 86**: Added `ConsumerNameMentionPattern` type, removed `as any`
- `apps/web/src/__tests__/settings-draft-helpers.test.ts` — **Phase 86**: Updated to use `create` factory pattern
- `apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx` — **Phase 87**: Scenario script toggle clears draft script when disabled to prevent stale saves
- `apps/web/src/routes/telefun/components/settings/TelefunScenariosTab.tsx` — **Phase 87**: Scenario script toggle clears draft script when disabled to prevent stale saves
- `apps/web/src/__tests__/telefun-settings-model-default.test.ts` — **Phase 87**: Updated test assertions to use `DEFAULT_TELEFUN_SETTINGS` constants instead of hardcoded values
- `docs/rebuild-logs/phase-87-settings-draft-canonical-commit.md` — **NEW Phase 87**: Documentation for settings draft canonical commit refactor
- `apps/web/src/routes/ketik/components/settings/ketikDraftNormalizers.ts` — **NEW Phase 88**: KETIK draft normalizers (scenario, consumer, quick template)
- `apps/web/src/routes/pdkt/components/settings/pdktDraftNormalizers.ts` — **NEW Phase 88**: PDKT draft normalizers (scenario, consumer)
- `apps/web/src/routes/telefun/components/settings/telefunDraftNormalizers.ts` — **NEW Phase 88**: Telefun draft normalizers (scenario, consumer)
- `apps/web/src/__tests__/settings-draft-normalizers.test.ts` — **NEW Phase 88**: 5 test cases covering all 7 normalizer functions across 3 domains
- `apps/web/src/routes/telefun/telefunSettings.ts` — **Phase 88**: Hardened persisted settings parser with item-level validation for `scenarios` and `consumerTypes`
- `apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx` — **Phase 88**: Replaced inline default entity logic with `normalizeKetikScenarioDraft`
- `apps/web/src/routes/ketik/components/settings/KetikConsumersTab.tsx` — **Phase 88**: Replaced inline default entity logic with `normalizeKetikConsumerDraft`
- `apps/web/src/routes/ketik/components/settings/KetikTemplateTab.tsx` — **Phase 88**: Replaced inline default entity logic with `normalizeKetikQuickTemplateDraft`
- `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx` — **Phase 88**: Replaced inline default entity logic with `normalizePdktScenarioDraft`
- `apps/web/src/routes/pdkt/components/settings/PdktConsumersTab.tsx` — **Phase 88**: Replaced inline default entity logic with `normalizePdktConsumerDraft`
- `apps/web/src/routes/telefun/components/settings/TelefunScenariosTab.tsx` — **Phase 88**: Replaced inline default entity logic with `normalizeTelefunScenarioDraft`
- `apps/web/src/routes/telefun/components/settings/TelefunConsumersTab.tsx` — **Phase 88**: Replaced inline default entity logic with `normalizeTelefunConsumerDraft`
- `docs/rebuild-logs/phase-88-settings-draft-normalization-hardening.md` — **NEW Phase 88**: Documentation for settings draft normalization hardening
- `package.json` — **Phase 89**: Updated `packageManager` from `pnpm@9.0.0` to `pnpm@11.5.0`
- `pnpm-workspace.yaml` — **Phase 89**: Added `allowBuilds` block for 5 packages (`@google/genai`, `core-js`, `ecc-universal`, `esbuild`, `protobufjs`)
- `docs/rebuild-logs/phase-89-pnpm-11-migration.md` — **NEW Phase 89**: Documentation for pnpm 11 migration with breaking changes
- `apps/api/src/routes/ai.ts` — **Phase 91**: `/ai/usage/summary` returns `breakdown: { simulation, review, uncategorized }` per-category stats with `resolveUsageCategory()` classifier
- `apps/web/src/lib/usage-snapshot.ts` — **Phase 91**: Added `UsageBreakdown`/`UsageBreakdownItem` types, `emptyUsageBreakdown()` helper, `computeUsageDelta()` extended with per-category delta + `inputTokens`/`outputTokens` fields
- `apps/web/src/lib/usage-summary.ts` — **NEW Phase 91**: Shared `fetchUsageSummary(module)` helper normalizing API response to `UsageSnapshot` with safe defaults
- `apps/web/src/components/UsageModal.tsx` — **Phase 91**: Upgraded with `UsageBreakdownRows` component (3-category icon+cost+token+call rows), per-category session delta display, `fetchUsageSummary` integration
- `apps/web/src/routes/ketik/index.tsx` — **Phase 91**: Replaced inline `ketikApi.getUsageSummary()` mapping with shared `fetchUsageSummary("ketik")`, baseline captures full snapshot, post-session toast shows simulation/review split
- `apps/web/src/routes/pdkt/index.tsx` — **Phase 91**: Removed local `fetchPdktSummary` adapter, uses shared `fetchUsageSummary("pdkt")`, IDR-formatted toast breakdown
- `apps/web/src/routes/telefun/index.tsx` — **Phase 91**: Replaced inline `getApi` mapping with shared `fetchUsageSummary("telefun")`, IDR-formatted post-call toast with category split
- `apps/web/src/__tests__/usage-summary.test.ts` — **NEW Phase 91**: 3 tests (old shape normalization, new shape pass-through, fetch error returns null)
- `apps/api/src/__tests__/ai-usage-summary-breakdown.test.ts` — **Phase 91**: +1 regression test verifying `breakdown` field with simulation/review detailed stats
- `apps/web/src/__tests__/usage-modal-breakdown.test.tsx` — **Phase 91**: Updated to mock `fetchUsageSummary`, removed `getApi` import, added `emptyUsageBreakdown()` shape, `getAllByText` for multiple matches
- `apps/web/src/__tests__/usage-snapshot.test.ts` — **Phase 91**: Changed `toEqual` to `toMatchObject` to accommodate new breakdown + input/output token fields
- `apps/web/src/__tests__/ketik-landing.test.tsx` & `pdkt-landing.test.tsx` — **Phase 91**: Added `vi.mock("../lib/usage-summary")` mocks
- `docs/database.md` — **Phase 91**: Documented category breakdown in Monitoring AI Usage section
- `docs/rebuild-logs/phase-91-ai-usage-post-session-breakdown.md` — **NEW Phase 91**: Documentation for category breakdown + shared helper pattern
- `apps/api/src/services/pdkt-template-resolver.ts` — **NEW Phase 92**: Centralized placeholder resolver with split `CONSUMER_PLACEHOLDER_PATTERNS` / `COMPANY_PLACEHOLDER_PATTERNS`, generic `ANY_PLACEHOLDER_PATTERN`, and `sanitizePdktTemplateText` for subject+body
- `apps/api/src/services/pdkt-company-names.ts` — **NEW Phase 92**: Shared source of truth for licensed (Perbankan/Asuransi) and fictive unlicensed company name pools
- `apps/api/src/services/pdkt-service.ts` — **Phase 92**: `generateScenarioEmailTemplate()` now retries once when placeholders OR word count miss the bar (combined hints), returns `leftoverPlaceholders` in success path, and fails closed if placeholders still remain after retry
- `apps/api/src/__tests__/pdkt-template-resolver.test.ts` — **NEW Phase 92**: Resolver regression tests for company aliases, consumer aliases, and subject sanitization
- `apps/api/src/__tests__/pdkt.test.ts` — **Phase 92**: Added bracket consumer alias replacement test
- `apps/web/src/routes/ketik/ketikIdentity.ts` — **NEW Phase 92**: Extracted pure `resolveKetikSessionIdentity` helper from `index.tsx` for empty-settings fallback
- `apps/web/src/__tests__/ketik-identity.test.ts` — **NEW Phase 92**: Unit tests for `resolveKetikSessionIdentity`
- `apps/web/src/__tests__/telefun-settings-model-default.test.ts` — **Phase 92**: Regression tests for `resolveFinalIdentity` fallback
- `docs/rebuild-logs/phase-92-identity-company-context-fallback.md` — **NEW Phase 92**: Documentation for identity/company context fallback (initial pass + follow-up)
- `apps/api/src/services/pdkt-email-policy.ts` — **NEW Phase 93**: Centralized PDKT prompt policy module (mention patterns, realistic style, compliance validators)
- `apps/web/src/routes/pdkt/components/SettingsModal.tsx` — **Phase 94**: Visual polish (overlay, animations, header bar, tab strip, cursor-pointer)
- `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx` — **Phase 94**: Compact control bar, smaller checkboxes, consistent card styling, "Lampiran" label
- `apps/web/src/routes/pdkt/components/settings/PdktConsumersTab.tsx` — **Phase 94**: Left-border accent banner, reduced grid gap, consistent active/inactive card states
- `apps/web/src/routes/pdkt/components/settings/PdktIdentityTab.tsx` — **Phase 94**: Compact banner pattern, tighter input spacing, cleaner label typography
- `apps/web/src/routes/pdkt/components/settings/PdktSystemTab.tsx` — **Phase 94**: Consistent left-border header, compact writing-style and model selection cards
- `docs/rebuild-logs/phase-93-pdkt-consumer-name-realistic-mode.md` — **NEW Phase 93**: Documentation for consumer name and realistic mode hardening
- `docs/rebuild-logs/phase-94-pdkt-settings-visual-polish.md` — **NEW Phase 94**: Documentation for PDKT settings visual polish
- `apps/web/src/routes/profiler/components/slides/SlideModeControls.tsx` — **Phase 113**: Renamed "Original" → "Landscape" ("Versi Landscape"), "Opsi 2" → "Portrait" ("Portrait A4")
- `apps/web/src/routes/profiler/components/slides/ParticipantSlide.tsx` — **Phase 113**: Changed subtitle from "Opsi 2 · Portrait A4" to "Portrait A4"
- `docs/rebuild-logs/phase-113-profiler-slides-label-fix.md` — **NEW Phase 113**: Documentation for profiler slides label fix
- `packages/types/src/telefun-communication-profile.ts` — **NEW Phase 114**: Canonical shared communication profile builder (benchmark defaults, status evaluation, value builders)
- `packages/types/src/index.ts` — **Phase 114**: Added export for `telefun-communication-profile`
- `apps/web/src/routes/telefun/telefunSettings.ts` — **Phase 114**: Gender-first identity resolver (`pickIdentityProfileForGender()`, Kore→male voice auto-normalize)
- `apps/web/src/routes/telefun/services/geminiService.ts` — **Phase 114**: Orchestrator removed from live path, simplified `SessionMetrics`, extracted PCM conversion
- `apps/web/src/routes/telefun/services/liveProtocol.ts` — **Phase 114**: Added `float32ToPcm16Buffer()` helper for audio encoding
- `apps/web/src/routes/telefun/services/promptBuilder.ts` — **Phase 114**: Added SILENT HANDLING section with non-aggressive rules for realistic mode
- `apps/web/src/routes/telefun/components/VoiceRadarChart.tsx` — **Phase 114**: Explicit `userValue`/`targetValue` data keys, `buildVoiceRadarData()` helper, `ResizeObserver` dimension guard
- `apps/web/src/lib/voiceAssessmentUtils.ts` — **Phase 114**: Delegates `getCommunicationProfileFromAssessment()` to shared helper, removed duplicate benchmark defaults
- `apps/api/src/lib/telefun-communication-profile.ts` — **Phase 114**: Re-export from shared `@trainers/types` helper (294→5 lines)
- `apps/web/src/__tests__/telefun-settings-model-default.test.ts` — **Phase 114**: Added 4 identity gender-first characterization tests
- `apps/web/src/__tests__/telefun-prompt-builder.test.ts` — **Phase 114**: Added 2 silent handling prompt tests
- `apps/web/src/__tests__/telefun-live-protocol.test.ts` — **Phase 114**: Added 3 audio encoding tests (PCM16, clamping, base64 roundtrip)
- `apps/telefun/src/server-protocol.test.ts` — **Phase 114**: Added realtimeInput.audio forwardable message test
- `apps/web/src/__tests__/telefun-communication-profile.test.tsx` — **Phase 114**: Added 2 `buildVoiceRadarData` helper tests
- `docs/rebuild-logs/phase-114-telefun-live-audio-radar-identity-fix.md` — **NEW Phase 114**: Documentation for Telefun live audio, orchestrator, radar, dan identity fix
- `apps/api/src/services/ketik/consumer-response.ts` — **Phase 115**: Added `[NO_RESPONSE]` stripping in `sanitizeConsumerText()`, exported function for testing
- `apps/web/src/routes/ketik/lib/message-utils.ts` — **Phase 115**: Added `NO_RESPONSE_PATTERN_GLOBAL` constant
- `apps/web/src/routes/ketik/components/ChatInterface.tsx` — **Phase 115**: Frontend guard strips `[NO_RESPONSE]` from responseText before display check
- `apps/api/src/__tests__/ketik-consumer-response.test.ts` — **NEW Phase 115**: 9 unit tests for sanitizeConsumerText [NO_RESPONSE] stripping
- `apps/web/src/__tests__/ketik-chat-interface-structure.test.ts` — **Phase 115**: Added 6 pattern tests for NO_RESPONSE_PATTERN_GLOBAL
- `docs/rebuild-logs/phase-115-ketik-no-response-tag-fix.md` — **NEW Phase 115**: Documentation for KETIK NO_RESPONSE tag leak fix
- `supabase/migrations/20260614090000_sidak_dashboard_forecast_snapshots.sql` — **NEW Phase 198**: Migration creating `sidak_dashboard_forecast_snapshots` table (SHA-256 filter_key + data_fingerprint, horizon_months, JSONB payload, RLS locked to service_role)
- `apps/api/src/routes/sidak/dashboard.ts` — **Phase 198**: Added `POST /dashboard/forecast` endpoint with `cacheOnly`/`forceRefresh` modes, leader scope injection, SHA-256 fingerprinting, linear regression + Gemini 3.1 Flash Lite narrative generation
- `apps/api/src/services/sidak-service.ts` — **Phase 198**: Added `sidak-dashboard-forecast-service.ts` barrel export for forecast logic
- `apps/web/src/components/sidak/ForecastActionButton.tsx` — **NEW Phase 198**: 4-state action button (missing/fresh/stale/loading) with pulse animation on stale, compact prop, motion-reduce support
- `apps/web/src/components/sidak/ForecastInsightPanel.tsx` — **NEW Phase 198**: AI insight panel with header, 3 metric cards (trend direction, projected change, method), parsed narrative body, Gemini-unavailable fallback
- `apps/web/src/components/sidak/forecast-insight-parser.ts` — **NEW Phase 198**: Split narrative text by `###` headings into sections (summary, parameters, actions, disclaimer, generic)
- `apps/web/src/components/sidak/ParamTrendChart.tsx` — **Phase 198**: Dashed forecast line (`strokeDasharray="5 5"`) for visible parameter or Total Temuan, anchor point at last actual, "Prediksi" tooltip badge
- `apps/web/src/routes/sidak/dashboard.tsx` — **Phase 198**: Integrated forecast lifecycle (cacheOnly lookup on mount, state management: missing/fresh/stale, insight panel gating, action button wiring)
- `apps/web/src/components/sidak/ParetoImprovementInsight.tsx` — **Phase 198**: RCA-based top-3 focus parameters with share percentage, single-dominant vs multi-parameter copy
- `docs/rebuild-logs/phase-131-sidak-dashboard-batch-forecast-persistence.md` — **NEW Phase 131**: Documentation for batch forecast persistence (single Gemini call, deterministic linear regression, cache-only lookup)
- `docs/rebuild-logs/phase-198-sidak-forecast-stale-attention.md` — **NEW Phase 198**: Documentation for stale attention & persistence hardening (3-state lifecycle, SHA-256 fingerprinting, visual attention effects)
- `apps/api/src/__tests__/sidak-dashboard-forecast.test.ts` — **NEW Phase 198**: 20 API unit tests for forecast generation, cache hit/miss, stale detection, fingerprint changes
- `apps/api/src/__tests__/sidak-dashboard-forecast-migration.test.ts` — **NEW Phase 198**: Migration contract tests (table structure, unique constraint, RLS, grants)
- `apps/api/src/__tests__/sidak-dashboard-forecast-route.test.ts` — **NEW Phase 198**: Route integration tests (role guard, validation, error mapping, leader scope)
- `apps/web/src/__tests__/forecast-action-button.test.tsx` — **NEW Phase 198**: 16 frontend tests for button states (missing/fresh/stale/loading/disabled/compact/motion-reduce)
- `apps/web/src/__tests__/sidak-dashboard-forecast-state.test.tsx` — **NEW Phase 198**: 167+ lines of state machine tests (stale detection, filter change, reload guard)
- `apps/web/src/__tests__/forecast-insight-panel.test.tsx` — **NEW Phase 198**: Component tests for insight panel rendering, parsed sections, Gemini-unavailable fallback

## Relevant Files

- `opencode.json` — project-level opencode config with context7 MCP
- `supabase/migrations/` — DB schemas (001 SIDAK, 002 KETIK/PDKT/AI, 003 Telefun, 004 Admin Core, 009 Storage RLS, 010 Activity Logs Index, **017 MV hardening**, **20260526090000 MV terminal re-hardening**, **20260605100000 atomic monitoring history delete**, **20260614090000 sidak dashboard forecast snapshots**)
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
- `apps/web/src/components/sidak/ForecastActionButton.tsx` — 4-state forecast button (missing/fresh/stale/loading) with pulse stale animation
- `apps/web/src/components/sidak/ForecastInsightPanel.tsx` — AI insight panel with metric cards and parsed narrative
- `apps/web/src/components/sidak/ParamTrendChart.tsx` — Dashed forecast line integration
- `apps/web/src/components/sidak/ParetoImprovementInsight.tsx` — RCA-based top-3 improvement parameters
- `apps/web/src/components/sidak/forecast-insight-parser.ts` — Narrative text splitter by `###` headings
- `supabase/migrations/20260614090000_sidak_dashboard_forecast_snapshots.sql` — Forecast snapshot table migration
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
- `docs/rebuild-logs/` — per-phase completion logs (phase-1 through phase-192)
- `docs/deployment.md` — full deployment guide with Railway settings, env vars, and troubleshooting
- `docs/rebuild-logs/phase-70-monitoring-telefun-history-schema-fix.md` — **Phase 70**: Telefun history schema fix documentation
- `apps/api/src/__tests__/monitoring-history-service.test.ts` — **NEW Phase 70**: 5 regression tests verifying correct Vite schema column usage in Telefun query
- `apps/api/src/__tests__/monitoring-history-enrichment.test.ts` — **Phase 70 update**: Mock data aligned to Vite schema columns
- `apps/api/src/services/monitoring-history-delete-service.ts` — **Phase 185**: Typed service wrapper for atomic monitoring history delete via PostgreSQL RPC
- `apps/api/src/__tests__/monitoring-history-delete-migration.test.ts` — **Phase 185**: Migration contract tests (RPC definition, security, FK cascades)
- `apps/api/src/__tests__/monitoring-history-delete-service.test.ts` — **Phase 185**: Service unit tests (success, NOT_FOUND, DELETE_FAILED, malformed payload)
- `apps/api/src/__tests__/monitoring-history-delete-route.test.ts` — **Phase 185**: Route integration tests (role guard, validation, error mapping)
- `apps/api/src/services/sidak/` — **Phase 75**: SIDAK service decomposition into 13 sub-modules (shared-constants, access-scope, period-indicator, temuan-service, agent-directory, rule-versions, service-trends, dashboard-data, dashboard-aggregation, dashboard-trends, dashboard-types, report-data, report-archives)
- `apps/api/src/services/sidak-ranking-service.ts` — **Phase 75**: Extracted ranking service from sidak-service.ts
- `apps/api/src/lib/math-utils.ts` — **Phase 75**: Shared `roundTo()` extracted from dashboard-trends
- `apps/api/src/__tests__/sidak-ranking-service.test.ts` — **Phase 75**: 2 tests for ranking service
- `apps/api/src/__tests__/sidak-decomposition-structural.test.ts` — **Phase 75**: 4 structural tests (barrel completeness, barrel purity, import hygiene, roundTo equivalence)
- `apps/web/src/routes/telefun/telefunApi.ts` — **NEW Phase 75**: Telefun API adapter replacing raw `fetch()`
- `apps/web/src/__tests__/telefun-api-adapter.test.ts` — **NEW Phase 75**: 3 tests for telefun API adapter
- `packages/types/src/ai-models.ts` — **NEW Phase 75**: Shared AI model registry
- `apps/web/src/lib/aiModels.ts` — **NEW Phase 75**: Frontend model list helper
- `apps/web/src/routes/ketik/components/settings/` — **NEW Phase 75**: KETIK settings decomposition (KetikSystemTab, useKetikSettingsDraft)
- `apps/web/src/routes/pdkt/components/settings/` — **NEW Phase 75**: PDKT settings decomposition (PdktSystemTab, usePdktSettingsDraft)
- `apps/web/src/__tests__/ketik-settings-modal.test.tsx` — **NEW Phase 75**: 4 tests for KETIK settings modal
- `apps/web/src/__tests__/pdkt-settings-modal.test.tsx` — **NEW Phase 75**: 4 tests for PDKT settings modal
- `apps/api/src/routes/telefun.ts` — **Phase 75 fix**: Recording endpoint response contract `{ success, data: { url }, url }` for fetchApi unwrap + backward compat
- `apps/web/src/routes/telefun/components/ReviewModal.tsx` — **Phase 75 fix**: Reading recording URL from unwrapped `json.url`
- `apps/web/src/routes/telefun/components/HistoryModal.tsx` — **Phase 75 fix**: Reading recording URL from unwrapped `json.url`
- `apps/web/src/routes/telefun/replay.tsx` — **Phase 75 fix**: Reading recording URL from unwrapped `json.url`
- `docs/rebuild-logs/phase-75-maintainability-refactor.md` — **NEW Phase 75**: Documentation for maintainability refactor
- `apps/api/src/services/sidak/ai-report-service.ts` — **NEW Phase 78**: Extracted AI report generation (generateAiReport, aiReportSchema) from sidak.ts route
- `apps/api/src/services/sidak/access-scope.ts` — **Phase 78**: Added getAllFolders() and getAgentsByFolder() extracted from sidak.ts route
- `apps/api/src/routes/sidak.ts` — **Phase 78**: Replaced ~150 lines of inline AI report/folders/agents logic with delegated service calls
- `apps/api/src/__tests__/sidak-service.test.ts` — **Phase 78**: Added gemini/openrouter mocks + AI report/folders/agents tests
- `apps/api/src/__tests__/sidak-decomposition-structural.test.ts` — **Phase 78**: Updated expected exports list with generateAiReport, aiReportSchema, getAllFolders, getAgentsByFolder
- `docs/rebuild-logs/phase-78-sidak-route-extraction.md` — **NEW Phase 78**: Documentation for AI report + folders/agents route extraction
- `apps/api/src/routes/sidak/` — **Phase 79**: Full SIDAK route decomposition into 5 sub-modules (core.ts 161 lines, dashboard.ts 343 lines, temuan.ts 200 lines, rule-versions.ts 405 lines, reports.ts 447 lines)
- `apps/api/src/routes/telefun/` — **Phase 80**: Full Telefun route decomposition into 4 sub-modules (sessions.ts 377 lines, recordings.ts 284 lines, settings.ts 144 lines, annotations.ts 468 lines)
- `apps/api/src/routes/sidak.ts` — **Phase 79**: Reduced from 1,503 to 19 lines — only import + route registration + export
- `apps/api/src/routes/telefun.ts` — **Phase 80**: Reduced from 1,240 to 21 lines — only import + route registration + export + backward compat re-exports
- `docs/rebuild-logs/phase-79-sidak-route-decomposition.md` — **NEW Phase 79**: Documentation for SIDAK route full decomposition
- `docs/rebuild-logs/phase-80-telefun-route-decomposition.md` — **NEW Phase 80**: Documentation for Telefun route full decomposition
- `apps/web/src/routes/ketik/components/ChatInterface.tsx` — **Phase 81**: Reduced from 277 to 16 lines (import + JSX), inline constants/helpers extracted to ketik/lib/
- `apps/web/src/routes/ketik/lib/message-utils.ts` — **NEW Phase 81**: Extracted message normalization, image tag, system tag, and allowSolutionAcknowledgement utilities (193 lines)
- `apps/web/src/routes/ketik/lib/pacing.ts` — **NEW Phase 81**: Extracted session timing, text band classification, and pacing ranges (69 lines)
- `docs/rebuild-logs/phase-81-ketik-chatinterface-extraction.md` — **NEW Phase 81**: Documentation for KETIK ChatInterface extraction
- `apps/api/src/services/ketik-service.ts` — **Phase 82**: Reduced from 1,400 to 5 lines — barrel file re-exporting 5 sub-modules
- `apps/api/src/services/ketik/shared-utils.ts` — **NEW Phase 82**: `extractJsonObjectText()` utility (9 lines)
- `apps/api/src/services/ketik/consumer-response.ts` — **NEW Phase 82**: Scenario defaults, consumer response generation (347 lines)
- `apps/api/src/services/ketik/review-lifecycle.ts` — **NEW Phase 82**: `triggerKetikAIReview()` lifecycle (317 lines)
- `apps/api/src/services/ketik/review-processor.ts` — **NEW Phase 82**: `processKetikReviewJob()` with AI scoring (353 lines)
- `apps/api/src/services/ketik/settings-history.ts` — **NEW Phase 82**: Session CRUD, settings history (369 lines)
- `apps/web/src/hooks/useCrudForm.ts` — **NEW Phase 83**: Shared generic CRUD form hook (87 lines) with openAdd/openEdit/close, save/remove, isDirty/isValid
- `apps/web/src/routes/telefun/components/SettingsModal.tsx` — **Phase 83**: Reduced from 1,232 to 78 lines — barrel component for tab routing
- `apps/web/src/routes/telefun/components/settings/TelefunScenariosTab.tsx` — **NEW Phase 83**: Scenarios CRUD tab (16.8K)
- `apps/web/src/routes/telefun/components/settings/TelefunConsumersTab.tsx` — **NEW Phase 83**: Consumers CRUD tab (11.2K)
- `apps/web/src/routes/telefun/components/settings/TelefunIdentityTab.tsx` — **NEW Phase 83**: Identity settings tab (6.8K)
- `apps/web/src/routes/telefun/components/settings/TelefunSystemTab.tsx` — **NEW Phase 83**: System/model settings tab (14.3K)
- `apps/web/src/routes/ketik/components/SettingsModal.tsx` — **Phase 83**: Reduced from 915 to 58 lines — barrel component for tab routing
- `apps/web/src/routes/ketik/components/settings/KetikScenariosTab.tsx` — **NEW Phase 83**: Scenarios CRUD tab (20.8K)
- `apps/web/src/routes/ketik/components/settings/KetikConsumersTab.tsx` — **NEW Phase 83**: Consumers CRUD tab (11.2K)
- `apps/web/src/routes/ketik/components/settings/KetikIdentityTab.tsx` — **NEW Phase 83**: Identity settings tab (4.3K)
- `apps/web/src/routes/ketik/components/settings/KetikTemplateTab.tsx` — **NEW Phase 83**: Template CRUD tab (8.3K)
- `apps/web/src/routes/pdkt/components/SettingsModal.tsx` — **Phase 83**: Reduced from 976 to 63 lines — barrel component for tab routing
- `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx` — **NEW Phase 83**: Scenarios CRUD tab (28.7K)
- `apps/web/src/routes/pdkt/components/settings/PdktConsumersTab.tsx` — **NEW Phase 83**: Consumers CRUD tab (14.0K)
- `apps/web/src/routes/pdkt/components/settings/PdktIdentityTab.tsx` — **NEW Phase 83**: Identity settings tab (7.7K)
- `docs/rebuild-logs/phase-83-settings-modal-decomposition.md` — **NEW Phase 83**: Documentation for settings modal decomposition
- `apps/web/src/routes/sidak/hooks/useTemuanEdit.ts` — **NEW Phase 84**: Edit/delete state + save handler for temuan (106 lines)
- `apps/web/src/routes/sidak/hooks/useTemuanForm.ts` — **NEW Phase 84**: Manual form entries, validation, duplicate check, batch save, perfect score (217 lines)
- `apps/web/src/routes/sidak/hooks/useTemuanImport.ts` — **NEW Phase 84**: Excel template download, file parse, import save with duplicate/preview (327 lines)
- `apps/web/src/routes/sidak/input.tsx` — **Phase 84**: Reduced from 767 to 274 lines — delegates to extracted hooks useTemuanEdit/useTemuanForm/useTemuanImport
- `docs/rebuild-logs/phase-84-sidak-input-hooks-decomposition.md` — **NEW Phase 84**: Documentation for SIDAK input hooks decomposition

- `apps/api/src/services/pdkt/image-generation.ts` — **NEW Phase 95**: Decoupled image generation service with provider-agnostic fallback, auto-fallback to supported image model if active simulation model lacks image capability; added `normalizeAttachments()` helper with `MAX_ATTACHMENTS=3` and `MAX_DATA_URI_LENGTH=650_000` guard
- `apps/api/src/lib/gemini.ts` — **Phase 95**: Added `resolveResponseImages()` parser for `inlineData` and `responseModalities` config support; updated return contract to include `images` field
- `apps/api/src/lib/openrouter.ts` — **Phase 95**: Added `modalities: ["image"]` support and `normalizeOpenRouterImages()` parser for `message.images`; updated return contract with `images` field
- `packages/types/src/ai-models.ts` — **Phase 95**: Added `AiModelCapabilities` interface with `supportsImage`/`imageGenerationMode` metadata; tagged Gemini and OpenRouter multimodal models; exported `DEFAULT_IMAGE_GENERATION_MODEL_ID`; added `TEXT_MODELS` and `IMAGE_GENERATION_MODELS` pre-filtered arrays
- `packages/types/src/pdkt.ts` — **Phase 95**: Added `attachmentSource` metadata field (`"manual" | "ai" | "none"`)
- `apps/api/src/lib/ai-models.ts` — **Phase 95**: Added `supportsImageGeneration()` and `getImageGenerationMode()` helpers; exported `DEFAULT_IMAGE_GENERATION_MODEL_ID`; `TEXT_SIMULATION_MODELS`/`DIRECT_GEMINI_MODELS` now use `TEXT_MODELS` instead of filtering `AI_MODELS`; `supportsImageGeneration`/`getImageGenerationMode` query `IMAGE_GENERATION_MODELS` directly
- `apps/api/src/services/pdkt-service.ts` — **Phase 95**: Refactored `initializeEmailSession` to orchestrate: generate email → resolve attachment policy (Manual > AI > None) → generate AI images → final message; graceful fallback if image generation fails; added `resolvePdktGenerationConfig()` to centralize scenario/consumerType/config resolution and reduce route duplication
- `apps/api/src/routes/pdkt.ts` — **Phase 95**: Added `POST /session/init` unified endpoint returning ready-to-use inbound message; simplified frontend start-session flow; added `POST /session/create` endpoint with `client_request_id` idempotency support, delegating mailbox session creation to `mailbox-session.ts`; extracted `resolvePdktGenerationConfig()` to eliminate inline config duplication
- `apps/web/src/routes/pdkt/simulation.tsx` — **Phase 95**: Simplified to consume backend init endpoint; removed inline template generation and inbound email crafting logic; streamlined to single `POST /session/create` call
- `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx` — **Phase 95**: Added explanatory microcopy under AI toggle about manual attachment priority
- `docs/rebuild-logs/phase-95-pdkt-ai-image-generation.md` — **NEW Phase 95**: Documentation for PDKT AI Image Generation remediation
- `apps/api/src/__tests__/pdkt-image-generation.test.ts` — **NEW Phase 95**: 4 API tests verifying attachment policy, toggle off behavior, and failure safety
- `apps/api/src/__tests__/pdkt-session-create-route.test.ts` — **NEW Phase 95**: Tests for `POST /session/create` route with `client_request_id` idempotency
- `apps/web/src/__tests__/pdkt-ai-image-rendering.test.tsx` — **NEW Phase 95**: 1 web test verifying AI attachment rendering in EmailDetailPane
- `apps/api/src/lib/ai-json.ts` — **NEW Phase 95**: Robust JSON parsing library with iterative brace-matching algorithm, replacing fragile regex parsing across all AI services
- `apps/api/src/services/pdkt/mailbox-session.ts` — **NEW Phase 95**: Boundary service for mailbox session create+persist, extracted from route handler for maintainability
- `apps/web/src/routes/pdkt/components/settings/SettingsPrimitives.tsx` — **NEW Phase 95**: Shared settings UI primitives (`SettingsField`, `SettingsInput`, `SettingsSelect`, `SettingsCardOption`) used by PdktConsumersTab, PdktIdentityTab, PdktScenariosTab
- `apps/api/src/lib/telefun-analysis.ts` — **Phase 95**: Replaced `JSON.parse` with `parseJsonFromModelText` for robust analysis parsing
- `apps/api/src/services/ketik/shared-utils.ts` — **Phase 95**: Replaced inline fragile JSON extraction with `extractJsonObjectText` from ai-json.ts
- `apps/api/src/services/pdkt-service.ts` — **Phase 95**: Removed inline `parseJsonFromModelText`, delegates to shared ai-json.ts
- `apps/api/src/services/sidak/ai-report-service.ts` — **Phase 95**: Replaced fragile regex cleaning with `parseJsonFromModelText`

- `apps/api/src/routes/pdkt.ts` — **Phase 96**: Reduced 723→8 lines — barrel re-export from `./pdkt/index`
- `apps/api/src/services/pdkt-service.ts` — **Phase 96**: Reduced 980→15 lines — barrel re-exporting 5 sub-modules + `parseJsonFromModelText`
- `apps/api/src/routes/pdkt/` — **Phase 96**: Full route decomposition into 6 sub-modules (index, simulation, mailbox, history, settings, route-utils) covering 16 route handlers
- `apps/api/src/services/pdkt/` — **Phase 96**: Service decomposition into 7 modules total — new: catalog-service (scenarios/consumerTypes/identity), session-service (template/init/config), evaluation-service (agent eval + background worker), mailbox-service (RPC wrappers), shared-utils (callAI + transient detection + subject norm); retained from Phase 95: image-generation (multimodal), mailbox-session (orchestrator)
- `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx` — **Phase 96**: Reduced 467→263 lines — delegates to 5 sub-components under `scenarios/`
- `apps/web/src/routes/pdkt/components/settings/scenarios/` — **NEW Phase 96**: 5 sub-components — `ScenarioList.tsx` (187), `ScenarioForm.tsx` (172), `ScenarioAttachments.tsx` (62), `ScenarioAIGenerator.tsx` (36), `ScenarioTemplateField.tsx` (71)
- `apps/api/src/__tests__/pdkt.test.ts` — **Phase 96**: Updated mockSupabase type-cast to `Parameters<typeof pdktService.fetchMailboxItems>[0]` after `SupabaseClient` strict typing
- `docs/rebuild-logs/phase-96-pdkt-full-decomposition.md` — **NEW Phase 96**: Documentation for PDKT full route + service + frontend decomposition
- `apps/api/src/services/pdkt-email-policy.ts` — **Phase 97**: Added `NameClueTemplate` system with 11 natural context clue templates, `getPdktMentionName()`, `getPdktForbiddenBodyNames()`, `pickNameClueTemplate()` with deterministic seed-based indexing, forbidden name leakage detection, and generic intro phrase compliance validation
- `apps/api/src/services/pdkt/image-generation.ts` — **Phase 97**: Added `PdktImageGenerationDiagnostics` and `PdktImageGenerationResult` types with structured error diagnostics, fallback model resolution, manual attachment guard, and provider-specific error handling
- `apps/api/src/services/pdkt/session-service.ts` — **Phase 97**: Added `attachmentWarning` passthrough in session init response
- `packages/types/src/pdkt.ts` — **Phase 97**: Added `attachmentWarning` optional field to `emailMessageSchema`
- `apps/web/src/routes/pdkt/components/EmailDetailPane.tsx` — **Phase 97**: Renders amber AlertCard with warning message when `attachmentWarning` is present and no attachments exist
- `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioAttachments.tsx` — **Phase 97**: Fixed `React.RefObject<HTMLInputElement | null>` type
- `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioForm.tsx` — **Phase 97**: Fixed `useCrudForm` import path
- `apps/api/src/__tests__/pdkt-email-policy.test.ts` — **Phase 97**: Added bodyName leakage test, natural middle clue placement test, updated upfront expectation to use context clues
- `apps/api/src/__tests__/pdkt-image-generation.test.ts` — **Phase 97**: Added attachmentWarning capture test, disabled image gen diagnostics test, fallback model diagnostics test
- `apps/api/src/__tests__/pdkt-session-create-route.test.ts` — **Phase 97**: Added route-level bodyName and middle mention pattern regression tests
- `apps/api/src/__tests__/pdkt-template-resolver.test.ts` — **Phase 97**: Updated expectations to use bodyName instead of full name
- `apps/api/src/__tests__/pdkt.test.ts` — **Phase 97**: Updated expectations to match context clue patterns
- `apps/web/src/__tests__/pdkt-ai-image-rendering.test.tsx` — **Phase 97**: Added attachment warning AlertCard rendering test
- `docs/rebuild-logs/phase-97-pdkt-natural-name-and-image-fix.md` — **NEW Phase 97**: Documentation for PDKT natural name, clues, and AI image diagnostics
- `packages/types/src/ai-models.ts` — **Phase 98**: Added `AiModelModule` type, `gemini-3.5-flash` model entry (180s timeout, text/image capabilities), `TEXT_SIMULATION_MODELS` filtered constant
- `apps/api/src/lib/ai-models.ts` — **Phase 98**: Moved `TEXT_SIMULATION_MODELS` to shared types, added `qa-analyzer` module support in `getModelsForModule()`
- `apps/web/src/lib/aiModels.ts` — **Phase 98**: Replaced duplicate `TEXT_SIMULATION_MODELS` with re-export, typed `AiModelModule`
- `apps/web/src/routes/sidak/reports-ai.tsx` — **Phase 98**: Replaced `AI_MODELS` with `TEXT_SIMULATION_MODELS` to filter image-only models
- `apps/api/src/lib/ai-json.ts` — **Phase 98**: Added `cause` parameter to Error constructor for better stack traces
- `apps/api/src/app.ts` — **Phase 98**: Removed unused `UserProfile` import
- `apps/api/src/routes/ai.ts` — **Phase 98**: Typed `module` query param as `AiModelModule`
- `apps/api/src/__tests__/helpers/rls-policy-source.ts` — **Phase 98**: Statically imported `readdirSync` instead of `require()`
- Various test/service files — **Phase 98**: Removed unused imports (beforeEach, ZodError, pendingResolve) and unused function params across 10 files
- `apps/web/src/__tests__/ketik-settings-modal.test.tsx` — **Phase 98**: Added `Gemini 3.5 Flash` assertion
- `apps/web/src/__tests__/pdkt-settings-modal.test.tsx` — **Phase 98**: Added `Gemini 3.5 Flash` assertion
- `apps/api/src/__tests__/ai-models.test.ts` — **NEW Phase 98**: Unit tests for Gemini 3.5 Flash provider routing and qa-analyzer text model filtering
- `apps/web/src/__tests__/sidak-reports-ai.test.tsx` — **NEW Phase 98**: Unit tests for SIDAK Report AI model rendering (shows Gemini 3.5 Flash, excludes gemini-3.1-flash-image)
- `apps/api/scripts/smoke-gemini-model.mjs` — **NEW Phase 98**: Smoke test for Gemini model ID validation
- `docs/rebuild-logs/phase-98-lint-debt-and-gemini-35-flash.md` — **NEW Phase 98**: Documentation for lint debt cleanup and Gemini 3.5 Flash integration
- `apps/api/src/lib/ai-usage-categories.ts` — **NEW Phase 99**: Centralized AI action classification with 14-action definition map (`USAGE_ACTION_DEFINITIONS`), `getUsageActionDefinition()`, and `isUsageActionInCategory()` replacing inline set lookups
- `apps/api/src/services/ai-usage-summary-service.ts` — **NEW Phase 99**: Extracted `/usage/summary` inline logic into `getAiUsageSummary()` with enriched `breakdownItems` (per-key labeled items per action category)
- `apps/api/src/services/ketik/review-state.ts` — **NEW Phase 99**: Pure `resolveKetikReviewState()` function with 12 deterministic transition cases replacing complex inline state logic
- `apps/api/src/routes/ai.ts` — **Phase 99**: Reduced /usage/summary handler from 127→21 lines, delegated to `getAiUsageSummary()`; replaced inline `SIMULATION_ACTIONS`/`REVIEW_ACTIONS` sets with `isUsageActionInCategory()`
- `apps/api/src/services/ketik/review-lifecycle.ts` — **Phase 99**: Reduced from 153→50 lines, delegates state computation to `resolveKetikReviewState()` with clean decision-based DB writes
- `apps/api/src/services/pdkt/evaluation-service.ts` — **Phase 99**: Enhanced evaluation prompt handling and error wrapping
- `apps/api/src/services/pdkt/session-service.ts` — **Phase 99**: Added `attachmentWarning` passthrough in session init response
- `packages/types/src/pdkt.ts` — **Phase 99**: Added `attachmentWarning` optional field to `emailMessageSchema`
- `apps/web/src/routes/pdkt/components/EmailDetailPane.tsx` — **Phase 99**: Renders amber AlertCard with `attachmentWarning` when no attachments and AI diagnostics present
- `apps/web/src/components/UsageModal.tsx` — **Phase 99**: Enhanced breakdown display with enriched `breakdownItems` from API
- `apps/web/src/lib/usage-snapshot.ts` — **Phase 99**: Extended type for enriched breakdown items
- `apps/web/src/lib/usage-summary.ts` — **Phase 99**: Updated to handle new `breakdownItems` response shape
- `apps/api/src/__tests__/ai-usage-summary-breakdown.test.ts` — **Phase 99**: Enriched breakdownItems contract test
- `apps/api/src/__tests__/ketik-review-lifecycle.test.ts` — **NEW Phase 99**: Tests for extracted review state machine transitions
- `apps/api/src/__tests__/pdkt-evaluation-prompt.test.ts` — **NEW Phase 99**: Tests for evaluation prompt edge cases
- `apps/api/src/__tests__/pdkt-image-generation.test.ts` — **Phase 99**: Added attachment warning capture test
- `apps/web/src/__tests__/usage-modal-breakdown.test.tsx` — **Phase 99**: Updated for enriched breakdown shape
- `apps/web/src/__tests__/usage-summary.test.ts` — **Phase 99**: Updated for enriched breakdown shape
- `apps/web/src/__tests__/pdkt-ai-image-rendering.test.tsx` — **Phase 99**: Attachment warning AlertCard rendering test
- `docs/rebuild-logs/phase-99-ai-usage-categories-and-review-state-machine.md` — **NEW Phase 99**: Documentation for AI usage categories extraction and KETIK review state machine
- `supabase/migrations/20260602000000_fix_bulk_reorder_profiler_peserta_auth.sql` — **NEW Phase 100**: Terminal migration fixing bulk_reorder_profiler_peserta authorization for service_role bypass with dedup/validity checks
- `apps/api/src/services/profiler-service.ts` — **Phase 100**: Added `mapReorderError` with human-friendly messages, removed fallback row-by-row update in `reorderPeserta()`
- `apps/web/src/lib/profilerService.ts` — **Phase 100**: Replaced custom fetchApi with unified `getApi` helper (CSRF tokens, 401 interception, HTML detection)
- `apps/web/src/routes/profiler/table.tsx` — **Phase 100**: Disabled sort button with tooltip when filters/search active
- `apps/web/src/routes/profiler/components/table/ProfilerParticipantCard.tsx` — **NEW Phase 100**: Glassmorphism-inspired premium card with hover transitions, fallback initials
- `apps/web/src/routes/profiler/components/table/ProfilerParticipantGrid.tsx` — **NEW Phase 100**: Responsive CSS grid layout (1→4 cols) for participant cards
- `apps/api/src/__tests__/profiler-route-reorder.test.ts` — **NEW Phase 100**: Route-level reorder auth and error mapping tests
- `apps/api/src/__tests__/profiler-service.test.ts` — **Phase 100**: 6 new unit tests for reorderPeserta/bulkReorderPeserta error mapping
- `apps/web/src/__tests__/profiler-grid-view.test.tsx` — **NEW Phase 100**: Frontend tests for ProfilerParticipantCard and ProfilerParticipantGrid
- `docs/rebuild-logs/phase-100-profiler-reorder-auth-and-grid-view.md` — **NEW Phase 100**: Documentation for profiler reorder auth fix and grid view
- `apps/web/src/routes/profiler/components/table/ProfilerTableView.tsx` — **Phase 100**: Deleted — replaced by grid view components
- `apps/web/src/components/sidak/SidakSelectionCard.tsx` — **NEW Phase 101**: Unified vertical selection card (flex-col, min-h-32, rounded-2xl, p-5) with icon/title/subtitle/animation
- `apps/web/src/components/sidak/SidakSelectionGrid.tsx` — **NEW Phase 101**: Responsive grid container (1→2→3 cols) for selection cards
- `apps/web/src/components/sidak/TemuanGroupGrid.tsx` — **NEW Phase 101**: Responsive grid container (1→2→3 cols) for temuan group cards with Omit-based handler forwarding
- `apps/web/src/__tests__/sidak-selection-grid.test.tsx` — **NEW Phase 101**: Grid layout and card contract tests
- `apps/web/src/__tests__/temuan-group-grid.test.tsx` — **NEW Phase 101**: TemuanGroupGrid responsive class + indicator label tests
- `apps/web/src/routes/sidak/input.tsx` — **Phase 101**: Replaced inline folder/agent/period card JSX with SidakSelectionCard/SidakSelectionGrid; replaced inline temuan map with TemuanGroupGrid; always max-w-6xl container
- `apps/web/src/components/sidak/TemuanGroupCard.tsx` — **Phase 101**: Exported TemuanItem/TemuanGroup/TemuanGroupCardProps interfaces; switched div→article; responsive edit button layout
- `apps/web/src/__tests__/sidak-input-parity.test.tsx` — **Phase 101**: Updated vertical-list assertions to multi-column grid assertions
- `docs/SIDAK_LOGIC_AND_SCORING.md` — **Phase 101**: Added UI note about responsive grid layout
- `apps/api/src/services/sidak/rule-version-resolver.ts` — **NEW Phase 102**: Canonical `resolveEffectiveRuleVersionForPeriod(serviceType, periodId)` resolver — finds the latest published version whose effective period ≤ target period
- `apps/api/src/routes/sidak/rule-versions.ts` — **Phase 102**: Added `DELETE /rule-versions/:id` endpoint (admin/trainer), draft-only guard with 404/400 error codes
- `apps/api/src/services/sidak/rule-versions.ts` — **Phase 102**: Added `deleteRuleVersionDraft()` with status validation; `publishRuleVersion()` scoped to `effective_period_id`; version list sorted newest-first by target period
- `apps/api/src/services/sidak/dashboard-data.ts` — **Phase 102**: Per-(service_type, period_id) rule weight & indicator resolution via concurrent `Promise.all` map; dashboard scoring uses period-specific snapshot
- `apps/api/src/services/sidak/dashboard-trends.ts` — **Phase 102**: `calculateScore` callback now receives `periodId` for period-aware scoring
- `apps/api/src/services/sidak/temuan-service.ts` — **Phase 102**: `validateTemuanBatch` and `createPerfectScoreSession` use `resolveEffectiveRuleVersionForPeriod`; `refreshDashboardSummary` uses per-period cached weights/indicators
- `apps/api/src/services/sidak-service.ts` — **Phase 102**: Re-exports `rule-version-resolver` for test compatibility
- `apps/web/src/routes/sidak/settings.tsx` — **Phase 102**: Dynamic confirm dialog with version/service/period name; imports `SERVICE_LABELS` and `getPeriodLabel`
- `apps/web/src/routes/sidak/settings/components/PublishPreviewModal.tsx` — **Phase 102**: Period dropdown sorted newest-first; publish warning copy clarified to mention same-period-only superseding
- `apps/api/src/__tests__/sidak-service.test.ts` — **Phase 102**: Refactored mock `pendingResolve` to table-aware pattern; updated `createPerfectScoreSession` tests with period/multi-version data
- `apps/api/src/__tests__/sidak-versioning-parity.test.ts` — **Phase 102**: New tests for `publishRuleVersion` period-scoped superseding, `deleteRuleVersionDraft` (success, published-rejection, not-found), `resolveEffectiveRuleVersionForPeriod` (same period, earlier period, before-all)
- `apps/web/src/__tests__/sidak-settings-parity.test.tsx` — **Phase 102**: New test for delete draft button triggering `deleteApi` with correct path and dynamic confirm message
- `docs/rebuild-logs/phase-102-sidak-parameter-period-isolation.md` — **NEW Phase 102**: Documentation for parameter period isolation
- `apps/web/src/lib/sidak-kpi-delta.ts` — **NEW Phase 103**: KPI delta utility (`buildKpiDelta()`) with direction/magnitude/tone, two unit modes
- `apps/web/src/__tests__/sidak-kpi-delta.test.ts` — **NEW Phase 103**: Unit tests for KPI delta (relative-percent, percentage-point, null-on-zero-previous)
- `apps/api/src/__tests__/sidak-dashboard-trends.test.ts` — **NEW Phase 103**: Regression test verifying compliance sparkline uses rate, not count
- `apps/web/src/components/sidak/KpiCard.tsx` — **Phase 103**: Refactored to accept `KpiDeltaViewModel` prop; removed `invertDelta`; two-line delta badge with comparison label
- `apps/web/src/routes/sidak/dashboard.tsx` — **Phase 103**: Replaced inline `calcDelta` with `buildKpiDelta`; per-metric deltaUnit/lowerIsBetter config
- `apps/api/src/services/sidak/dashboard-trends.ts` — **Phase 103**: Compliance sparkline emits `complianceRate` (percentage) instead of count; typed as `DashboardSparklinePoint[]`
- `packages/types/src/sidak.ts` — **Phase 103**: Added `DashboardSparklinePoint` type; updated `sparklines` type in `DashboardData`
- `apps/web/src/__tests__/sidak-dashboard-parity.test.tsx` — **Phase 103**: Updated KpiCard mock for `delta` object; added delta text assertions
- `docs/SIDAK_LOGIC_AND_SCORING.md` — **Phase 103**: Added Delta KPI Dashboard section
- `apps/web/src/components/sidak/ParetoChart.tsx` — **Phase 105**: Exported custom `ParetoTooltip` with full parameter name, counts, cumulative %, category, and layanan label; hover cursor highlight; `minPointSize={4}` for short bars; normalized category color mapping; No Category legend item
- `apps/web/src/routes/sidak/dashboard.tsx` — **Phase 105**: Removed premature name truncation in Pareto data mapping; passed `serviceLabel` to ParetoChart using shared `SERVICE_LABELS`
- `apps/web/src/lib/scoring.ts` — **Phase 105**: Added `SERVICE_LABELS` constant mapping service types to display labels
- `apps/web/src/__tests__/sidak-dashboard-parity.test.tsx` — **Phase 105**: Added ParetoChart mock capture + `passes full RCA parameter names to ParetoChart` test
- `apps/web/src/__tests__/ParetoChart.test.tsx` — **NEW Phase 105**: Unit tests for ParetoTooltip rendering (critical/non-critical/none categories) and layanan label assertion
- `docs/rebuild-logs/phase-105-sidak-rca-bko-tooltip-fix.md` — **NEW Phase 105**: Documentation for RCA BKO tooltip fix
- `apps/api/src/services/pdkt/mailbox-service.ts` — **Phase 105**: Added `canDeletePdktMailboxItem()`, `fetchMailboxItems` returns canonical rows with `created_by_user` metadata + `permissions.can_delete`, `softDeleteMailboxItem` validates permission before calling RPC
- `apps/api/src/routes/pdkt/mailbox.ts` — **Phase 105**: Passes user `id` + `role` to service methods for permission-aware fetching and deletion
- `apps/api/src/routes/pdkt/route-utils.ts` — **Phase 105**: `jsonServerError` passes through custom status codes (403) with `FORBIDDEN` error code
- `apps/web/src/routes/pdkt/components/EmailDetailPane.tsx` — **Phase 105**: `formatCreatorLabel` display, delete button disabled + tooltip when `can_delete === false`
- `apps/web/src/routes/pdkt/components/MailboxSidebar.tsx` — **Phase 105**: Creator label (e.g. "Dibuat oleh Siti Aminah · Trainer") under snippet
- `apps/web/src/routes/pdkt/simulation.tsx` — **Phase 105**: Removed cascading mailbox delete on session/clear-all; added `permissions: { can_delete: false }` to local evaluation items
- `packages/types/src/pdkt.ts` — **Phase 105**: Added `PdktMailboxCreator` and `PdktMailboxPermissions` interfaces, `created_by_user` and `permissions` fields on `PdktMailboxItem`
- `supabase/migrations/20260603090000_pdkt_shared_mailbox_policy.sql` — **NEW Phase 105**: Shared mailbox migration (RLS update, RPC rewrite, soft-delete RPC)
- `supabase/rollbacks/rollback_20260603090000_pdkt_shared_mailbox_policy.sql` — **NEW Phase 105**: Rollback restoring owner-only policy + fanout RPCs
- `apps/api/src/__tests__/pdkt-mailbox-permissions.test.ts` — **NEW Phase 105**: Permission matrix tests for `canDeletePdktMailboxItem`, shared fetch, and 403 delete enforcement
- `apps/web/src/__tests__/pdkt-mailbox.test.tsx` — **Phase 105**: Updated for `created_by_user` creator label and disabled delete assertions
- `apps/api/src/__tests__/pdkt.test.ts` — **Phase 105**: Added shared mailbox migration + rollback SQL contract tests
- `docs/rebuild-logs/phase-105-pdkt-shared-mailbox-ownership.md` — **NEW Phase 105**: Documentation for PDKT shared mailbox ownership
- `apps/api/src/services/pdkt/mailbox-service.ts` — **Phase 106**: Added `bulkSoftDeleteMailboxItems()` with per-item `canDeletePdktMailboxItem` check, `Promise.allSettled` execution, and `BulkDeleteResult` summary
- `apps/api/src/routes/pdkt/mailbox.ts` — **Phase 106**: Added `POST /mailbox/batch-delete` endpoint with Zod `pdktMailboxBulkDeleteSchema` validation
- `packages/types/src/pdkt.ts` — **Phase 106**: Added `pdktMailboxBulkDeleteSchema` and `PdktMailboxBulkDelete` type
- `apps/web/src/routes/pdkt/components/MailboxSidebar.tsx` — **Phase 106**: Bulk selection mode with checkboxes, disabled state for non-deletable items, batch delete button
- `apps/web/src/routes/pdkt/simulation.tsx` — **Phase 106**: Bulk delete handlers, confirmation dialog, partial success/failure toast
- `supabase/migrations/20260603100000_pdkt_fix_soft_delete_rpc.sql` — **NEW Phase 106**: Fix `soft_delete_pdkt_mailbox_item` RPC with `COALESCE` for legacy NULL `created_by_user_id`
- `apps/api/src/__tests__/pdkt-mailbox-bulk-delete-route.test.ts` — **NEW Phase 106**: Route E2E test for bulk delete (success + validation)
- `apps/web/src/__tests__/pdkt-mailbox-bulk.test.tsx` — **NEW Phase 106**: Frontend bulk delete UX tests (toggle, select, delete, partial failure)
- `apps/api/src/__tests__/pdkt-mailbox-permissions.test.ts` — **Phase 106**: Unit tests for `bulkSoftDeleteMailboxItems` (permission filter, RPC rejection)
- `docs/rebuild-logs/phase-106-pdkt-bulk-delete-soft-delete-fix.md` — **NEW Phase 106**: Documentation for PDKT bulk delete & soft delete fix
- `apps/api/src/services/pdkt/evaluation-service.ts` — **Phase 107**: Removed `.eq("user_id", userId)` from 3 query locations in `processPdktEvaluation()` to allow shared mailbox access
- `apps/api/src/routes/pdkt/history.ts` — **Phase 107**: Added two-tier fallback (userClient → pdkt_mailbox_items check → adminClient) for evaluation access
- `apps/web/src/routes/pdkt/simulation.tsx` — **Phase 107**: Filter state lifted to parent, auto-sync selection, `filteredByTab` memo
- `apps/web/src/routes/pdkt/components/MailboxSidebar.tsx` — **Phase 107**: Filter state controlled by parent (props `filter`/`onFilterChange`)
- `apps/api/src/__tests__/pdkt-reply-route.test.ts` — **Phase 107**: 4 E2E tests for non-owned history evaluation access
- `docs/rebuild-logs/phase-107-pdkt-evaluation-sharing-access-fix.md` — **NEW Phase 107**: Documentation for evaluation sharing access fix
- `apps/web/src/routes/sidak/dashboard.tsx` — **Phase 108**: Added "Tampilkan Semua"/"Sembunyikan Semua" toggle for parameter trend chart with rotation animation; "Parameter:" label prefix; isAllShown state management
- `apps/web/src/components/sidak/AgentTrendTab.tsx` — **Phase 108**: Added "Total Temuan" filter button with TOTAL_ONLY state, active pill styling (scale-105, shadow-primary, white text/dot), isolates only total trend line when active
- `docs/rebuild-logs/phase-108-sidak-dashboard-trend-toggle-filter.md` — **NEW Phase 108**: Documentation for dashboard trend toggle & total temuan filter
- `apps/api/src/services/sidak/agent-directory.ts` — **Phase 109**: Agent detail now queries `qa_dashboard_agent_period_summary` MV for cached per-(period_id,service_type) scores; fallback to real-time via `resolveEffectiveRuleVersionForPeriod` with error-safe DEFAULT_SERVICE_WEIGHTS fallback
- `apps/web/src/components/sidak/SidakInputScoreCard.tsx` — **Phase 109**: UI overhaul — SVG radial progress ring, glassmorphism (`backdrop-blur-md`), "Skor Kualitas (Live)" rename, live pulse badge, ShieldAlert/ShieldCheck icons, improved info footnote
- `apps/web/src/__tests__/sidak-input-parity.test.tsx` — **Phase 109**: Updated test assertions for new score card UI (SVG circle, text-2xl, new class names)
- `apps/api/src/services/sidak/dashboard-data.ts` — **Phase 110**: Dashboard summary now computed real-time from `qa_temuan` via app scoring engine, replacing MV/cache chain; multi-period summaries aggregate from `periodMetrics` with weighted averages
- `apps/api/src/services/sidak/dashboard-trends.ts` — **Phase 110**: Returns `periodMetrics` array alongside `paramTrend` and `sparklines` for downstream summary aggregation
- `apps/web/src/routes/sidak/dashboard.tsx` — **Phase 110**: Compliance description differentiates single vs multi-month (`"X agen..."` vs `"X agen... (rata-rata per bulan)"`)
- `apps/api/src/__tests__/sidak-dashboard-mv-fallback.test.ts` — **Phase 110**: Refactored to error if summary/cache tables are queried (enforcing MV-free dashboard summary path)
- `apps/api/src/__tests__/sidak-dashboard-range-summary.test.ts` — **NEW Phase 110**: Multi-period summary aggregation test from `periodMetrics`
- `docs/SIDAK_LOGIC_AND_SCORING.md` — **Phase 110**: Added note about real-time computation vs MV/cache
- `docs/architecture.md` — **Phase 110**: Updated SIDAK Dashboard Performance section
- `docs/checklist-audit-trainers-superapp.md` — **Phase 110**: Updated 2 audit entries
- `docs/database.md` — **Phase 110**: Updated MV description
- `docs/rebuild-logs/phase-110-sidak-dashboard-summary-consistency.md` — **NEW Phase 110**: Documentation for dashboard summary consistency fix
- `apps/web/src/routes/telefun/sessionFinalizer.ts` — **Phase 111**: Added `FinalizerStatus` type + helpers; replaced 3 mutable `let` booleans with `const status = createFinalizerStatus()` + `mark*` calls; preserved return contract
- `apps/web/src/__tests__/telefun-session-finalizer.test.ts` — **Phase 111**: Added 2 characterization tests: missing-user-ID path (upload+scoring failure) and base-save-failure path
- `apps/web/src/routes/ketik/components/ChatInterface.tsx` — **Phase 112**: Reduced 277→16 lines, extracted `KetikMessageBubble`/`KetikImageLightbox`/`getKetikScenarioImages` into `chat/` directory
- `apps/web/src/routes/ketik/components/chat/KetikMessageBubble.tsx` — **NEW Phase 112**: `TickIcon` + `renderKetikMessageContent` + message bubble component
- `apps/web/src/routes/ketik/components/chat/KetikImageLightbox.tsx` — **NEW Phase 112**: Image lightbox with AnimatePresence
- `apps/web/src/routes/ketik/components/chat/ketikScenarioImages.ts` — **NEW Phase 112**: Scenario images helper
- `apps/api/src/services/sidak/dashboard-types.ts` — **Phase 112**: Added 9 typed converter functions + `DashboardAgentWithMetrics` type + `no_tiket`/`created_at` on `DashboardTemuanRow`
- `apps/api/src/services/sidak/dashboard-data.ts` — **Phase 112**: Replaced all `(agent as any).xxx` mutations with `withDashboardAgentMetrics()`, removed inline type-casts
- `apps/web/src/routes/telefun/services/realisticMode/types.ts` — **Phase 112**: Added `RealisticModeMetrics` interface
- `apps/web/src/routes/telefun/services/geminiService.ts` — **Phase 112**: Typed AudioContext fallback via `WebkitAudioContextWindow`, typed `realisticModeMetrics` field
- `apps/api/src/__tests__/sidak-dashboard-type-boundary.test.ts` — **NEW Phase 112**: Immutability test for `withDashboardAgentMetrics`
- `apps/web/src/__tests__/ketik-chat-interface-structure.test.ts` — **NEW Phase 112**: Scenario images extraction tests
- `apps/web/src/__tests__/telefun-session-metrics-boundary.test.ts` — **NEW Phase 112**: RealisticModeMetrics type test
- `apps/telefun/src/server.ts` — **Phase 116**: Hapus import, instantiasi, start/ping/stop, dan callback `SilenceDetector`
- `apps/telefun/src/silence.ts` — **Phase 116**: Hapus class `SilenceDetector` (tidak dipakai), pertahankan `UtteranceBuffer`
- `apps/web/src/routes/telefun/services/geminiService.ts` — **Phase 116**: Hapus dead-air state/constants, hapus block timer dari audio loop, hapus `sendDeadAirPrompt()`, stalled watchdog tidak lagi call `sendDeadAirPrompt()`
- `apps/web/src/routes/telefun/services/promptBuilder.ts` — **Phase 116**: Silent instruction diperpanjang 3x (`<10`→`<30`, `10-15`→`30-45` detik)
- `apps/telefun/src/server-silence-detector.test.ts` — **NEW Phase 116**: Static guard server SilenceDetector
- `apps/web/src/__tests__/telefun-dead-air-disabled.test.ts` — **NEW Phase 116**: Static guard client dead-air
- `apps/web/src/__tests__/telefun-prompt-builder.test.ts` — **Phase 116**: Test assertions untuk timing silent instruction baru
- `docs/rebuild-logs/phase-116-telefun-disable-silence-and-dead-air-detectors.md` — **NEW Phase 116**: Rebuild log
- `apps/web/src/lib/profilerPhotoStorage.ts` — **NEW Phase 117**: Canonical frontend storage helper (`profiler-foto` bucket, unique path generation, upload + public URL)
- `apps/api/src/services/profiler-photo-storage.ts` — **NEW Phase 117**: Canonical backend storage helper (`extractProfilerPhotoPath`, `checkProfilerPhotoUrl` with HEAD-based validation)
- `supabase/migrations/20260604100000_restore_profiler_foto_bucket.sql` — **NEW Phase 117**: Terminal migration — `profiler-foto` bucket (public, 5 MB, image MIME types) + RLS policies
- `apps/web/src/__tests__/profiler-photo-storage.test.ts` — **NEW Phase 117**: 2 frontend unit tests (upload path, extension normalization)
- `apps/api/src/__tests__/profiler-photo-storage.test.ts` — **NEW Phase 117**: 3 backend unit tests (path extraction, HEAD check, 404)
- `apps/api/src/__tests__/profiler-route-create.test.ts` — **NEW Phase 117**: 3 route contract tests (trainer OK, leader rejected, qa rejected)
- `apps/web/src/lib/profilerService.ts` — **Phase 117**: `uploadFoto` delegates to `profilerPhotoStorage.uploadProfilerPhoto` (replaces inline `profiler-assets` upload)
- `apps/api/src/services/profiler-service.ts` — **Phase 117**: Removed inline `checkFotoUrl()` using `foto-avatar`, uses `checkProfilerPhotoUrl()`
- `scripts/data-integrity/foto-checker.ts` — **Phase 117**: `foto-avatar` → `profiler-foto`
- `apps/api/src/__tests__/check-fotos.test.ts` — **Phase 117**: `foto-avatar` → `profiler-foto`
- `docs/rebuild-logs/phase-117-ktp-storage-bucket-fix.md` — **NEW Phase 117**: Rebuild log

- `apps/api/src/routes/ai.ts` — **Phase 185**: Replaced ~35 lines of manual delete orchestration with single `deleteMonitoringHistory()` service call; added Zod validation for module+UUID; human-friendly error mapping with internal message redaction.
- `apps/api/src/services/monitoring-history-delete-service.ts` — **NEW Phase 185**: Typed service wrapper for `delete_monitoring_history` RPC with domain error classes and defensive payload validation.
- `apps/api/src/__tests__/monitoring-history-delete-migration.test.ts` — **NEW Phase 185**: 3 migration contract tests (file existence, security/structural contract, FK cascade verification).
- `apps/api/src/__tests__/monitoring-history-delete-service.test.ts` — **NEW Phase 185**: 7 service unit tests (success, NOT_FOUND, DELETE_FAILED, malformed payload, unknown source, source-module mismatch).
- `apps/api/src/__tests__/monitoring-history-delete-route.test.ts` — **NEW Phase 185**: 7 route integration tests (role guard, invalid module, invalid UUID, success, 404 mapping, 500 mapping, internal message redaction).
- `supabase/migrations/20260605100000_atomic_monitoring_history_delete.sql` — **NEW Phase 185**: Terminal migration creating `delete_monitoring_history` RPC with SECURITY DEFINER, auth guard, module dispatch, and privilege restrictions.
- `docs/rebuild-logs/phase-thermo-monitoring-delete-atomicity.md` — **NEW Phase 185**: Documentation for monitoring history delete atomicity.
- `docs/MONITORING_TOKEN_USAGE_BILLING.md` — **Phase 185**: Added "Penghapusan Riwayat (Atomic Delete)" section; updated Access Matrix.

- `packages/types/src/telefun-assessment.ts` — **Phase 186**: Canonical schemas dengan hold `.optional()`, `VoiceQualityAssessment`/`TelefunScoreResult` dengan Omit, `parseVoiceQualityAssessment()` memvalidasi communicationProfile via schema, menghilangkan blind cast
- `packages/types/src/telefun-communication-profile.ts` — **Phase 186**: `enrichAssessmentWithCommunicationProfile()` validasi metric key exact match via `hasCanonicalMetricSet`, mengganti `length===5`
- `packages/types/src/telefun.ts` — **Phase 186**: Replaced manual named type re-exports dengan `export * from "./telefun-assessment"`
- `packages/types/src/index.ts` — **Phase 186**: Removed duplicate `TelefunCommunicationProfile` re-export (from telefun.ts wildcard)
- `apps/api/src/lib/telefun-analysis.ts` — **Phase 186**: `analyzeVoiceQuality` revalidates assessment via `parseVoiceQualityAssessment` setelah hold normalization; fail-closed pada DB update failure
- `apps/web/src/routes/telefun/telefunApi.ts` — **Phase 186**: Removed blind score/assessment casts, menggunakan typed parsers
- `apps/web/src/routes/telefun/sessionFinalizer.ts` — **Phase 186**: Removed `any` types dari transport row, typed dengan `TelefunHistory`
- `apps/web/src/lib/voiceAssessmentUtils.ts` — **Phase 186**: Removed compatibility normalizer yang mengubah payload invalid menjadi object skor nol
- `apps/web/src/routes/telefun/components/VoiceAssessmentSection.tsx` — **Phase 186**: Removed score normalizer import, menggunakan raw assessment
- `apps/web/src/routes/monitoring/components/TelefunReviewPanel.tsx` — **Phase 186**: Removed score normalizer import
- `docs/TELEFUN_ASSESSMENT_CONTRACT.md` — **NEW Phase 186**: Kontrak penilaian Telefun — trust boundary, skala nilai, parser kanonik, hold management, persistence
- `docs/rebuild-logs/phase-thermo-telefun-metrics-trust-boundary.md` — **NEW Phase 186**: Rebuild log untuk Telefun Metrics Trust Boundary

- `apps/web/vitest.config.fast.ts` — **NEW Phase 187**: Vitest config for fast test tier (node environment, excludes .tsx and React hook tests)
- `apps/web/src/__tests__/setup-fast.ts` — **NEW Phase 187**: Minimal setup file without DOM globals for fast tests
- `apps/web/src/__tests__/sidak-input-legacy-refresh.test.tsx` — **Phase 187**: Removed 6 low-value tests (import verification, component contract checks)
- `apps/web/src/__tests__/sidak-input-parity.test.tsx` — **Phase 187**: Removed 17 hardcoded CSS/HTML string assertion tests, kept actual function tests
- `apps/web/package.json` — **Phase 187**: Added `test:fast` script
- `apps/api/package.json` — **Phase 187**: Added `test:fast` script
- `apps/telefun/package.json` — **Phase 187**: Added `test:fast` script
- `package.json` — **Phase 187**: Added `test:fast` root script
- `turbo.json` — **Phase 187**: Added `test:fast` task
- `docs/rebuild-logs/phase-thermo-test-suite-optimization.md` — **NEW Phase 187**: Rebuild log for test suite optimization & tiering
- `docs/rebuild-logs/phase-188-telefun-transcript-drain.md` — **NEW Phase 191**: Rebuild log for Telefun transcript ordering & graceful shutdown drain
- `docs/rebuild-logs/phase-187-sidak-pareto-improvement-insight.md` — **Phase 105/187**: Rebuild log for SIDAK Pareto improvement insight with RCA analysis on dashboard.
- `docs/rebuild-logs/phase-192-ketik-pdkt-custom-scenarios-draft.md` — **NEW Phase 192**: Rebuild log for KETIK/PDKT custom scenarios & consumer types via draft payload.
- `docs/rebuild-logs/phase-188-access-approval-module-information.md` — **NEW Phase 188**: Rebuild log for access approval module information badges.
- `docs/rebuild-logs/phase-188-sidak-agent-detail-zero-score-cache-remediation.md` — **Phase 109/188**: Rebuild log for SIDAK agent detail zero score cache remediation.
- `docs/rebuild-logs/phase-189-access-approval-grouped-leader-cards.md` — **NEW Phase 189**: Rebuild log for consolidated leader access cards with grouped UI.
- `docs/rebuild-logs/phase-190-telefun-speaker-timestamp-transcript.md` — **NEW Phase 190**: Rebuild log for Telefun speaker & timestamp transcript from Gemini Live events.

| #   | Route                        | Page Type    | Notes                                                                               |
| --- | ---------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| 1   | `/`                          | Landing      | Hero, stats, modules showcase, benefits                                             |
| 2   | `/dashboard`                 | Overview     | Recharts charts, KPI cards, module grid                                             |
| 3   | `/sidak`                     | Landing      | 6 card links                                                                        |
| 4   | `/sidak/dashboard`           | QA Dashboard | 4 metric cards, bar charts, top agents                                              |
| 5   | `/sidak/input`               | Form         | Multi-step audit input + Excel                                                      |
| 6   | `/sidak/ranking`             | Table        | Agent ranking sorted by defects                                                     |
| 7   | `/sidak/settings`            | CRUD         | Service weights configuration                                                       |
| 8   | `/sidak/periods`             | Manager      | Create/view audit periods                                                           |
| 9   | `/sidak/agents`              | Directory    | Searchable agent list                                                               |
| 10  | `/sidak/agents/$id`          | Detail       | Per-service pills, separate trend chart per service, score badges in temuan history |
| 11  | `/ketik`                     | Landing      | Chat simulation intro                                                               |
| 12  | `/ketik/simulation`          | Chat UI      | Scenario selection + chat interface                                                 |
| 13  | `/ketik/history`             | Placeholder  | Session history                                                                     |
| 14  | `/pdkt`                      | Landing      | Email simulation intro                                                              |
| 15  | `/pdkt/simulation`           | Email UI     | Scenario + inbound email + evaluate                                                 |
| 16  | `/pdkt/history`              | Placeholder  | Session history                                                                     |
| 17  | `/telefun`                   | Voice UI     | WebSocket-based call simulation                                                     |
| 18  | `/monitoring`                | Dashboard    | AI usage + pricing management                                                       |
| 19  | `/account`                   | Settings     | Edit name + change password                                                         |
| 20  | `/profiler`                  | Landing      | Year/folder sidebar + action tiles                                                  |
| 21  | `/profiler/table`            | Table        | Search/filter/edit participant data                                                 |
| 22  | `/profiler/slides`           | Slides       | Slide view per participant                                                          |
| 23  | `/profiler/analytics`        | Charts       | Recharts analytics (4 charts)                                                       |
| 24  | `/profiler/export`           | Export       | Excel/CSV export                                                                    |
| 25  | `/profiler/add`              | Form         | Manual participant input                                                            |
| 26  | `/profiler/import`           | Import       | Excel template + upload + results                                                   |
| 27  | `/profiler/teams`            | CRUD         | Custom team management                                                              |
| 28  | `/sidak/reports`             | Landing      | Data vs AI report selection                                                         |
| 29  | `/sidak/reports-data`        | Table        | Filter form + temuan table + Excel export                                           |
| 30  | `/sidak/reports-ai`          | Form         | AI-powered report generation                                                        |
| 31  | `/waiting-approval`          | Auth         | Status polling page                                                                 |
| 32  | `/reset-password`            | Auth         | Password recovery form                                                              |
| 33  | `/dashboard/users`           | Table        | User status/role management, password reset, soft delete                            |
| 34  | `/dashboard/access-groups`   | Builder      | Dynamic access data rule scopes builder for leaders                                 |
| 35  | `/dashboard/access-approval` | Action       | Assign access groups and approve leader requests                                    |
| 36  | `/dashboard/activities`      | Table        | System-wide audit logs with CSV export                                              |
| 37  | `/unauthorized`              | Error        | 403 role-denied page                                                                |
| 38  | 404                          | Catch-all    | Custom not-found page                                                               |

## API Endpoints Reference (apps/api)

| Prefix             | Endpoints    | Service                                                                                                                                                                                                                     |
| ------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/sidak`    | 17 endpoints | `routes/sidak/` — 5 sub-modules (core, dashboard, temuan, rule-versions, reports)                                                                                                                                           |
| `/api/v1/ketik`    | 4 endpoints  | `services/ketik/` — 5 sub-modules (shared-utils, consumer-response, review-lifecycle, review-processor, settings-history)                                                                                                   |
| `/api/v1/pdkt`     | 16 endpoints | `routes/pdkt/` — 6 sub-modules (index, simulation, mailbox, history, settings, route-utils) + `services/pdkt/` — 7 service modules (catalog, session, evaluation, mailbox, shared-utils, image-generation, mailbox-session) |
| `/api/v1/ai`       | 7 endpoints  | —                                                                                                                                                                                                                           |
| `/api/v1/profiler` | 18 endpoints | `profiler-service.ts`                                                                                                                                                                                                       |
| `/api/v1/admin`    | 8 endpoints  | `admin-service.ts`                                                                                                                                                                                                          |
| `/api/v1/telefun`  | 5 endpoints  | `routes/telefun/` — 4 sub-modules (sessions, recordings, settings, annotations)                                                                                                                                             |

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, invoke the `skill` tool with `skill: "graphify"` before doing anything else.

### WAJIB: Gunakan graphify secara otomatis

Graphify HARUS digunakan sebagai referensi utama untuk memahami codebase — baik oleh agent utama (saya) maupun oleh subagent lewat Task tool. Ini berlaku untuk semua skenario:

#### Untuk Planning

- SEBELUM membuat plan, WAJIB query graphify untuk memahami konteks fitur/modul yang akan diubah.
- Gunakan `graphify query "arsitektur modul X"` atau `graphify explain "KonsepY"` untuk dapatkan gambaran sebelum menyusun tasklist.
- Untuk plan yang menyentuh banyak file/modul, query `graphify path "ModuleA" "ModuleB"` untuk lihat relasi.

#### Untuk Eksekusi (Bug Fix / Fitur Baru)

- SEBELUM mengubah kode, WAJIB query graphify untuk tahu dependensi dan file terkait.
- Gunakan `graphify query "file apa yang terkait dengan fitur X"` untuk identifikasi file yang perlu diubah.
- Jika ragu dengan dampak perubahan, query graphify dulu untuk cek cross-file relationships.
- SETELAH selesai mengubah kode, WAJIB jalankan `graphify update .` untuk menjaga graph tetap sinkron.

#### Untuk Subagent (Task tool)

- Saat mengirim task ke subagent via Task tool, SERTAKAN instruksi: "Gunakan graphify dulu untuk referensi codebase sebelum memulai."
- Subagent harus query graphify via `graphify query "<pertanyaan>"` sebelum menulis kode.

### Aturan Penting

- **Prioritas:** graphify query > GRAPH_REPORT.md > grep manual. Graph query return subgraph yang jauh lebih kecil dan relevan.
- **Dirty files:** File graphify-out/ yang dirty adalah normal (after hooks/update). Jangan skip graphify hanya karena dirty — kecuali user minta atau task spesifik tentang graph yang stale.
- **Wiki:** Jika `graphify-out/wiki/index.md` ada, gunakan untuk navigasi broad daripada browsing raw source.
- **GRAPH_REPORT.md:** Baca hanya untuk architecture review broad atau saat query/path/explain tidak cukup.
- **Gratis (AST-only):** `graphify update .` hanya proses AST — tidak ada biaya API. Jadi tidak ada alasan untuk skip update setelah modifikasi kode.
