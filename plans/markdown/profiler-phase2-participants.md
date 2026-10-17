# Profiler phase 2: one participant list

Lane C (multi-file web UI). Phase 2 of the KTP/Profiler redesign approved by Fajar on 2026-10-17 (mockup: https://claude.ai/artifact/1psLemG6uFvEif3YDEWaNL).

## Requirement

1. One participant list in the workspace Peserta tab, with Kartu and Tabel modes (`?layout=tabel`).
2. The participant profile and edit form open in the workspace main area (`?participant=`, `&edit=1`), not a modal or side drawer. They show "Kembali ke <folder>" and previous/next arrows.
3. Pilih banyak, Pindah folder and Atur urutan move into the Peserta tab.
4. `/profiler/table` becomes a redirect to the Peserta tab in Tabel mode.
5. Search covers nama, NIK OJK, email, tim and jabatan, with a team filter.
6. Sensitive data stays visible in the profile (Fajar's decision).

## Design

- `ProfilerPesertaPanel` (new) owns search, team filter, Kartu/Tabel, select mode, sort draft and the move dialog.
- `ProfilerParticipantTable` (new) is the Tabel mode. Arrow buttons reorder rows with a keyboard; cards keep drag and drop and get the same buttons.
- `ProfilerParticipantDetail` (new) renders the read-only profile or `ProfilerParticipantEditor`, which is the former `EditPesertaModal` rendered inline.
- `index.tsx` keeps the per-folder participant cache and counts in sync after save, delete, reorder and move.
- Removed: `table.tsx`, `ProfilerRouteNav.tsx`, `ProfilerTableFilters.tsx`, and the modal unit test superseded by E2E.
- The UI text rename from "batch" to "folder" is applied to new text here. The remaining strings follow in later phases.

## Tasklist

- [x] RED: `apps/web/e2e/profiler-phase2-participants.spec.ts` (8 tests failed on main)
- [x] Implement panel, table, detail, inline editor, redirect
- [x] GREEN: phase 2 spec plus profiler, landmark and shell specs (72 passed)
- [x] Web typecheck, lint (0 errors), build
