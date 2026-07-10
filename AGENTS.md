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

## UI/UX Skills

Dua skill UI/UX terinstall dan WAJIB digunakan untuk semua task yang berhubungan dengan perubahan tampilan — build, design, implement, review, fix, atau improve UI. Keduanya **saling melengkapi**, bukan pengganti.

### Ensiklopedia: UI/UX Pro Max (Referensi Design)

**WAJIB** gunakan skill **UI/UX Pro Max** (`ui-ux-pro-max`) sebagai sumber referensi design. Skill ini seperti **ensiklopedia** — dipakai saat perlu cari referensi style, palette, font, atau guideline.

Skill ini menyediakan:

- **67 UI Styles** — Glassmorphism, Neumorphism, Bento Grid, dll.
- **161 Color Palettes** — Industri-specific
- **57 Font Pairings** — Typography recommendations
- **161 Reasoning Rules** — Design system generation sesuai industri
- **99 UX Guidelines** — Best practices & anti-patterns
- **Stack-specific guidelines** — React, Tailwind, shadcn/ui, Next.js, dan lainnya

**Cara pakai:** search database via script Python-nya. Gunakan saat:
- Butuh referensi style/palette/font untuk design baru
- Mau mastiin design sesuai standar industri
- Butuh UX guidelines untuk fitur tertentu

Skill ter-install di `.opencode/skills/ui-ux-pro-max/`.

### Quality Inspector: Impeccable (Workflow Design)

**WAJIB** gunakan skill **Impeccable** (`impeccable`) sebagai **quality checker & workflow design** — terutama untuk mastiin hasil design gak kelihatan "AI-generated". Skill ini seperti **toolkit + inspector**.

Skill ini menyediakan:
- **23 commands**: `craft`, `shape`, `init`, `audit`, `critique`, `polish`, `bolder`, `quieter`, `distill`, `harden`, `animate`, `layout`, `typeset`, `colorize`, dll.
- **44 deterministic detector rules** — Anti-pattern detector yg ngecek UI secara otomatis
- **PostToolUse hook** — Auto-run detector setiap kali agent selesai edit file UI
- **Live browser iteration** — `/impeccable live` buat iterasi visual langsung
- **The AI Slop Test** — Explicit guidance biar hasil gak kelihatan "AI made"

**Cara pakai:**
```bash
/impeccable init              # Setup pertama (bikin PRODUCT.md + DESIGN.md)
/impeccable audit <target>    # Technical quality check
/impeccable critique <target> # UX design review
/impeccable polish <target>   # Final pass sebelum shipping
/impeccable bolder <target>   # Amplify safe/bland designs
/impeccable harden <target>   # Error handling, edge cases
```

**Konfigurasi hooks** (auto-detect setelah edit UI):
```bash
/impeccable hooks on          # Aktifkan detector hook
/impeccable hooks status      # Cek status hook
```

Skill ter-install di `.agents/skills/impeccable/` (Codex) dan `.opencode/skills/impeccable/` (OpenCode).

### Flow Optimal: UI/UX Pro Max + Impeccable

| Step | Skill | Kegunaan |
|------|-------|----------|
| 1️⃣ | **UI/UX Pro Max** | Cari referensi: "kasi font pairing buat dashboard fintech" / "cari palette warna buat form" |
| 2️⃣ | **Coding** | Implementasi UI berdasarkan referensi |
| 3️⃣ | **Impeccable** | `audit` atau `polish` — deteksi AI slop, quality check |
| 4️⃣ | **Impeccable** | `critique` — UX review kalo perlu |

**Aturan penting:**
- Jangan skip **Impeccable audit** sebelum pull request yang ada perubahan UI
- Jangan skip **UI/UX Pro Max** saat mulai fitur UI baru — ambil referensi dulu
- Impeccable hooks akan auto-berjalan setelah edit file UI; perhatikan output-nya

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
- **Perubahan UI/UX** → **ui-ux-pro-max** (referensi) + **impeccable** (quality check)

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

