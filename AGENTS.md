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

## Superpowers Skills

Selalu panggil `Skill` tool jika ada kemungkinan skill relevan (brainstorming, writing-plans, TDD, dll). Ikuti workflow secara disiplin.

## Commands (Monorepo)

Project ini menggunakan **pnpm** dan **Turborepo**.

- **Install:** `pnpm install`
- **Dev:** `pnpm dev` (Menjalankan web, api, dan telefun secara paralel)
- **Build:** `pnpm build`
- **Lint:** `pnpm lint`
- **Test:** `pnpm test` (vitest — 62 tests covering scoring, sidak-service, profiler-service)
- **Test (api only):** `pnpm --filter @trainers/api test`
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

## Golden Rules

### 1. FCP/LCP Wajib Dipertimbangkan di Setiap Build
- **Reference-repo (Next.js)** memiliki masalah FCP (First Contentful Paint) dan LCP (Largest Contentful Paint) yang memberatkan aplikasi karena bundle besar dan SSR overhead.
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

### 5. Selalu Referensi Context7 untuk Dokumentasi
Sebelum mengimplementasikan fitur yang menggunakan library eksternal (Supabase, Hono, Zod, TanStack, dsb), **WAJIB** gunakan tool `context7` (via MCP server `@upstash/context7-mcp`) untuk mengecek dokumentasi terbaru. Alur:
   1. Panggil `resolve-library-id` dulu untuk mendapatkan library ID (format: `/org/project`).
   2. Panggil `query-docs` dengan library ID tersebut untuk ambil dokumentasi.
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

## Relevant Files
- `opencode.json` — project-level opencode config with context7 MCP
- `supabase/migrations/` — DB schemas (001 SIDAK, 002 KETIK/PDKT/AI, 003 Telefun)
- `apps/api/src/lib/` — scoring, ai-models, ai-usage, gemini, openrouter
- `apps/api/src/services/` — sidak-service, ketik-service, pdkt-service, **profiler-service**
- `apps/api/src/routes/` — Hono endpoints (sidak, ketik, pdkt, ai, **profiler**)
- `apps/telefun/src/` — WebSocket proxy server (server, auth, usage, env)
- `apps/web/src/router.tsx` — centralized TanStack Router v1 routes (33 routes, all React.lazy())
- `apps/web/src/lib/excel-utils.ts` — Excel template gen, parse, validate
- `apps/web/src/lib/app-config.ts` — APP_MODULES definitions with accent colors/icons
- `apps/web/src/lib/profilerService.ts` — typed Profiler API client
- `apps/web/src/routes/` — page components per module (including `profiler/` with 8 sub-routes)
- `apps/web/src/hooks/useQueryParams.ts` — search params helper for TanStack Router v1
- `packages/types/src/index.ts` — all shared Zod schemas & TS interfaces (including Profiler types)
- `apps/web/src/components/Layout.tsx` — sidebar, SIDAK submenu, Suspense boundary for lazy routes
- `apps/web/src/lib/excel-utils.ts` — Excel template gen, parse, validate (dynamic xlsx/exceljs import)
- `docs/rebuild-logs/` — per-phase completion logs (phase-1 through phase-13)

## Routes Reference (apps/web)

| # | Route | Page Type | Notes |
|---|-------|-----------|-------|
| 1 | `/` | Landing | Hero, stats, modules showcase, benefits |
| 2 | `/dashboard` | Overview | Recharts charts, KPI cards, module grid |
| 3 | `/sidak` | Landing | 6 card links |
| 4 | `/sidak/dashboard` | QA Dashboard | 4 metric cards, bar charts, top agents |
| 5 | `/sidak/input` | Form | Multi-step audit input + Excel |
| 6 | `/sidak/ranking` | Table | Agent ranking sorted by defects |
| 7 | `/sidak/settings` | CRUD | Service weights configuration |
| 8 | `/sidak/periods` | Manager | Create/view audit periods |
| 9 | `/sidak/agents` | Directory | Searchable agent list |
| 10 | `/sidak/agents/$id` | Detail | Score history + findings table |
| 11 | `/ketik` | Landing | Chat simulation intro |
| 12 | `/ketik/simulation` | Chat UI | Scenario selection + chat interface |
| 13 | `/ketik/history` | Placeholder | Session history |
| 14 | `/pdkt` | Landing | Email simulation intro |
| 15 | `/pdkt/simulation` | Email UI | Scenario + inbound email + evaluate |
| 16 | `/pdkt/history` | Placeholder | Session history |
| 17 | `/telefun` | Voice UI | WebSocket-based call simulation |
| 18 | `/monitoring` | Dashboard | AI usage + pricing management |
| 19 | `/account` | Settings | Edit name + change password |
| 20 | `/profiler` | Landing | Year/folder sidebar + action tiles |
| 21 | `/profiler/table` | Table | Search/filter/edit participant data |
| 22 | `/profiler/slides` | Slides | Slide view per participant |
| 23 | `/profiler/analytics` | Charts | Recharts analytics (4 charts) |
| 24 | `/profiler/export` | Export | Excel/CSV export |
| 25 | `/profiler/add` | Form | Manual participant input |
| 26 | `/profiler/import` | Import | Excel template + upload + results |
| 27 | `/profiler/teams` | CRUD | Custom team management |
| 28 | `/sidak/reports` | Landing | Data vs AI report selection |
| 29 | `/sidak/reports-data` | Table | Filter form + temuan table + Excel export |
| 30 | `/sidak/reports-ai` | Form | AI-powered report generation |
| 31 | `/waiting-approval` | Auth | Status polling page |
| 32 | `/reset-password` | Auth | Password recovery form |
| 33 | 404 | Catch-all | Custom not-found page |

## API Endpoints Reference (apps/api)

| Prefix | Endpoints | Service |
|--------|-----------|---------|
| `/api/v1/sidak` | 15 endpoints | `sidak-service.ts` |
| `/api/v1/ketik` | 4 endpoints | `ketik-service.ts` |
| `/api/v1/pdkt` | 6 endpoints | `pdkt-service.ts` |
| `/api/v1/ai` | 7 endpoints | — |
| `/api/v1/profiler` | 18 endpoints | `profiler-service.ts` |
