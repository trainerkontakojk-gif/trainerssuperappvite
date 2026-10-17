# Profiler phase 4: year summary, statistik, slides and phone list

Lane C (multi-file web UI). Phase 4 of the KTP/Profiler redesign approved by Fajar on 2026-10-17 (mockup: https://claude.ai/artifact/1psLemG6uFvEif3YDEWaNL).

## Requirement

1. The year summary shows up to five upcoming birthdays inline beside the folder table (name; date, age, folder; "Hari ini" or "N hari lagi"), with a retry on error.
2. Statistik replaces pie charts with one horizontal bar list per dimension (jabatan, tim, gender, pendidikan). Every bar carries its number and percent. Clicking a bar lists those participants.
3. Slide shows a strip of participant names under the slide to jump directly; the current one is marked.
4. On phones the participant list is one compact row per participant (number, avatar, name, jabatan · tim).
5. Remaining "batch" UI text becomes "folder". The `batch_name` column and `?batch=` URL param stay unchanged.

## Design

- `ProfilerStatsPanel.tsx` drops recharts and renders `BarList` rows as buttons with an accessible label (`CCA: 2 peserta (67%). Lihat pesertanya`).
- `ProfilerSlidesPanel.tsx` adds a scrollable `nav "Daftar slide"` strip; only the strip scrolls to keep the active name in view.
- `GlobalBirthdaysWidget.tsx` becomes an inline section instead of a dialog.
- `ProfilerParticipantCard.tsx` / `ProfilerParticipantGrid.tsx` hide card header/footer below `sm`.
- No API, type or database changes.

## Tasklist

- [x] RED: `apps/web/e2e/profiler-phase4-overview-stats-slides.spec.ts` (4 tests failed on main)
- [x] Implement birthdays list, bar statistik, slide strip, phone rows, folder wording
- [x] GREEN: all profiler specs; workspace contrast test rewritten for the bar lists
- [x] Web typecheck, lint, build
