# Trainers SuperApp Rebuild - Gemini CLI Instructions

This project is a complete rebuild of the Trainers SuperApp, transitioning from a legacy Next.js codebase to a modern, lightweight Turborepo monorepo.

## Project Overview

- **Architecture:** Turborepo Monorepo with `pnpm` workspaces.
- **Backend (`apps/api`):** Hono + TypeScript. Serves as the central logic hub.
- **Frontend (`apps/web`):** Vite + React + TypeScript + TanStack Router/Query.
- **Real-time (`apps/telefun`):** Dedicated WebSocket service for persistent voice/chat simulations.
- **Database/Auth:** Supabase Postgres & Auth.
- **Type Safety:** Hono RPC provides end-to-end type safety between Backend and Frontend.

## Building and Running

This project uses `pnpm` and `turbo`.

- **Install Dependencies:** `pnpm install`
- **Development Mode:** `pnpm dev` (Runs all apps in parallel)
- **Build All:** `pnpm build`
- **Lint All:** `pnpm lint` (ESLint 9 flat config — `eslint.config.mjs` di root)
- **Lint (single workspace):** `pnpm --filter @trainers/web lint`
- **Format Code:** `pnpm format`
- **Test All:** `pnpm test` (92 tests — API services + frontend hooks/components)
- **Test API:** `pnpm --filter @trainers/api test`
- **Test Web:** `pnpm --filter @trainers/web test`

## Development Conventions

### 1. Monorepo Structure
- **Tooling:** Use `context7` MCP (via `@upstash/context7-mcp`, configured in `opencode.json`) for documentation lookup and code search before executing tasks.
  - Panggil `resolve-library-id` dulu, lalu `query-docs` untuk dokumentasi terbaru.
- `apps/api`: All business logic, AI integrations, and database mutations.
- `apps/web`: Lean UI, consumes the Hono API.
- `apps/telefun`: Dedicated WebSocket proxy server for Gemini Live voice calls.
- `packages/types`: Shared Zod schemas and TypeScript interfaces.
- `reference-repo/`: The legacy Next.js project (READ-ONLY) used for business logic reference.

### 2. Linting & Formatting
- **ESLint 9 flat config** (`eslint.config.mjs` di root) — berlaku untuk semua workspace.
  - TypeScript recommended rules, React hooks recommended (kecuali `set-state-in-effect` dimatikan), React Refresh.
  - `@typescript-eslint/no-explicit-any`: off.
  - `@typescript-eslint/no-unused-vars`: warn, dengan allow pattern `^_`.
  - Test files otomatis mendapat globals vitest.
  - React-specific rules hanya untuk `apps/web`; Node globals untuk `apps/api` + `apps/telefun`.
- **Prettier** (`pnpm format`) untuk formatting code.

### 3. Backend-First Logic
- **NEVER** query Supabase directly from the frontend for sensitive data (SIDAK, AI Usage, Reports).
- **ALWAYS** route through Hono. Hono validates the Supabase JWT and enforces permissions.
- Use the **Hybrid Supabase Client** pattern:
  - Default: Use user's JWT to respect RLS.
  - Service Role: Only for background jobs, AI usage logging, and complex reporting aggregations.

### 3. Type Safety (Hono RPC)
- Define routes in `apps/api/src/index.ts` (or modular routes).
- Export `AppType` from the API.
- Consume via `hc<AppType>` in the Web app for full auto-completion and type checking.

### 4. AI & Usage
- All AI calls (Gemini/OpenRouter) must be logged via the backend to the `ai_usage_logs` table.
- Use `packages/types` to ensure consistent logging formats.

### 5. Reference Auditing
- Before implementing a feature, audit the corresponding logic in `reference-repo/app/(main)/...`.
- Do not copy-paste. Extract the business logic and reimplement it cleanly in the new stack.