## Pagination Fix & RPC Migration (2026-06-18)

### fetchAllPages Generic Helper
- File: `apps/api/src/lib/supabase-pagination.ts`
- Purpose: Paginate Supabase queries that can exceed 1000 rows (REST API auto-cap)
- Usage: `fetchAllPages<T>({ build: ({ from, to }) => supabaseAdmin.from("table").select("*").order("id").range(from, to) })`
- Applied to 22 queries across `apps/api/src/services/` (commits 27ac441..750f001)

### RPC/View Server-Side Aggregation
Migrated 3 high-volume aggregation functions from client-side pagination to server-side SQL:

| Function | Migration | Object | File |
|----------|-----------|--------|------|
| `getFolderCounts()` | `20260618100000_add_get_profiler_folder_counts_rpc.sql` | RPC `get_profiler_folder_counts(uuid[])` | `profiler-service.ts` |
| `getAccessGroups()` | `20260618101000_add_access_groups_count_view.sql` | View `v_access_groups_with_item_counts` | `admin-service.ts` |
| `getLeaderScopeSnapshot()` | `20260618102000_add_get_leader_scope_snapshot_rpc.sql` | RPC `get_leader_scope_snapshot(uuid, text)` + 2 indexes | `leader-access-service.ts` |

### Migration Files
All in `supabase/migrations/`:
- `20260618100000_add_get_profiler_folder_counts_rpc.sql`
- `20260618101000_add_access_groups_count_view.sql`
- `20260618102000_add_get_leader_scope_snapshot_rpc.sql`

### Rollback SQL
```sql
DROP FUNCTION IF EXISTS public.get_profiler_folder_counts(uuid[]);
DROP VIEW IF EXISTS public.v_access_groups_with_item_counts;
DROP FUNCTION IF EXISTS public.get_leader_scope_snapshot(uuid, text);
DROP INDEX IF EXISTS public.idx_leader_access_requests_approved_scope;
DROP INDEX IF EXISTS public.idx_access_group_items_active_group_scope;
```

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

### 9. Wajib Referensi `docs/design.md` untuk Setiap Perubahan UI/UX

Setiap perubahan tampilan (build, redesign, implement komponen, atau fix styling) **WAJIB** merujuk pada `docs/design.md` sebagai *source of truth* desain. Aturan ini mencakup:

1. **Color Palette:** Gunakan variabel CSS (`--bg`, `--surface`, `--border`, `--fg`, `--fg2`, `--fg3`, `--inv-bg`, `--inv-fg`) yang sudah didefinisikan. Jangan *hardcode* warna hex, tailwind arbitrary values, atau opacities yang tidak konsisten dengan sistem.
2. **Typography:** Ikuti font stack yang ditetapkan (Outfit untuk heading, Inter untuk body). Jangan gunakan ukuran font atau weight yang melenceng dari skala yang sudah ada.
3. **Spacing & Layout:** Gunakan jarak yang konsisten (gap-3, gap-4, p-5, dll). Hindari padding/margin yang tidak biasa atau tidak proporsional.
4. **Komponen:** Patuhi gaya yang sudah ada: glassmorphism untuk card, border tegas untuk surface elements, ikon minimalis, tombol dengan hover state yang halus.
5. **"No AI Slop":** Dilarang menambahkan dekorasi tidak bermakna (badge ornamental, gradien berlebihan, floating blobs, neon colors) — kecuali diinstruksikan secara eksplisit.

Kegagalan mematuhi `docs/design.md` akan menyebabkan redesign ulang, jadi pastikan dibaca sebelum ngoding dan dicek ulang setelah selesai.

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

