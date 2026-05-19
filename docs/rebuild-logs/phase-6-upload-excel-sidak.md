# Phase 6 — Upload Excel SIDAK

## What was built

### Library
- `xlsx` (SheetJS) — client-side Excel parsing (.xlsx/.xls → JSON)
- `exceljs` — generating structured `.xlsx` templates with dropdowns

### Excel Utils (`apps/web/src/lib/excel-utils.ts`)
- `generateTemplate()` — creates `.xlsx` with:
  - "Input Temuan" sheet (No Tiket, Indikator with dropdown, Nilai 0-3, Ketidaksesuaian, Sebaiknya)
  - Hidden `_indikator` reference sheet for dropdown validation
  - Styled header row
- `parseExcel()` — reads `.xlsx`/`.xls`, maps indicator names to IDs, validates nilai range
- `validateImportRows()` — intra-file duplicate detection (no_tiket + indicator_id)

### SIDAK Input Page — Excel Import UI
- "Import Excel" button toggles import panel
- "Download Template" generates `.xlsx` per selected service type
- "Pilih File Excel" uploads and parses
- Preview table: shows all rows with valid/invalid status + error messages
- "Import N Temuan" sends only valid rows to `POST /sidak/temuan/batch`
- Stats: N Valid / N Invalid counters

### Build: ✅ passes (1.6 MB — xlsx/exceljs libraries)
