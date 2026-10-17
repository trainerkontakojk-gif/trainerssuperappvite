# Agent report HTML — split the generator file

- **Status:** Implemented on `claude/project-thread-8hrwo8`.
- **Risk lane:** Lane C (multi-file refactor, no intended behavior change).
- **Requested by:** Fajar, 2026-10-17 (project thread "Pelajari isi aplikasi Trainers SuperApp", item "file terlalu besar"; chose this over `call-manager.ts`, which only serves the retired OpenAI cleanup path).

## Requirement

`apps/web/src/utils/agentReportHtml.ts` was 1,194 lines. Move its two self-contained parts out so the file holds only the document sections, with byte-for-byte the same HTML output and the same public entry (`buildAgentReportHtml`, `AgentReportHtmlInput`, `AgentHtmlVariant`).

## Design

- `agentReportHtmlStyles.ts`: `REPORT_CSS`, the inline stylesheet (byte-identical; md5 of the template literal matches the original).
- `agentReportHtmlChart.ts`: `escHtml`, chart geometry, and the SVG line-chart builders.
- `agentReportHtml.ts` (814 lines): section builders, tabs, colophon, interactive script and `buildAgentReportHtml`. Only its imports changed; the body was not reformatted.
- A whitespace-insensitive comparison (ignoring `export`) matched the original for both the moved code and the remaining file.

## Tasklist

- [x] Split and wire imports.
- [x] Web typecheck, ESLint, root build.
- [x] `sidak-agent-report-{download,readability,date-invariance}.spec.ts` before and after: 32 passed, 1 failed both times (the print-layout case that fails on `main` with the container's older Chromium).
