# Phase 12 — Polish & QA

## What was done

### Loading States
- **KETIK simulation** — added spinner + error banner + empty state for scenario list
- **PDKT simulation** — same pattern: loading/error/empty for scenario list

### Empty States
- **SIDAK dashboard** — fallback "Belum ada data agent" when Top Agents is empty
- **SIDAK agent detail** — fallback for empty Score History ("Belum ada riwayat skor") and Findings ("Belum ada temuan")
- **KETIK/PDKT simulation** — "Tidak ada skenario tersedia" when scenarios empty

### Error Handling
- **Profiler export** — replaced `alert('Gagal export Excel')` with inline dismissible error banner
- **Profiler teams** — replaced `alert(e.message)` with inline dismissible error banner
- **Telefun** — replaced `prompt('Masukkan token:')` with proper error "Token tidak ditemukan. Silakan login terlebih dahulu."

### Unpolished UX
- **Profiler table** — removed `GripVertical` drag handle icon (reorder API exists but was never connected)
- **KETIK/PDKT** — added error destructuring for `useApi` scenario fetch (was previously hidden)

### Files Changed
- `apps/web/src/routes/ketik/simulation.tsx`
- `apps/web/src/routes/pdkt/simulation.tsx`
- `apps/web/src/routes/sidak/dashboard.tsx`
- `apps/web/src/routes/sidak/agents.$id.tsx`
- `apps/web/src/routes/profiler/export.tsx`
- `apps/web/src/routes/profiler/teams.tsx`
- `apps/web/src/routes/profiler/table.tsx`
- `apps/web/src/routes/telefun/index.tsx`

### Build: ✅ Both `@trainers/api` and `@trainers/web` pass
