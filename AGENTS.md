# AGENTS.md — Trainers SuperApp Rebuild

Pedoman pengembangan untuk AI agent. Semua aturan aktif, konvensi teknis, dan referensi operasional.

---

## 1. Instruksi & Workflow

Ikuti hierarki instruksi dan urutan kerja di [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md).

- **Task user terbaru + spec/plan approved** adalah prioritas operasional.
- **Wiki hanya untuk discovery** — jangan sebagai source of truth.
- **Canonical docs** di `docs/` adalah acuan arsitektur, kontrak, dan desain.
- **Implementation reality** (code, schema, test, git state) adalah kebenaran aktual.
- Bandingkan semua sumber; material konflik → klarifikasi. Jika stale side jelas dari evidence, fix dan sync tanpa bertanya.

---

## 2. MCP & Tool Rules

- **context7**: Wajib dipanggil SEBELUM implementasi library eksternal. `resolve-library-id` → `query-docs`. API key di `.env.local` sebagai `CONTEXT7_API_KEY`.
- **Supabase MCP**: Query database dan operasi Supabase.
- **shadcn**: Cek registry sebelum membuat komponen custom.
- **Graphify**: Knowledge graph di `graphify-out/`. WAJIB query sebelum planning/eksekusi:
  - `graphify query "arsitektur modul X"` / `graphify explain "KonsepY"`
  - `graphify path "ModuleA" "ModuleB"` untuk relasi antar modul
  - Setelah modifikasi kode, jalankan `graphify update .` (AST-only, gratis)
  - Prioritas: graphify query > `GRAPH_REPORT.md` > grep manual
  - Jangan skip karena dirty files (normal setelah hooks/update)
  - Subagent via Task tool WAJIB sertakan instruksi: "Gunakan graphify dulu untuk referensi codebase."

---

## 3. Agent & Subagent Execution

- **Superpower Skill** (`general`) — default untuk eksplorasi, implementasi, debugging, testing.
- **ECC specialized agents**: planner (kompleks/refactoring), tdd-guide (bug/fitur baru), architect (system design), code-reviewer (post-code), security-reviewer, build-error-resolver, docs-lookup (Context7), loop-operator.
- Instruksi ke subagent WAJIB sertakan konteks monorepo (`apps/web`, `apps/api`, `packages/types`).

### Kode — Wajib Semua Perubahan Kode Non-Docs

- **Thermo Nuclear Code Quality Review** (`thermo-nuclear-code-quality-review`) — Quality gate: WAJIB di-load/dijalankan **setelah implementasi** (dan setelah UI audit bila berlaku), **sebelum verifikasi final/PR** untuk setiap perubahan kode.
- Temuan material (bug, security flaw, arsitektur salah) WAJIB diperbaiki, lalu review/check terkait diulang. Docs-only/config sederhana boleh skip.

### UI/UX — Wajib Semua Perubahan Tampilan

Dua skill saling melengkapi:

- **UI/UX Pro Max** (`ui-ux-pro-max`) — Referensi design: cari style, palette, font, guideline sebelum memulai fitur UI baru.
- **Impeccable** (`impeccable`) — Quality checker: `audit`/`polish` wajib sebelum PR dengan perubahan UI. Hooks auto-run setelah edit file UI — perhatikan outputnya.

Urutan: UI/UX Pro Max → Coding → Impeccable audit/polish → critique jika perlu.
Agent WAJIB load/use skill `ui-ux-pro-max` dan `impeccable` by name (`skill_view`) lalu ikuti instruksi masing-masing.

### Specialized Sub-Agents

- **SIDAK-Auditor**: Audit logic SIDAK dari `reference-repo` ke `apps/api`. Validasi `indicator_id` dan `service_type` ketat.
- **AI-Usage-Guard**: Pastikan setiap modul AI (KETIK, PDKT, Telefun) melakukan logging usage via service backend.

Panggil via Superpower Skill dengan instruksi spesifik, atau via ECC agent untuk audit mendalam.

---

## 4. Quick Reference

### Essential Commands (pnpm + Turborepo)

