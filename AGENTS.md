# AGENTS.md - Trainers SuperApp Rebuild

## MCP Servers

- **supabase-mcp-server** - Gunakan untuk query data Supabase dan operasi database.
- **shadcn** - Gunakan untuk mencari dan menginstall komponen shadcn/ui. Selalu cek registry sebelum membuat komponen custom.
- **context7** - (Placeholder) Gunakan untuk fetch dokumentasi terbaru (Supabase, Hono, dll). Membutuhkan API Key yang akan ditambahkan nanti.

## Subagent Usage

- Gunakan subagent untuk tugas yang memerlukan eksplorasi codebase mendalam atau riset multi-step.
- Berikan instruksi yang spesifik tentang arsitektur monorepo (apps/web, apps/api, packages/types).

## Superpowers Skills

Selalu panggil `Skill` tool jika ada kemungkinan skill relevan (brainstorming, writing-plans, TDD, dll). Ikuti workflow secara disiplin.

## Commands (Monorepo)

Project ini menggunakan **pnpm** dan **Turborepo**.

- **Install:** `pnpm install`
- **Dev:** `pnpm dev` (Menjalankan web dan api secara paralel)
- **Build:** `pnpm build`
- **Lint:** `pnpm lint`
- **Format:** `pnpm format`

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

### 1. Dokumentasi Wajib Update Sebelum Commit
Setiap perubahan behavior, arsitektur, atau fitur baru wajib diiringi update docs di folder `docs/` atau update `AGENTS.md` / `GEMINI.md` jika ada konvensi baru.

### 2. Dokumentasi Ramah Awam (Human-Readable)
Pastikan README dan panduan modul mudah dipahami oleh pembaca non-teknis.

### 3. File Editing Harus Pakai Unified Diff
Baca file terbaru, buat patch minimal, dan terapkan. Hindari overwrite penuh jika tidak perlu.

## Specialized Sub-Agents

- **SIDAK-Auditor**: Fokus pada audit logic SIDAK dari `reference-repo` ke `apps/api`. Pastikan validasi indicator_id dan service_type ketat sebelum insert.
- **AI-Usage-Guard**: Memastikan setiap modul AI (KETIK, PDKT, Telefun) melakukan logging usage secara konsisten melalui service backend.

## Environment Variables

- **Frontend (`apps/web`)**: Menggunakan prefix `VITE_` (e.g., `VITE_SUPABASE_URL`).
- **Backend (`apps/api`)**: Menggunakan variabel langsung (e.g., `SUPABASE_SERVICE_ROLE_KEY`, `GEMINI_API_KEY`).
- File `.env.local` di root diabaikan oleh git, tapi isinya harus disinkronkan ke masing-masing apps jika diperlukan (atau load dari root).

## Phase 1 - 10 Priorities (Reminder)
1. Monorepo Foundation (DONE)
2. Auth & Layout
3. SIDAK Core
4. Upload Excel SIDAK
5. AI Usage Logging
6. KETIK & PDKT
7. Report AI
8. Telefun WS
9. Hardening
10. Deployment