121. **Telefun Prompt-First Runtime Cleanup** — Replaced the realistic-mode toggle with optional `simulationChallengeTypes` (max 3), moved challenge behavior into the Gemini Live system prompt, removed local VAD/long-speech interruption and the unused realistic-mode orchestrator/engines, kept native interruption/hold/transport guards deterministic, and preserved legacy history/settings compatibility. (DONE)

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
- **Audio recordings are remuxed with FFmpeg before scoring to make them seekable (play/pause/seek). Versioned paths (`full_call.seekable.webm`/`agent_only.seekable.webm`) replace the `upsert` overwrite to prevent stale CDN objects. FFmpeg must be installed in the deployment container via `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg`. The remux is blocking (before scoring) — if it succeeds, the player uses a persistent signed URL; if it fails, the original blob URL is used as fallback.**
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

163.  **PDKT Natural Name, Clues, and AI Image Diagnostics** — Fixed 3 critical issues in PDKT: (1) Identity name leakage — `bodyName` (e.g. "Susanto") now correctly used in email body instead of header `name` (e.g. "Black Cat"), with forbidden name cleaning post-render; (2) Generic intro elimination — replaced hardcoded fallbacks with 11 natural context clue templates (document/SLIK/billing context) across upfront/middle/late placements, deterministic seed-based indexing; (3) Structured AI image diagnostics — `generatePdktScenarioImages` returns `PdktImageGenerationDiagnostics` with `warning`/`reason`/`error`, propagated as `attachmentWarning` to frontend via `emailMessageSchema`, rendered as amber AlertCard. Added compliance validation for forbidden name leakage and generic intro phrases (`"Perkenalkan, nama saya..."`). **Follow-up**: Middle placement templates refactored to short clauses instead of full sentences; nama disisipkan ke paragraf tengah yang sudah ada via `weaveClauseIntoParagraph()` alih-alih ditambahkan sebagai paragraf berdiri sendiri, menghasilkan teks lebih natural. 11 files modified, ~338 lines added. (DONE)
202.  **OpenRouter Error Refactoring & DeepSeek Models** — Refactored OpenRouter error handling: extracted `formatOpenRouterError()` and `parseOpenRouterErrorMessage()` helpers, added structured error messages for 402 (Insufficient Credit) and 403 (Access Denied) error codes. Added `shouldLogKetikGenerationError()` guard to suppress console stack traces for expected AI errors in KETIK chat UI. Cleaned up model registry: removed deprecated `openai/gpt-oss-120b:free` and `google/gemini-2.0-flash-lite`, added `deepseek/deepseek-v4-pro` and `deepseek/deepseek-v4-flash`. 6 files modified, 4 regression tests (3 unit + 1 API). (DONE)
203.  **DeepSeek Direct Provider + KETIK/PDKT Word Count Policy** — Added native DeepSeek API client (`generateDeepSeekContent()`) as first-class AI provider alongside Gemini and OpenRouter. New `deepseek` provider type, `DEEPSEEK_MODELS` registry with `availableModules` metadata, combined `KETIK_PDKT_MODELS` for simulation modules. Provider routing via `MODEL_REGISTRY` lookup instead of brittle `/` path check. PDKT session service uses `getPdktWordCountPolicy()` to relax word count threshold for DeepSeek. Frontend SystemTabs use `model.provider` for badge styling. `unwrap-response` hardened with non-JSON content-type fallback. 18 files modified, 2 new files, many existing test updates. (DONE)
204.  **Telefun Seek & AI Scoring Production Repair** — Memulihkan scoring lifecycle contract (6 kolom, 5 RPCs, indexes) via terminal migration `20260622150000_repair_telefun_scoring_lifecycle_contract.sql`. Remux menggunakan versioned paths (`full_call.seekable.webm`/`agent_only.seekable.webm`), idempoten, dan membersihkan upload bila update DB gagal. Player memprioritaskan signed URL persisten; blob URL hanya fallback. Production DB migration sudah applied dan sesi `79f581b9-610a-4500-935d-7ef31744e153` sudah `completed` dengan skor 7. Focused 70 API + 26 web tests dan core 253 tests passing. **API/web deploy masih pending commit/push.** (IMPLEMENTED)

