# Phase 205: SIDAK Agent Detail — Audit Dossier Redesign

## Problem

The active detail panel on `/sidak/agents/:id` used a `xl:grid-cols-[280px_1fr]` layout: a tall `ScoreDetailCard` left rail beside a taller right stack (`TopTicketsCard` + `RootCauseCard`). This produced three floating cards with a height imbalance baked into the structure, an oversized `text-6xl` score hero, and a buried coaching diagnosis. The previous compression pass reduced padding/size but did not change hierarchy, so it felt denser rather than more designed.

## Root Cause

| Aspek          | Penyebab                                                                                                                                            |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Structural     | Standalone score card di samping right stack yang lebih tinggi → kolom kosong besar di bawah skor                                                 |
| Hierarchical   | Komponen skor secara visual mendominasi (`text-5xl sm:text-6xl`) sementara aksi coaching (root cause) terkubur di bawah                            |
| Surface        | Tiga kartu `rounded-2xl` terpisah alih-alih satu working surface dengan internal section                                                          |

## Target Design

Ganti grid score-left/right-stack dengan satu full-width `AgentAuditDossier`: compact score strip di atas, ticket impact + root-cause coaching di bawah. Tidak ada tall left rail, tidak ada kartu vertikal kosong, tidak ada metric hero berukuran raksasa.

## Changes

### New Files

- `apps/web/src/components/sidak/AgentAuditDossier.tsx` — satu surface `rounded-2xl border border-border bg-surface` dengan internal divider:
  - **Score strip:** month/status + label + final score (`text-3xl` mobile / `text-4xl` desktop), horizontal progress bar di tengah, tiga stat cell (`Sesi`, `Temuan`, `Delta`) di kanan dengan pemisah `border-l`.
  - **Bottom row (desktop):** `lg:grid-cols-[minmax(320px,0.42fr)_minmax(420px,0.58fr)]` — ticket impact table (kiri) + root-cause coaching panel (kanan, lebih lebar `0.58fr`).
  - **Mobile/tablet:** single column stack — score strip, ticket impact, root-cause diagnosis.

### Modified Files

- `apps/web/src/routes/sidak/agents.$id.tsx` — hapus import `ScoreDetailCard`/`TopTicketsCard`/`RootCauseCard` dan grid `xl:grid-cols-[280px_1fr]`; kini me-render `MonthRail` + `AgentAuditDossier`, mempertahankan seluruh props/semantics (`latestPeriod.finalScore`, `sessionCount`, `findingsCount`, `previousPeriod?.finalScore`, `topTickets`, `activeRootCauses`, `activeLabel`, `rootCauseScopeLabel`).
- `apps/web/src/components/sidak/TopTicketsCard.tsx` — strip outer `rounded-2xl border border-border bg-surface p-5` wrapper; kini thin presentational block (header + list saja) untuk di-embed dalam dossier.
- `apps/web/src/components/sidak/RootCauseCard.tsx` — strip outer `<section>` wrapper classes; kini thin presentational block. `root-cause-card.test.tsx` tetap PASS (assertion hanya berbasis teks).
- `apps/web/src/components/sidak/MonthRail.tsx` — kurangi visual weight: score text lebih kecil (`text-base` vs `text-[1.5rem]`), active month ditandai dengan `border + bg-muted/50` alih-alih faint absolute background.

### Deleted Files

- `apps/web/src/components/sidak/ScoreDetailCard.tsx` — di-retire; layout vertical left-rail-nya sepenuhnya diganti oleh score strip dossier. Tidak ada importer tersisa.

### New Tests

- `apps/web/src/__tests__/agent-audit-dossier.test.tsx` — 5 test: score strip (month label, score, stats, delta), ticket impact table rendering, populated root-cause diagnosis, dan root-cause empty state.

### No Changes

- API, hook state, scoring logic, service filters, month selection, trend tab, temuan tab — tidak disentuh.
- Semantics `useAgentDetail` tetap dipertahankan.

## Visual Acceptance

- Desktop first fold terbaca sebagai satu audit report kohesif, bukan tiga kartu melayang.
- Tidak ada kolom kosong besar di bawah skor.
- Skor penting tapi tidak mendominasi diagnosis coaching (panel diagnosis mendapat `0.58fr`).
- Ticket dan diagnosis sejajar pada ritme horizontal yang sama (keduanya `p-5`, dipisahkan `border-t` internal).
- Light/dark readable via design tokens (`--surface`, `--border`, `--fg`, `--muted-foreground`).
- Parameter tiket panjang dan evidence wrap (`break-words`/`truncate`) tanpa overflow.

## Quality Gates

| Gate                                                              | Status    |
| ----------------------------------------------------------------- | --------- |
| `vitest run useAgentDetail / root-cause-card / agent-audit-dossier` | 17 PASS   |
| `pnpm --filter @trainers/web lint`                                | 0 errors  |
| `pnpm --filter @trainers/web build`                               | PASS      |

## Files Modified Total

- 1 new component, 1 new test, 4 modified files, 1 deleted file.
