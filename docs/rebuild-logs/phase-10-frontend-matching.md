# Phase 10 — Frontend Matching & Profiler Module

## What was implemented

### 1. Frontend Enhancement (Matching Reference Repo)

**Auth Pages:**

- `/waiting-approval` — Polling page checks profile status every 60s, auto-redirects on approval
- `/reset-password` — Password reset form with `PASSWORD_RECOVERY` event listener, 5s timeout validation
- `/not-found` — Custom 404 page with back-to-home link

**Account Page:**

- `/account` — Edit display name (updates `profiles` table) + change password via Supabase Auth

**Dashboard Enhancement:**

- Recharts integration — Bar chart (trend temuan 6 bulan), horizontal bar (skor per layanan), pie chart (distribusi critical/non-critical), line chart (tren skor bulanan)
- KPI cards (Total Agen, Total Temuan, Rata-rata Skor, Audit Aktif)
- Module showcase grid with 6 modules
- Management shortcuts

**Landing Page:**

- Hero section with tagline, description, CTA
- Stats bar (5 Modul Utama, Tim internal, Siap Pakai)
- 5-module showcase cards
- Benefits section (4 cards)
- Footer CTA + footer

**Layout Enhancement:**

- SIDAK submenu dropdown (7 child links: Beranda, Dashboard QA, Analisis Individu, Ranking, Input, Periode, Parameter)
- Profiler/KTP sidebar link
- Account link in sidebar
- Mobile sidebar with overlay

**Module Config:**

- `lib/app-config.ts` — APP_MODULES definitions with accent colors, icons, descriptions

### 2. Profiler/KTP Module — API Backend

**New Service:** `apps/api/src/services/profiler-service.ts`

- Years: `getYears()`, `createYear()`, `deleteYear()`
- Folders: `getFolders()`, `createFolder()`, `renameFolder()`, `deleteFolder()`, `duplicateFolder()`
- Peserta: `getPeserta()`, `getPesertaById()`, `getPesertaByBatch()`, `createPeserta()`, `updatePeserta()`, `deletePeserta()`, `bulkCreatePeserta()`, `copyPesertaToFolder()`, `reorderPeserta()`, `getGlobalPesertaPool()`
- Teams: `getTeams()`, `createTeam()`, `deleteTeam()`
- Counts: `getFolderCounts()`

**New Route:** `apps/api/src/routes/profiler.ts` — 18 endpoints mounted at `/api/v1/profiler`

- `GET/POST/DELETE /years`
- `GET/POST/PUT/DELETE /folders`, `POST /folders/duplicate`
- `GET /counts`
- `GET/POST /peserta`, `GET/PUT/DELETE /peserta/:id`, `GET /peserta/batch/:batchName`
- `POST /peserta/bulk`, `POST /peserta/copy`, `PUT /peserta/reorder`
- `GET /peserta/global-pool`
- `GET/POST/DELETE /teams`

### 3. Profiler/KTP Module — Frontend (8 Routes)

| Route                 | File                            | Description                                                                    |
| --------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `/profiler`           | `routes/profiler/index.tsx`     | Landing page with year/folder sidebar + action tiles                           |
| `/profiler/table`     | `routes/profiler/table.tsx`     | Participant table with search, tim filter, inline edit/delete                  |
| `/profiler/slides`    | `routes/profiler/slides.tsx`    | Slide view per participant (prev/next navigation), profile data display        |
| `/profiler/analytics` | `routes/profiler/analytics.tsx` | 4 Recharts (tim pie, jabatan bar, gender pie, pendidikan bar) + KPI stat cards |
| `/profiler/export`    | `routes/profiler/export.tsx`    | Export to Excel (.xlsx) and CSV                                                |
| `/profiler/add`       | `routes/profiler/add.tsx`       | Manual input form (20+ fields, 3 sections)                                     |
| `/profiler/import`    | `routes/profiler/import.tsx`    | Download template, upload Excel, import validation + results                   |
| `/profiler/teams`     | `routes/profiler/teams.tsx`     | Custom team CRUD (add/delete custom teams, default teams protected)            |

**Shared Types:** Added `ProfilerYear`, `ProfilerFolder`, `ProfilerPeserta`, `ProfilerTim` interfaces to `packages/types/src/index.ts`

**Service Layer:** `apps/web/src/lib/profilerService.ts` — typed API client for all profiler endpoints

### Build: ✅ Both `@trainers/api` and `@trainers/web` pass
