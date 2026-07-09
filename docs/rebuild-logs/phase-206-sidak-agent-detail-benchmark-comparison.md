# Phase 206: SIDAK Agent Detail — Trend Benchmark Comparison Table

## Problem

The trend chart on `/sidak/agents/:id` showed the viewed agent's cumulative findings but gave no context about how that agent compared to peers. Coaches/reviewers could not tell whether a high finding count was an individual problem or a team-wide pattern. There was no scoped baseline (same team/folder vs same service) to benchmark against.

## Root Cause

| Aspek     | Penyebab                                                                                              |
| --------- | ----------------------------------------------------------------------------------------------------- |
| Data      | `getAgentDetail()` tidak mengembalikan data cohort (tim/service) untuk perbandingan                    |
| Frontend  | Tidak ada komponen tabel perbandingan di bawah trend chart                                           |
| Scope     | Perhitungan rata-rata tim/service butuh data cohort ber-scope; tidak bisa dihitung murni di frontend |

## Target Design

Tambahkan tabel perbandingan tepat di bawah kartu trend chart, membandingkan temuan kumulatif agent yang dilihat terhadap dua baseline: rata-rata agent dalam tim/folder yang sama, dan rata-rata agent di layanan terpilih. Scope terkunci pada rentang trend chart (`trendStartMonth`–`trendEndMonth` di tahun terpilih).

## Changes

### Types (`packages/types/src/sidak.ts`)

- `AgentComparisonRow` — `key`, `label`, `agentCount`, `teamAverage`, `serviceAverage`, `teamAgentCount`, `serviceAgentCount`.
- `AgentComparisonScope` — `year`, `serviceType`, `startMonth`, `endMonth`, `teamLabel`, `serviceLabel`.
- `AgentComparisonTable` — `{ scope, rows }`.
- `AgentDetailData.comparisonTable?` — field opsional baru.

### Backend (`apps/api/src/services/sidak/agent-directory.ts`)

- `getAgentDetail()` sekarang menerima param ke-7 `accessibleAgentIds?: string[] | null` dan membangun `comparisonTable` via helper baru `buildAgentComparisonTable()`.
- Helper query `qa_temuan` **joined** ke `profiler_peserta!inner(id, batch_name, tim)` untuk tahun, `service_type`, dan `period_id` dalam rentang trend. Mendukung filter `allowedServiceTypes` (dari guard leader) dan `accessibleAgentIds` (defense-in-depth client-side filter agar cohort tidak bocor di luar scope akses).
- Cohort:
  - **Agent:** `peserta_id === agentId`.
  - **Tim:** agent dengan `batch_name` sama dengan agent yang dilihat (fallback `tim` bila `batch_name` kosong).
  - **Service:** semua agent audited (memiliki ≥1 `qa_temuan` countable) di layanan/rentang terpilih yang accessible.
- Baris dihitung via `isCountableFinding()` (real findings saja, phantom padding & `nilai=3` tanpa catatan dikecualikan). Total kumulatif + satu baris per parameter.
- Sorting: `Total Temuan` dipaku di atas, lalu parameter diurutkan berdasarkan `agentCount` tertinggi, lalu `teamAverage` tertinggi.

### Route (`apps/api/src/routes/sidak/dashboard.ts`)

- `GET /agents/:id` meneruskan `accessibleIds` (dari `getAccessibleAgentIds`) ke `getAgentDetail()` — mempertahankan guard akses yang ada (403 bila agent tidak accessible).

### Frontend (`apps/web/src/components/sidak/AgentComparisonTable.tsx` — NEW)

- Tabel compact (`rounded-2xl border border-border bg-surface`), tabular nums, tanpa gradient/card bersarang.
- Kolom: Parameter · Agent ini · Rata-rata tim · Rata-rata service · Selisih vs tim · Selisih vs service.
- Baris scope: `Jan-Mei 2026 • CALL • Tim Siti Nur Anisa • N agent tim / N agent service`.
- Empty state: `Belum ada data pembanding untuk range ini` bila tidak ada baris perbandingan di luar Total.

### Frontend Page (`apps/web/src/routes/sidak/agents.$id.tsx`)

- Render `<AgentComparisonTable comparisonTable={data.comparisonTable} />` tepat di bawah `AgentTrendTab` (di dalam section trend, bukan di dalam dossier summary).

### Tests

- `apps/api/src/__tests__/sidak-agent-detail-comparison.test.ts` (NEW, 5 cases): cumulative agent count, team average pakai `batch_name` sama, service average pakai semua agent accessible, non-countable dieksklusi via `isCountableFinding()`, leader scope tidak bocor ke agent luar scope.
- `apps/web/src/__tests__/agent-comparison-table.test.tsx` (NEW, 3 cases): render total row + parameter row + averages + deltas, empty state, dan `undefined` → no DOM.
- `apps/web/src/__tests__/useAgentDetail.test.tsx` — fixture diperbarui dengan `comparisonTable`.
- `apps/api/src/__tests__/sidak-agent-detail-pagination.test.ts` — ekspektasi `totalRowsReturned` disesuaikan (3000) karena query perbandingan menambah satu fetch `qa_temuan` ber-pagination.

## Visual Acceptance

- Tabel muncul di bawah trend chart, sejajar ritme section yang sama.
- Scope line menjelaskan rentang, layanan, tim, dan ukuran cohort (tim/service).
- Delta berwarna netral (rose bila agent punya lebih banyak temuan, emerald bila lebih sedikit) — tidak ada dekorasi berlebih.
- Light/dark readable via design tokens.

## Quality Gates

| Gate                                                                                  | Status   |
| ------------------------------------------------------------------------------------- | -------- |
| `vitest run sidak-agent-detail-comparison`                                             | 5 PASS   |
| `vitest run agent-comparison-table + useAgentDetail`                                   | 9 PASS   |
| `pnpm --filter @trainers/web lint`                                                    | 0 errors |
| `pnpm --filter @trainers/web exec tsc --noEmit`                                       | PASS     |
| `vitest run src/__tests__/sidak` (regresi)                                            | 211 PASS |

## Files Modified Total

- 3 new files (1 component, 2 test), 5 modified files (`sidak.ts`, `agent-directory.ts`, `dashboard.ts`, `agents.$id.tsx`, `useAgentDetail.test.tsx`), 1 updated test ekspektasi.
