# Profiler phase 3: add, import and teams inside the workspace

Lane C (multi-file web UI). Phase 3 of the KTP/Profiler redesign approved by Fajar on 2026-10-17 (mockup: https://claude.ai/artifact/1psLemG6uFvEif3YDEWaNL).

## Requirement

1. Tambah peserta opens in the workspace main area (`/profiler?view=tambah`, with `&batch=` when started from a folder). The folder library stays on the left. The target folder stays required.
2. Impor opens in the workspace main area (`/profiler?batch=<folder>&view=impor`) as four steps: Unduh template, Unggah file, Periksa, Selesai. Nothing is saved before the Periksa step is confirmed. Every row shows a status and a reason (ready, duplicate, or what must be fixed).
3. Kelola daftar tim becomes a dialog over the workspace (`/profiler?tim=1`). Deleting a team happens only there, not in the add form.
4. `/profiler/add`, `/profiler/import` and `/profiler/teams` redirect to the new URLs, so old links keep working.
5. The Tambah peserta menu follows the mockup: Pilih dari folder lain, Isi manual, Impor dari Excel, Kelola daftar tim.
6. Leaders (read-only) never see the add or import views; the team dialog is read-only for them.

## Design

- `components/forms/ProfilerAddForm.tsx` is the former `add.tsx` rendered inline, with the folder field inside Identitas utama. After saving it returns to the target folder and refreshes that folder's list and count.
- `components/import/ProfilerImportFlow.tsx` is the former `import.tsx`. It parses the file, then checks each row in the browser: Nama and Tim are required, Jabatan must be a known code or label (the label "CCA" is stored as `cca`), dates must be `YYYY-MM-DD`, and names already in the folder or earlier in the file are duplicates. The save step keeps the existing bulk call with the per-row fallback; the backend still validates.
- `components/ProfilerTeamsDialog.tsx` is the former `teams.tsx` as a dialog.
- `index.tsx` routes `view=tambah` / `view=impor` / `tim=1` and keeps the participant cache and counts in sync.
- No API, type or database changes.

## Tasklist

- [x] RED: `apps/web/e2e/profiler-phase3-add-import-teams.spec.ts` (6 tests failed on main)
- [x] Implement add form, import flow, teams dialog, redirects, menu labels; the downloaded template now offers the same Jabatan labels the import accepts
- [x] GREEN: phase 1–3, profiler, workspace and landmark specs (57 passed)
- [x] Web typecheck, lint (0 errors), build