- `apps/api/src/services/pdkt-email-policy.ts` — **Phase 97**: Added `NameClueTemplate` system with 11 natural context clue templates, `getPdktMentionName()`, `getPdktForbiddenBodyNames()`, `pickNameClueTemplate()` with deterministic seed-based indexing, forbidden name leakage detection, and generic intro phrase compliance validation; **follow-up**: added `weaveClauseIntoParagraph()` helper, refactored middle templates to short clauses, middle placement now weaves into existing paragraph instead of standalone insert
- `apps/api/src/services/pdkt/image-generation.ts` — **Phase 97**: Added `PdktImageGenerationDiagnostics` and `PdktImageGenerationResult` types with structured error diagnostics, fallback model resolution, manual attachment guard, and provider-specific error handling
- `apps/api/src/services/pdkt/session-service.ts` — **Phase 97**: Added `attachmentWarning` passthrough in session init response
- `packages/types/src/pdkt.ts` — **Phase 97**: Added `attachmentWarning` optional field to `emailMessageSchema`
- `apps/web/src/routes/pdkt/components/EmailDetailPane.tsx` — **Phase 97**: Renders amber AlertCard with warning message when `attachmentWarning` is present and no attachments exist
- `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioAttachments.tsx` — **Phase 97**: Fixed `React.RefObject<HTMLInputElement | null>` type
- `apps/web/src/routes/pdkt/components/settings/scenarios/ScenarioForm.tsx` — **Phase 97**: Fixed `useCrudForm` import path
- `apps/api/src/__tests__/pdkt-email-policy.test.ts` — **Phase 97**: Added bodyName leakage test, natural middle clue placement test, updated upfront expectation to use context clues; **follow-up**: updated middle placement assertions for exact paragraph count, name in paragraph[1], and single-occurrence guard
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

- `apps/api/src/lib/openrouter.ts` — **Phase 202**: Extracted `formatOpenRouterError()` and `parseOpenRouterErrorMessage()` helpers; added structured error messages for 402 (Insufficient Credit) and 403 (Access Denied) error codes.
- `apps/api/src/__tests__/openrouter.test.ts` — **NEW Phase 202**: Unit test for OpenRouter 401 error with detail passthrough.
- `apps/web/src/routes/ketik/lib/ketik-error.ts` — **NEW Phase 202**: `shouldLogKetikGenerationError()` guard that suppresses console.error for expected `ApiError` with `AI_ERROR` code.
- `apps/web/src/__tests__/ketik-error.test.ts` — **NEW Phase 202**: 3 unit tests for `shouldLogKetikGenerationError` (AI_ERROR suppressed, NOT_FOUND logged, non-ApiError logged).
- `apps/web/src/routes/ketik/components/ChatInterface.tsx` — **Phase 202**: Replaced unconditional `console.error` with `shouldLogKetikGenerationError` guard to reduce console noise during expected AI errors.
- `packages/types/src/ai-models.ts` — **Phase 202**: Removed deprecated `openai/gpt-oss-120b:free` and `google/gemini-2.0-flash-lite`; added `deepseek/deepseek-v4-pro` and `deepseek/deepseek-v4-flash`.
- `docs/modules.md` — **Phase 202**: Added "Expected AI errors" note — expected AI errors are displayed to user but suppressed from console stack trace.
- `docs/rebuild-logs/phase-202-openrouter-error-refactoring-deepseek-models.md` — **NEW Phase 202**: Rebuild log for OpenRouter error refactoring, KETIK error suppression, and DeepSeek models.

