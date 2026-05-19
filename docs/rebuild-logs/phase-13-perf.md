# Phase 13 — Code Splitting & Lazy Loading

## What was done

### 1. Route-Level Code Splitting (React.lazy)
**File:** `apps/web/src/router.tsx`
- Converted all 33 route component imports from static imports to `React.lazy(() => import(...))`
- Each route now loads its JavaScript bundle only when navigated to
- Added `import { lazy } from 'react'`

### 2. Suspense Boundary
**File:** `apps/web/src/components/Layout.tsx`
- Wrapped `<Outlet />` with `<Suspense fallback={...}>`
- Fallback shows centered `Loader2` spinner icon from lucide-react

### 3. Dynamic Imports for Heavy Libraries
**File:** `apps/web/src/lib/excel-utils.ts`
- `exceljs` (930 kB) was statically imported at module level → moved to dynamic `await import('exceljs')` inside `generateTemplate()`
- `xlsx` (425 kB) was statically imported → moved to dynamic `await import('xlsx')` inside `parseExcel()`
- These libraries now load only when user clicks "Download Template" or uploads an Excel file

## Performance Impact

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Main bundle size | 2,382.92 kB | **491.42 kB** | **−79%** |
| Main bundle (gzip) | 682.76 kB | **143.56 kB** | **−79%** |
| Build time | 8.37s | **3.67s** | **−56%** |
| Total chunks | 1 file | **62 files** | Route-level + vendor splitting |
| `INEFFECTIVE_DYNAMIC_IMPORT` warning | Yes | **Removed** | `excel-utils` no longer defeats code splitting |

### Chunk Breakdown (key entries)
| Chunk | Size | Loaded When |
|-------|------|-------------|
| `index.js` (main) | 491 kB | Initial page load |
| `exceljs.min.js` | 930 kB | Download template SIDAK |
| `xlsx.js` | 425 kB | Upload Excel SIDAK |
| `PieChart.js` (Recharts) | 362 kB | Dashboard page |
| Per-route chunks | 1.4-12 kB | Per navigation |

## Files Changed
- `apps/web/src/router.tsx` — React.lazy for all 33 routes
- `apps/web/src/components/Layout.tsx` — Suspense boundary
- `apps/web/src/lib/excel-utils.ts` — dynamic xlsx/exceljs

### Build: ✅ Both `@trainers/api` and `@trainers/web` pass
