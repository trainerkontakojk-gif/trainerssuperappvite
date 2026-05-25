# Trainers SuperApp

SuperApp untuk trainer dengan modul **SIDAK (QA Analyzer)**, **KETIK (Chat Simulation)**, **PDKT (Email Simulation)**, **Telefun (Voice Simulation)**, **Profiler (KTP)**, dan **Dashboard Admin**.

## Tech Stack

- **Frontend:** Vite + React + TanStack Router + Tailwind CSS v4
- **Backend:** Hono API (TypeScript)
- **Database:** Supabase (PostgreSQL 17) + RLS
- **WebSocket:** Telefun Server (persistent WS)
- **Build:** pnpm + Turborepo (monorepo)
- **Testing:** Vitest (277+ API tests, 121+ web tests)

## Struktur Monorepo

```
apps/
  api/          Backend Hono API (validasi, business logic, AI, DB mutations)
  web/          Frontend Vite + React (UI, interaksi, route-based code splitting)
  telefun/      WebSocket service untuk voice simulation
packages/
  types/        Shared Zod schemas + TypeScript interfaces
supabase/
  migrations/   Database schema (17 migration files, fully idempotent)
scripts/
  database-parity/  Script untuk sinkronisasi data legacy → target
docs/
  rebuild-logs/  Log per-phase (phase 1–38)
  database.md    Dokumentasi schema & security
```

## Modul

| Modul | Deskripsi | Routes |
|-------|-----------|--------|
| **Dashboard** | Overview, user management, access groups, activity logs | `/dashboard`, `/dashboard/*` |
| **SIDAK** | QA Analyzer: audit input, ranking, dashboard, settings, reports AI | `/sidak`, `/sidak/*` |
| **KETIK** | Chat simulation + AI review | `/ketik`, `/ketik/*` |
| **PDKT** | Email simulation + AI evaluation | `/pdkt`, `/pdkt/*` |
| **Telefun** | Voice call simulation via WebSocket | `/telefun` |
| **Profiler** | Participant data management (add, import, table, slides, analytics, export) | `/profiler`, `/profiler/*` |
| **Monitoring** | AI usage history, pricing management | `/monitoring` |
| **Account** | Profile settings, change password | `/account` |

## Memulai

```bash
pnpm install
pnpm dev          # menjalankan web + api + telefun
pnpm build        # build production
pnpm test         # jalankan semua test
pnpm lint         # ESLint
```

## Environment Variables

### Frontend (`apps/web`)
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`
- `VITE_TELEFUN_WS_URL`

### Backend (`apps/api`)
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `OPENROUTER_API_KEY`

### Database Sync Scripts
Copy `.env.migration` template dan isi `OLD_DB_URL` / `NEW_DB_URL`.

## Migration Database

```bash
# Sync May qa_temuan (dry-run dulu)
node scripts/database-parity/sidak-may-incremental-sync.mjs
node scripts/database-parity/sidak-may-incremental-sync.mjs --apply

# Verifikasi post-sync
node scripts/database-parity/sidak-post-sync-verify.mjs --check-mv

# Backfill dashboard summaries
node scripts/database-parity/sidak-post-sync-verify.mjs --refresh-summaries
```

## Dokumentasi

- `docs/database.md` — Schema, RLS policies, security model
- `docs/checklist-audit-trainers-superapp.md` — Legacy parity audit checklist
- `docs/rebuild-logs/` — Per-phase implementation logs

## License

Private
