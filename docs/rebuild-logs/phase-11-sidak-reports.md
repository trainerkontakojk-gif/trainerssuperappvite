# Phase 11 — SIDAK Reports

## What was implemented

### 1. API: Data Report Query
**File:** `apps/api/src/services/sidak-service.ts` — added `getDataReportRows(params)`
- Filters: `serviceType`, `year`, `startMonth`, `endMonth`, `pesertaId`, `indicatorId`
- Joins: `qa_temuan` + `profiler_peserta` + `qa_indicators` + `qa_periods`
- Returns up to 1000 rows ordered by `created_at` desc

### 2. API: Report Routes
**File:** `apps/api/src/routes/sidak.ts` — 2 new endpoints:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/sidak/reports/data` | Query temuan dengan filter, return rows |
| `POST` | `/api/v1/sidak/reports/ai/generate` | Generate AI report via Gemini/OpenRouter |

**AI Report Flow:**
1. Validate filters + fetch temuan data
2. Build structured prompt with findings sample (20 rows)
3. Call `generateGeminiContent` or `generateOpenRouterContent` based on model provider
4. Parse AI JSON response (with markdown fence cleanup)
5. Return structured report: `executiveSummary`, `keyFindings`, `scoreAnalysis`, `recommendations`, `priorityAreas`

### 3. Frontend: 3 Report Pages

| Route | File | Description |
|-------|------|-------------|
| `/sidak/reports` | `routes/sidak/reports/index.tsx` | Landing page with 2 card choices (Data / AI) + warning modal for AI |
| `/sidak/reports-data` | `routes/sidak/reports-data.tsx` | Filter form (service, year, month range) + sortable results table + Excel export via `xlsx` |
| `/sidak/reports-ai` | `routes/sidak/reports-ai.tsx` | Mode selection (layanan/individu) + filters + generate button + results display (summary, findings, recommendations, priority areas) |

### Build: ✅ Both `@trainers/api` and `@trainers/web` pass