- `apps/api/src/lib/deepseek.ts` — **NEW Phase 203**: Native DeepSeek API client (`generateDeepSeekContent()`) with retry, error formatting, usage logging, and JSON mode support.
- `apps/api/src/__tests__/deepseek.test.ts` — **NEW Phase 203**: Unit test for DeepSeek endpoint call with direct model ID.
- `packages/types/src/ai-models.ts` — **Phase 203**: Added `deepseek` provider type, `DEEPSEEK_MODELS` registry, `KETIK_PDKT_MODELS` constant, `availableModules` metadata field; removed DeepSeek from `TEXT_MODELS`.
- `apps/api/src/lib/ai-models.ts` — **Phase 203**: `MODEL_REGISTRY` combining `AI_MODELS + DEEPSEEK_MODELS`; provider lookup via registry instead of `/` check; `getModelsForModule("ketik"|"pdkt")` returns `KETIK_PDKT_MODELS`.
- `apps/api/src/lib/env.ts` / `.env.example` — **Phase 203**: Added optional `DEEPSEEK_API_KEY` environment variable.
- `apps/api/src/lib/ai-usage.ts` — **Phase 203**: Typed `provider` parameter as `AIProvider` instead of `"gemini" | "openrouter"`.
- `apps/api/src/routes/ai.ts` — **Phase 203**: Added DeepSeek routing to `generateDeepSeekContent()`.
- `apps/api/src/services/ketik/consumer-response.ts` — **Phase 203**: DeepSeek support in provider selection, system instruction, temperature, and call routing.
- `apps/api/src/services/ketik/settings-history.ts` — **Phase 203**: Uses `KETIK_PDKT_MODELS` instead of `TEXT_SIMULATION_MODELS`.
- `apps/api/src/services/pdkt/shared-utils.ts` — **Phase 203**: DeepSeek support in `callAI()` helper.
- `apps/api/src/services/pdkt/session-service.ts` — **Phase 203**: `getPdktWordCountPolicy()` relaxes word count threshold for DeepSeek.
- `apps/api/src/services/pdkt/image-generation.ts` — **Phase 203**: Uses `AIProvider` type instead of hardcoded union.
- `apps/api/src/__tests__/pdkt-email-policy.test.ts` — **Phase 203**: Updated for DeepSeek provider type compatibility.
- `apps/api/src/__tests__/pdkt-session-service.test.ts` — **Phase 203**: Tests for word count policy with DeepSeek.
- `apps/api/src/__tests__/ketik-consumer-response-service.test.ts` — **Phase 203**: Tests for DeepSeek provider routing.
- `apps/api/src/__tests__/ai-models.test.ts` — **Phase 203**: Registry and module filtering tests.
- `apps/web/src/lib/aiModels.ts` — **Phase 203**: Fallback to `KETIK_PDKT_MODELS` for KETIK/PDKT module; exports `KETIK_PDKT_MODELS`.
- `apps/web/src/lib/api/unwrap-response.ts` — **Phase 203**: Hardened content-type handling with non-JSON fallback.
- `apps/web/src/__tests__/unwrap-response.test.ts` — **Phase 203**: Tests for non-JSON content-type fallback.
- `apps/web/src/routes/ketik/components/settings/KetikSystemTab.tsx` — **Phase 203**: Uses `KETIK_PDKT_MODELS`, adds deepseek badge styling.
- `apps/web/src/routes/pdkt/components/settings/PdktSystemTab.tsx` — **Phase 203**: Uses `model.provider` for badge styling instead of brittle `/` check, adds deepseek badge.
- `apps/web/src/routes/pdkt/pdktSettings.ts` — **Phase 203**: Updated for KETIK_PDKT_MODELS.
- `apps/web/src/__tests__/ketik-settings-modal.test.tsx` — **Phase 203**: Updated for DeepSeek model assertions.
- `apps/web/src/__tests__/pdkt-settings-modal.test.tsx` — **Phase 203**: Updated for DeepSeek model assertions.
- `apps/web/src/__tests__/pdkt-settings.test.ts` — **Phase 203**: Updated for DeepSeek provider.
- `apps/api/src/services/sidak/ai-report-service.ts` — **Phase 203**: Import adjustments for type compatibility.
- `docs/modules.md` — **Phase 203**: Added "DeepSeek direct" notes for KETIK and PDKT modules.
- `docs/rebuild-logs/phase-203-deepseek-direct-provider.md` — **NEW Phase 203**: Rebuild log for DeepSeek direct provider integration.
204.  **SIDAK Forecast Submodule & Folder-Aware Filters** — Added SIDAK Forecast module (`/sidak/forecast`) with agent-level projection, lane classification (improving/declining/stable/insufficient_data), linear regression scoring, scope guard for leader roles, and forecast visibility toggle on dashboard. Added folder-aware filters across SIDAK dashboard, ranking, and forecast pages — filtering by batch/folder for more precise scope, including leader scope integration. Enhanced access-groups with subfolder support in team rule selection. Added folder ID resolution via `sidak-folder-options.ts` and `findPrimarySidakFolderByName()`. Normalized SIDAK service scope to allowed leader service. Fixed agent directory latest period selection and stale agent detail service reset. Redesigned SIDAK index page (5 cards instead of 6, added forecast card). (DONE)
- `docs/rebuild-logs/phase-204-sidak-forecast-folder-filters.md` — **NEW Phase 204**: Rebuild log for SIDAK forecast submodule & folder-aware filters.