| Perintah                           | Kegunaan                                          |
| ---------------------------------- | ------------------------------------------------- |
| `pnpm install`                     | Install dependencies (CI: `CI=true pnpm install`) |
| `pnpm dev`                         | Jalankan web, api, telefun paralel                |
| `pnpm build`                       | Build production                                  |
| `pnpm lint`                        | ESLint 9 flat config (`eslint.config.mjs` root)   |
| `pnpm format`                      | Prettier                                          |
| `pnpm test:targeted`               | 10-30s — development (`vitest --changed`)         |
| `pnpm test:core`                   | 30-60s — kontrak kritis lintas modul (pre-push)   |
| `pnpm test:fast`                   | 1-2min — unit test ringan (pre-merge)             |
| `pnpm test`                        | ~5min — full suite (CI/release)                   |
| `pnpm --filter @trainers/api test` | API only                                          |
| `pnpm --filter @trainers/web test` | Web only                                          |

Untuk semua commands dan test tier detail, lihat [`docs/README.md`](docs/README.md).

### Risk-Based Testing Policy

**Wajib test baru:** behavior change, bug fix (regression test), security/permission, schema/migration, API contract.

**Tidak wajib:** refactor tanpa behavior change, UI kosmetik, dokumentasi, konfigurasi sederhana.

### Pre-Push & Pre-Merge Gates

**Pre-Push (scope-based):** `git status` + checks sesuai scope. Product/behavior/security/API/schema → `pnpm lint` (0) → `pnpm build` (0) → `pnpm test:core` (lulus). Docs/config-only → targeted checks; `test:core` tidak wajib. Gagal → **HENTIKAN**, informasikan user.

**Pre-Merge/Release (product/behavior only):** Sebelum merge/release jalankan `pnpm test` atau `pnpm test:full`. Docs/config-only skip.

### Monorepo Structure

`apps/web` (Vite+React SPA), `apps/api` (Hono backend), `apps/telefun` (WebSocket proxy), `packages/types` (shared Zod), `reference-repo/` (legacy Next.js). Backend-First — semua business logic di backend services. Lihat [`docs/architecture.md`](docs/architecture.md) untuk detail.

### Environment Variables

Frontend prefix `VITE_`, backend/telefun langsung. MCP key di `.env.local`. Lihat [`.env.example`](.env.example) + `docs/architecture.md`.

### AI Integration

- **Model registry**: `apps/api/src/lib/ai-models.ts` — source of truth untuk ID model dan provider. Jangan hardcode.
- **Usage logging**: Semua AI calls dicatat ke `ai_usage_logs` via `logAiUsage()` dengan `UsageContext` + `userId`. Jika pricing model tidak ada, catat token dengan cost 0.
- **Provider routing**: `resolveModelProvider()` via registry lookup (gemini, openrouter, deepseek).
- **Error handling**: Ekstraksi teks defensif — jangan asumsikan `response.text` stabil. OpenRouter retry 4× dengan backoff. Gemini fallback jika `developer instruction not enabled`.
- **RPC Migration selesai**: Gunakan `fetchApi` dari `hooks/useApi` atau Hono RPC. Jangan gunakan `getApi`/`postApi`/`putApi`/`deleteApi`.

### FFmpeg (Telefun Recording)

WAJIB tersedia di container Railway Telefun via `RAILPACK_DEPLOY_APT_PACKAGES=ffmpeg`. Lihat [`docs/deployment.md`](docs/deployment.md).

### Routes / API

Frontend routes: `apps/web/src/router.tsx` (TanStack Router v1, lazy loaded). API endpoints: `apps/api/src/routes/` (Hono). Lihat `docs/architecture.md` untuk overview.

### Phase History

Riwayat lengkap fase pengembangan: [`docs/PHASE_PROGRESS.md`](docs/PHASE_PROGRESS.md).

---

## 5. Golden Rules

### 1. FCP/LCP — Wajib Dipertimbangkan Setiap Build

Code splitting & lazy loading sudah diterapkan (semua route `React.lazy()`) — jangan regresi. Hindari static import library besar (Recharts >300 kB, ExcelJS >400 kB) — gunakan dynamic import. Jika chunk >200 kB non-vendor, pertimbangkan split (`manualChunks`). Tambahkan `modulepreload`, `preconnect`, `dns-prefetch` di `index.html`. Optimasi gambar/font besar. Cek bundle impact setiap library baru.

### 2. Dokumentasi Update Sebelum Commit

Setiap perubahan behavior, arsitektur, atau fitur baru wajib update `docs/` atau `AGENTS.md` / `GEMINI.md`.

### 3. Dokumentasi Ramah Awam

README dan panduan modul mudah dipahami non-teknis.

### 4. File Editing Pakai Unified Diff

Baca file terbaru, buat patch minimal, terapkan. Hindari overwrite penuh jika tidak perlu.

