# Agent report PDF — split the generator file

- **Status:** Implemented on `claude/project-thread-8hrwo8`.
- **Risk lane:** Lane C (multi-file refactor, no intended behavior change).
- **Requested by:** Fajar, 2026-10-17 (project thread "Pelajari isi aplikasi Trainers SuperApp", item "file terlalu besar").

## Requirement

`apps/web/src/utils/agentReportPdf.ts` was 1,564 lines. Split it so each file has one concern, with byte-for-byte the same PDF output and the same public entry (`generateAgentReportPdf`, `AgentReportPdfInput`), still loaded through the existing dynamic import.

## Design

- `agentReportPdfTheme.ts`: page geometry, typography, palette and `toneColor`.
- `agentReportPdfText.ts`: WinAnsi sanitation, measuring and line wrapping.
- `agentReportPdfLayout.ts`: the `PdfDocument` layout engine plus `bullet`, `statRow`, `note`.
- `agentReportPdfChart.ts`: vector line charts.
- `agentReportPdf.ts`: section builders and `generateAgentReportPdf` (734 lines).
- Code moved verbatim with `export` added; a whitespace-insensitive token comparison against the original matched for every module (the chart module differs only by two Prettier-added parentheses). The section-builder bodies left in `agentReportPdf.ts` are not reformatted.

## Tasklist

- [x] Split and wire imports (type-only imports marked `type`).
- [x] Web typecheck, ESLint, root build.
- [x] `sidak-agent-report-download.spec.ts` before and after: 24 passed, 1 failed both times (the print-layout case, which fails on `main` too with the container's older Chromium).
