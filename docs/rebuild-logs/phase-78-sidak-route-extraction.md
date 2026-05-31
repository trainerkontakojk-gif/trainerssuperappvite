# Rebuild Log - Phase 78: SIDAK Route AI Report & Folders/Agents Extraction

## Deskripsi

Mengekstrak AI report generation (`generateAiReport`, `aiReportSchema`) dari `routes/sidak.ts` ke sub-modul `sidak/ai-report-service.ts`. Mengekstrak `getAllFolders()` dan `getAgentsByFolder()` ke `sidak/access-scope.ts`. Mengganti ~150 baris inline route logic dengan delegated service calls. Menambahkan gemini/openrouter mocks untuk AI report test coverage.

## File Terpengaruh

### 1. AI Report Service (New)
- **[NEW]** [ai-report-service.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/services/sidak/ai-report-service.ts) — Sub-modul baru berisi `generateAiReport()` dan `aiReportSchema` yang diekstrak dari route handler `POST /sidak/reports-ai`. Menangani: validasi Zod schema, fetch data temuan, pembuatan prompt AI, pemanggilan Gemini/OpenRouter, parsing response JSON, dan metadata building.

### 2. Access Scope Expansion
- **[MODIFY]** [access-scope.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/services/sidak/access-scope.ts) — Menambahkan `getAllFolders()` (SELECT dari `profiler_folders` diurutkan berdasarkan `name`) dan `getAgentsByFolder()` (SELECT dari `profiler_peserta` difilter oleh `batch_name` dan opsional `filterScope.agentIds`).

### 3. Route Simplification
- **[MODIFY]** [routes/sidak.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/routes/sidak.ts) — Mengganti 3 endpoint handler dengan delegated calls:
  - `GET /folders` → `sidakService.getAllFolders()` (sebelumnya inline `supabaseAdmin.from("profiler_folders")`)
  - `GET /agents/by-folder/:folder` → `sidakService.getAgentsByFolder()` (sebelumnya inline dengan filter scope)
  - `POST /reports-ai` → `sidakService.aiReportSchema.safeParse()` + `sidakService.generateAiReport()` (sebelumnya ~120 baris inline termasuk Zod, fetch, prompt builder, AI call, dan response parsing)

### 4. Barrel File Update
- **[MODIFY]** [sidak-service.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/services/sidak-service.ts) — Menambahkan `export * from "./sidak/ai-report-service"` ke barrel exports.

### 5. Test Updates
- **[MODIFY]** [sidak-service.test.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/__tests__/sidak-service.test.ts) — Menambahkan mock Gemini (`generateGeminiContent`) dan OpenRouter (`generateOpenRouterContent`). Menambahkan 3 test suite:
  - `getAllFolders` — returns sorted folders from database
  - `getAgentsByFolder` — returns agents for folder, filters by allowed agentIds
  - `generateAiReport` — throws error when no data rows, generates report when rows exist
- **[MODIFY]** [sidak-decomposition-structural.test.ts](file:///Users/nadindyta/Downloads/trainerssuperappvite/apps/api/src/__tests__/sidak-decomposition-structural.test.ts) — Menambahkan `generateAiReport`, `aiReportSchema`, `getAllFolders`, `getAgentsByFolder` ke daftar expected exports.

## Pengujian & Verifikasi

- **Automated Tests:**
  - Seluruh test suite API (479 tests) dan Web (468 tests) lulus.
  - Structural tests memverifikasi kelengkapan exports barrel file dengan 4 fungsi baru.
  - AI report tests memverifikasi error handling untuk data kosong dan successful generation dengan mock AI calls.
- **Graph Sync:**
  - Graphify otomatis sinkron.
