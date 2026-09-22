# Phase 219 — SIDAK Agent Comparison Table Responsive Layout

**Tanggal:** 2026-09-22
**Modul:** SIDAK Agent Detail
**Route:** `/sidak/agents/$id` → tab `Tren`

## Ringkasan

Tabel `Perbandingan Temuan` sebelumnya memiliki `min-w-[720px]` dan mewarisi `whitespace-nowrap`, sehingga kolom kanan dapat terdorong keluar dari card dan pengguna harus melakukan horizontal scroll untuk membaca data.

## Perubahan

- `AgentComparisonTable` memakai `w-full min-w-0 table-fixed` dengan pembagian kolom eksplisit: 25% untuk parameter dan 15% untuk masing-masing kolom numerik.
- Header tabel dan label parameter memakai wrapping agar nama panjang tetap terbaca utuh.
- Nilai numerik tetap `whitespace-nowrap`, rata kanan, dan menggunakan `tabular-nums`.
- Deskripsi scope juga dapat wrap pada card yang sempit.
- Header kolom diberi `scope="col"`.
- Shared `Table` primitive tidak diubah; perubahan dibatasi pada komponen SIDAK.
- Test terfokus menambahkan kontrak layout agar `min-w-[720px]` tidak kembali dan teks header/parameter tetap wrap.

## File

- `apps/web/src/components/sidak/AgentComparisonTable.tsx`
- `apps/web/src/__tests__/agent-comparison-table.test.tsx`
- `docs/modules.md`
- `docs/rebuild-logs/phase-219-sidak-agent-comparison-table-responsive.md`
- `~/wiki/entities/sidak-module.md`
- `~/wiki/index.md`

## Verifikasi

- `pnpm --dir apps/web exec vitest run src/__tests__/agent-comparison-table.test.tsx` — 4/4 PASS
- `pnpm --dir apps/web exec eslint src/components/sidak/AgentComparisonTable.tsx src/__tests__/agent-comparison-table.test.tsx` — PASS
- `pnpm --dir apps/web exec prettier --check src/components/sidak/AgentComparisonTable.tsx src/__tests__/agent-comparison-table.test.tsx` — PASS
- `pnpm --dir apps/web typecheck` — PASS
- `pnpm --dir apps/web build` — PASS
- Impeccable detector — `[]`
- `git diff --check` — PASS
- Browser visual QA memakai production build dengan data mock read-only — seluruh 6 kolom terlihat; `tableScrollWidth` sama dengan `tableClientWidth` (`1022px`); wrapper tidak memiliki overflow horizontal.

## Non-goals

- Tidak mengubah kontrak API atau struktur data.
- Tidak menghapus kolom atau memotong isi bisnis.
- Tidak mengubah shared table primitive, backend, database, atau role access.