205.  **SIDAK Agent Detail Audit Dossier Redesign** — Replaced the score-left-rail + right-stack grid on `/sidak/agents/:id` with one full-width `AgentAuditDossier` surface: compact score strip (month/status, final score `text-3xl`/`text-4xl`, horizontal progress bar, three stat cells `Sesi`/`Temuan`/`Delta`) on top, then a two-column desktop grid (`lg:grid-cols-[minmax(320px,0.42fr)_minmax(420px,0.58fr)]`) with ticket impact table (left) and root-cause coaching panel (right, larger `0.58fr`). `TopTicketsCard` and `RootCauseCard` reduced to thin presentational blocks (outer `rounded-2xl` wrappers stripped) for embedding; `ScoreDetailCard` retired (deleted). `MonthRail` visual weight reduced (smaller score text, active month via `border + bg-muted/50`). Preserved all data semantics and props; no API/hook/scoring changes. New `agent-audit-dossier.test.tsx` (5 tests); `root-cause-card.test.tsx` still passing. (DONE)
- `docs/rebuild-logs/phase-205-sidak-agent-detail-audit-dossier-redesign.md` — **NEW Phase 205**: Rebuild log for SIDAK agent detail audit dossier redesign.

206.  **SIDAK Agent Detail Trend Benchmark Comparison Table** — Added a comparison table directly below the trend chart on `/sidak/agents/:id` benchmarking the viewed agent's cumulative findings against two baselines: average agents in the same team/folder (`batch_name`, fallback `tim`) and average agents across the selected service. Scope locked to the trend chart range (`trendStartMonth`–`trendEndMonth` in the selected year). Extended `AgentDetailData` in `packages/types/src/sidak.ts` with `comparisonTable` (`AgentComparisonTable`/`AgentComparisonRow`/`AgentComparisonScope`). Backend: new `buildAgentComparisonTable()` helper in `agent-directory.ts` queries `qa_temuan` joined to `profiler_peserta!inner(id, batch_name, tim)` for the year/service/period range, tallies only countable findings via `isCountableFinding()`, cohorts by team (`batch_name`) and service (all accessible audited agents), and respects the existing leader access guard (`allowedServiceTypes` + `accessibleAgentIds` defense-in-depth filter). `getAgentDetail()` gained an `accessibleAgentIds` param threaded from `GET /agents/:id`. Frontend: new `AgentComparisonTable.tsx` (compact product table, scope line, empty state) rendered below `AgentTrendTab`. New API regression test (5 cases) + web component test (3 cases); `useAgentDetail.test.tsx` fixture updated. (DONE)
- `docs/rebuild-logs/phase-206-sidak-agent-detail-benchmark-comparison.md` — **NEW Phase 206**: Rebuild log for SIDAK agent detail trend benchmark comparison table.
- `docs/SIDAK_LOGIC_AND_SCORING.md` — Added "Trend Benchmark Comparison Table" section documenting cohort rules, scope, and per-layer file responsibilities.

