# Rebuild Log - Phase 79: SIDAK Route Full Decomposition

## Deskripsi

Menyelesaikan dekomposisi penuh route handlers dari file monolitik `routes/sidak.ts` (1,503 baris) menjadi sub-modul terpisah. Mengekstrak 27 route handler SIDAK ke 5 file.

## Detail Perubahan

### SIDAK Route Decomposition

| Sub-modul | Baris | Endpoints |
|-----------|-------|-----------|
| `sidak/core.ts` | 161 | GET/POST/DELETE `/periods`, GET/POST `/indicators`, GET `/folders`, GET `/folders/:folder/agents` |
| `sidak/dashboard.ts` | 343 | GET `/agents`, GET `/agents/:id`, GET `/dashboard`, POST `/dashboard/refresh-summary`, GET `/dashboard/available-years`, GET `/dashboard/trend`, GET/PUT `/service-weights`, GET `/ranking` |
| `sidak/temuan.ts` | 200 | GET `/temuan`, POST `/temuan/batch`, POST `/temuan/batch/preview`, PUT/DELETE `/temuan/:id`, POST `/temuan/perfect-session` |
| `sidak/rule-versions.ts` | 405 | GET/POST `/rule-versions`, PUT `/rule-versions/:id`, POST `/rule-versions/:id/publish`, POST `/rule-versions/:id/supersede`, GET/POST/DELETE/PUT `/rule-versions/:id/indicators` |
| `sidak/reports.ts` | 447 | POST `/reports/data`, POST `/reports/ai/generate`, POST `/reports/ai/export-docx`, POST `/reports/ai/export-html`, POST `/reports/ai/chart-data`, POST `/reports/ai/save`, GET/DELETE `/reports/archives`, GET `/reports/archives/:id`, POST `/reports/ai/export-pdf` |
| **Total** | **1,556** | **27 route handlers** |

### File Terpengaruh

- **[MODIFY]** `routes/sidak.ts` — 1,503 → 19 baris (import + route registrasi 5 sub-modules + export)
- **[NEW]** `routes/sidak/core.ts` — periods + indicators + folders endpoints
- **[NEW]** `routes/sidak/dashboard.ts` — agents + dashboard + service-weights + ranking endpoints
- **[NEW]** `routes/sidak/temuan.ts` — temuan CRUD + batch + perfect-session endpoints
- **[NEW]** `routes/sidak/rule-versions.ts` — rule versions CRUD + publish + supersede + indicators
- **[NEW]** `routes/sidak/reports.ts` — data reports + AI report + archives endpoints
- **[MODIFY]** `graphify-out/*` — auto-sync graph

## Pengujian & Verifikasi

- Structural integrity: barrel file `sidak.ts` hanya berisi import + route registration + exports
- Graphify auto-sync