### 5. Spec-Driven Development (SDD)

1. Tulis spec: tujuan, acceptance criteria, edge cases, constraint teknis.
2. Buat plan implementasi (lihat #6) sebelum coding.
3. Jangan coding sebelum plan diverifikasi / disetujui.

### 6. Plan Wajib di `plan/`

Wajib: `plan/markdown/<fitur>.md` (heading, tabel, checklist, code block). HTML opsional di `plan/html/<fitur>.html` hanya jika ada perubahan visual signifikan.
Setiap plan WAJIB berisi:

1. **Requirement** — Tujuan, AC, edge cases, constraint teknis, spec references.
2. **Design** — Arsitektur, data flow, component tree, interface changes, keputusan teknis.
3. **Tasklist** — Langkah detail, file affected, test strategy, estimasi, dependencies, risk register, rollback plan.

### 7. Agent Workflow — Wajib Diikuti

Agent WAJIB mengikuti urutan di [`docs/AGENT_WORKFLOW.md`](docs/AGENT_WORKFLOW.md):

1. Baca instruction hierarchy applicable (system/platform/developer/repo/user/task).
2. Baca task user terbaru + spec/plan approved.
3. Wiki hanya untuk discovery — bukan source of truth.
4. Baca canonical docs relevan di `docs/`.
5. Inspeksi kode aktual: types, schema, migration, test, config, git state.
6. Bandingkan semua sumber; klarifikasi hanya jika konflik material/ambigu. Jika stale side jelas dari evidence, fix dan sync.
7. Implementasi: test-first untuk behavior/business/security/API/schema; risk-based untuk docs/config-only.
8. Update `docs/` dulu, baru Wiki jika perlu.

### 8. Test Sebelum Push

Ikuti Pre-Push & Pre-Merge Gates di §4. `test:core` wajib untuk product/behavior/security/API/schema; docs/config-only tidak wajib. Gagal → **HENTIKAN**, informasikan user.

### 9. Context7 + ECC untuk Dokumentasi Library

Sebelum implementasi library eksternal: Context7 `resolve-library-id` → `query-docs` (wajib, lihat §2). ECC docs-lookup/Superpower boleh dipakai sebagai pelengkap, bukan alternatif pengganti. Hindari API deprecated.

### 10. Referensi `docs/design.md` untuk Setiap Perubahan UI/UX

WAJIB baca `docs/design.md` sebelum ngoding UI:

1. **Color Palette**: CSS variables (`--bg`, `--surface`, `--border`, `--fg`, `--fg2`, `--fg3`, `--inv-bg`, `--inv-fg`). Jangan hardcode hex/arbitrary.
2. **Typography**: Outfit (heading, weight 700-900), Inter (body, weight 400-600).
3. **Spacing & Layout**: Konsisten (gap-3/4, p-5, dll). Hindari padding/margin tidak proporsional.
4. **Komponen**: Glassmorphism card, border tegas, ikon minimalis, hover state halus.
5. **No AI Slop**: Dilarang dekorasi tidak bermakna (badge ornamental, gradien berlebihan, floating blobs, neon colors) — kecuali diinstruksikan eksplisit.

Cek ulang setelah selesai. Kegagalan mematuhi → redesign.

---

## 6. Development Conventions

- **Arsitektur**: Monorepo Backend-First. Semua business logic di backend services.
- **Type Safety**: Hono RPC (`hc<AppType>`) untuk full type-safety FE↔BE.
- **Supabase Hybrid Client**: User JWT (default, hormati RLS) / Admin Service Role (backend-only untuk AI logging, background jobs, reports). **NEVER** query data sensitif langsung dari frontend.
- **Error Handling**: Jangan expose error database mentah ke user. Berikan pesan manusiawi.
- **Linting**: ESLint 9 flat config (`eslint.config.mjs` root). `typescript-eslint` recommended, `react-hooks`, `react-refresh`. Unused vars prefix `_` (warning). `no-explicit-any` dimatikan. Format via Prettier (`pnpm format`).
- **Scope dokumentasi**: Hanya `docs/`, `AGENTS.md`, dan Wiki yang boleh disentuh untuk perubahan dokumentasi/instruksi. Jangan modifikasi product code, tests, config, migrasi, plans, package files, commit, atau push tanpa otorisasi eksplisit. Jangan expose secret/credentials.
- **Docs + Wiki sync**: Setelah update docs, sync ke Wiki jika summary/navigasi/public contract Wiki terpengaruh.
