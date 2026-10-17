# Profiler phase 1: bug fixes

Lane C (multi-file web UI behavior). Phase 1 of the KTP/Profiler redesign approved by Fajar on 2026-10-17 (mockup: https://claude.ai/artifact/1psLemG6uFvEif3YDEWaNL).

## Requirement

1. The add form must not save a participant into a guessed folder. Without `?batch=`, it used to save into "Batch 1". The user must pick a target folder before saving.
2. The participant slide must not be clipped. At 1440px the left column cut off "Tgl Lahir"; at 390px the slide needed sideways scrolling and was cut on the right.
3. Kelola tim must count every selectable team (3 system teams plus custom teams), not only custom teams.
4. The jabatan select in the add and edit forms must show the label ("CCA"), not the stored key ("cca").
5. The add form's Data sensitif note must say the truth: the data appears in the profile, slide and exports (Fajar decided the data stays visible).

## Design

- `add.tsx`: the target folder is required state, empty unless `?batch=` is given. It reuses `ProfilerFolderSelect` with years and folders from the API. Saving without a folder shows "Pilih folder tujuan dulu." and sends nothing.
- `SlideCanvas.tsx`: the slide always lays out at a fixed design size (1000×562.5 landscape, 820 wide A4) and is scaled down with `transform: scale()` to fit its frame (ResizeObserver). The PNG/PDF capture removes the scale in the html2canvas clone, so exports stay full size (3000px wide at scale 3).
- `ProfilerSlidesPanel.tsx`: drops the min-width/side-scroll wrapper.
- Selects pass `items={options}` to the Base UI root so the trigger shows labels.
- `teams.tsx`: count = system teams + custom teams.

## Tasklist

- [x] RED: `apps/web/e2e/profiler-phase1-fixes.spec.ts` (6 tests, all failed on main for the bug reasons)
- [x] Fix add form folder, select labels, team count, sensitive text, slide scaling
- [x] GREEN: new spec plus existing profiler specs (32 passed)
- [x] Web typecheck, lint, build