### 6. FCP/LCP Performance Awareness
- **Reference-repo (Next.js)** memiliki masalah FCP (First Contentful Paint) dan LCP (Largest Contentful Paint) yang memberatkan aplikasi karena bundle besar dan SSR overhead.
- **Build kedepan WAJIB** mempertimbangkan FCP/LCP, disesuaikan dengan arsitektur Vite + React SPA:
  - Code splitting & lazy loading sudah diterapkan — jangan regresi saat menambah route baru.
  - Hindari static import library besar (Recharts >300 kB, ExcelJS/xlsx >400 kB) di komponen yang tidak selalu dikunjungi. Gunakan dynamic import.
  - Perhatikan ukuran bundle per-chunk. Jika ada chunk >200 kB yang bukan vendor stabil, pertimbangkan split lanjutan (`manualChunks`).
  - Tambahkan resource hints (`modulepreload`, `preconnect`, `dns-prefetch`) di `index.html` untuk mempercepat discovery chunk kritis.
  - Jangan tambahkan gambar/font besar tanpa optimasi (lazy loading, compression, responsive images via `srcset`).
  - Jika menambah library baru, selalu cek bundle impact-nya. Library ringan > library populer tapi berat.

### 7. Spec-Driven Development Wajib
Setiap memulai pekerjaan baru (fitur, bug fix, refactor), WAJIB menerapkan **Spec-Driven Development (SDD)**:
1. Tulis spec terlebih dahulu: tujuan, acceptance criteria, edge cases, dan constraint teknis.
2. Buat plan implementasi dalam 2 format (lihat aturan #8) sebelum menulis kode.
3. Jangan memulai coding sebelum plan diverifikasi / disetujui.

### 8. Plan Wajib Dibuat dalam 2 Format
Setiap plan implementasi WAJIB dibuat dalam 2 format dan disimpan di folder `plan/`:
- **Format HTML** (nama file: `plan-<nama-fitur>.html`) — Untuk dibaca manusia. Styling HTML + CSS inline agar mudah dibuka di browser. Sertakan: tujuan, langkah-langkah, timeline, dependensi, risk register.
- **Format Markdown** (nama file: `plan-<nama-fitur>.md`) — Untuk dibaca AI agent. Gunakan heading, tabel, checklist, code block. Sertakan: spec references, file affected, test strategy, rollback plan.

### 9. Always Use Context7 for Documentation
- **MANDATORY:** Always use the `context7` MCP tool (`@upstash/context7-mcp`) to fetch the latest documentation for Supabase, Hono, TanStack, and other libraries before writing code.
- Workflow: `resolve-library-id` → cari library → `query-docs` dengan library ID untuk ambil dokumentasi terbaru.
- API key disimpan di `.env.local` sebagai `CONTEXT7_API_KEY`.
- This ensures usage of current APIs and avoids hallucinating deprecated patterns from old training data.

## Phase Progress
- **Done:** Monorepo Foundation, Auth & Layout, SIDAK Core, KETIK & PDKT, Report AI (Monitoring), Upload Excel SIDAK, Telefun WS, Hardening, Deployment, Frontend Matching & Profiler Module, SIDAK Reports, Polish & QA, Code Splitting/Perf, Testing (API + Frontend), Admin Parity, Dashboard Parity, KETIK Carbon Copy, PDKT Carbon Copy, Frontend Checklist Fixes (P0-P2)

## Key Documentation
- `prd.md`: Original project requirements.
- `docs/rebuild-logs/`: Per-phase completion logs (phase-1 through phase-16).
- `docs/superpowers/specs/`: Detailed architecture and design specs.
- `docs/checklist-audit-trainers-superapp.md`: Frontend/Backend audit checklist (sections 1.1-1.8 updated through phase 19).
- `docs/rebuild-logs/phase-12-polish-qa.md`: Loading states, empty states, error handling improvements.
- `docs/rebuild-logs/phase-13-perf.md`: Code splitting, lazy loading, bundle size reduction.
- `docs/rebuild-logs/phase-14-testing.md`: Vitest unit tests (92 tests across API services + frontend).
- `docs/rebuild-logs/phase-15-admin-parity.md`: Replicating Admin user and group management tools.
- `docs/rebuild-logs/phase-16-dashboard-parity.md`: Integrating live dashboard QA trends and activity logs.
- `docs/rebuild-logs/phase-17-ketik-carbon-copy.md`: KETIK module parity with legacy (mailbox, settings, evaluation, tests).
- `docs/rebuild-logs/phase-18-pdkt-carbon-copy.md`: PDKT module parity with legacy (mailbox, AI template, settings, tests).
- `docs/rebuild-logs/phase-19-frontend-checklist.md`: Frontend checklist fixes — toast, route guards, pagination, transcript export, draft autosave, Telefun settings, QA parameter versioning.
- `docs/superpowers/plans/`: Step-by-step implementation plans.