| #   | Route                        | Page Type    | Notes                                                                               |
| --- | ---------------------------- | ------------ | ----------------------------------------------------------------------------------- |
| 1   | `/`                          | Landing      | Hero, stats, modules showcase, benefits                                             |
| 2   | `/dashboard`                 | Overview     | Recharts charts, KPI cards, module grid                                             |
| 3   | `/sidak`                     | Landing      | 5 card links                                                                        |
| 4   | `/sidak/dashboard`           | QA Dashboard | 4 metric cards, bar charts, top agents                                              |
| 5   | `/sidak/forecast`            | Workbench    | Proyeksi tren layanan & lane agent (improving/declining/stable)                     |
| 6   | `/sidak/input`               | Form         | Multi-step audit input + Excel                                                      |
| 7   | `/sidak/ranking`             | Table        | Agent ranking sorted by defects                                                     |
| 8   | `/sidak/settings`            | CRUD         | Service weights configuration                                                       |
| 9   | `/sidak/periods`             | Manager      | Create/view audit periods                                                           |
| 10  | `/sidak/agents`              | Directory    | Searchable agent list                                                               |
| 11  | `/sidak/agents/$id`          | Detail       | Per-service pills, separate trend chart per service, score badges in temuan history |
| 12  | `/ketik`                     | Landing      | Chat simulation intro                                                               |
| 13  | `/ketik/simulation`          | Chat UI      | Scenario selection + chat interface                                                 |
| 14  | `/ketik/history`             | Placeholder  | Session history                                                                     |
| 15  | `/pdkt`                      | Landing      | Email simulation intro                                                              |
| 16  | `/pdkt/simulation`           | Email UI     | Scenario + inbound email + evaluate                                                 |
| 17  | `/pdkt/history`              | Placeholder  | Session history                                                                     |
| 18  | `/telefun`                   | Voice UI     | WebSocket-based call simulation                                                     |
| 19  | `/monitoring`                | Dashboard    | AI usage + pricing management                                                       |
| 20  | `/account`                   | Settings     | Edit name + change password                                                         |
| 21  | `/profiler`                  | Landing      | Year/folder sidebar + action tiles                                                  |
| 22  | `/profiler/table`            | Table        | Search/filter/edit participant data                                                 |
| 23  | `/profiler/slides`           | Slides       | Slide view per participant                                                          |
| 24  | `/profiler/analytics`        | Charts       | Recharts analytics (4 charts)                                                       |
| 25  | `/profiler/export`           | Export       | Excel/CSV export                                                                    |
| 26  | `/profiler/add`              | Form         | Manual participant input                                                            |
| 27  | `/profiler/import`           | Import       | Excel template + upload + results                                                   |
| 28  | `/profiler/teams`            | CRUD         | Custom team management                                                              |
| 29  | `/sidak/reports`             | Landing      | Data vs AI report selection                                                         |
| 30  | `/sidak/reports-data`        | Table        | Filter form + temuan table + Excel export                                           |
| 31  | `/sidak/reports-ai`          | Form         | AI-powered report generation                                                        |
| 32  | `/waiting-approval`          | Auth         | Status polling page                                                                 |
| 33  | `/reset-password`            | Auth         | Password recovery form                                                              |
| 34  | `/dashboard/users`           | Table        | User status/role management, password reset, soft delete                            |
| 35  | `/dashboard/access-groups`   | Builder      | Dynamic access data rule scopes builder for leaders                                 |
| 36  | `/dashboard/access-approval` | Action       | Assign access groups and approve leader requests                                    |
| 37  | `/dashboard/activities`      | Table        | System-wide audit logs with CSV export                                              |
| 38  | `/unauthorized`              | Error        | 403 role-denied page                                                                |
| 39  | 404                          | Catch-all    | Custom not-found page                                                               |

## API Endpoints Reference (apps/api)

| Prefix             | Endpoints    | Service                                                                                                                                                                                                                     |
| ------------------ | ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/api/v1/sidak`    | 19 endpoints | `routes/sidak/` — 6 sub-modules (core, dashboard, forecast, temuan, rule-versions, reports)                                                                                                                                  |
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
