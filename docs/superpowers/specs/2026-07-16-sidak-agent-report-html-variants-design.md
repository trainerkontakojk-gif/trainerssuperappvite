# SIDAK Agent Report HTML Variants Design

**Date:** 2026-07-16  
**Status:** Approved for implementation planning  
**Surface:** `/sidak/agents/$id` report export

## Problem

The current HTML export contains the agent data but does not reproduce the useful visual behavior of `/sidak/agents/$id`:

- `Data Tren` is rendered as a wide table with one column per dataset. Real agent data can produce sixteen or more columns, causing the report to overflow horizontally.
- The export contains no chart renderer, so the trend section is only raw numbers.
- `Benchmark Temuan` omits the `% vs tim` and `% vs layanan sama` columns shown on the live page.
- Existing tests assert that labels exist, but do not prove that a chart, responsive boundary, or complete comparison is present.

## Goals

1. Add separate **HTML Interaktif** and **HTML Statis** download options.
2. Make both HTML variants self-contained and usable offline.
3. Match the information hierarchy and light-mode visual language of `/sidak/agents/$id`.
4. Render a real trend chart and the complete agent-versus-team-versus-service comparison.
5. Prevent wide trend and findings data from breaking the page or print layout.
6. Keep CSV and Markdown export behavior intact.

## Non-goals

- Pixel-identical serialization of the live React DOM.
- Bundling React, Recharts, or the application runtime into the downloaded file.
- Adding new API calls or changing the SIDAK agent-detail response contract.
- Changing comparison cohort rules in the backend.

## Export Menu

The report menu exposes four explicit formats:

1. CSV
2. Markdown
3. HTML Interaktif
4. HTML Statis

The export callback and utility API use distinct format identifiers so interactive and static HTML cannot be confused at call sites. File names include a stable variant suffix, for example:

- `Laporan_Audit_<agent>_<year>_interaktif.html`
- `Laporan_Audit_<agent>_<year>_statis.html`

## Shared Report Architecture

Both HTML variants are produced from one normalized report view model and one visual token set. Shared builders render:

- agent profile;
- monthly score summary and active-period dossier;
- top score-deduction tickets;
- root-cause diagnosis;
- trend chart model;
- comparison rows and deltas;
- detailed findings;
- generation metadata.

The variants differ only in trend behavior and print-oriented presentation. This prevents duplicated business formatting and visual drift.

## Report Structure

Both variants follow the live page order:

1. Agent profile
2. Ringkasan Skor Bulanan
3. Active-period score dossier
4. Perkembangan Skor
5. Benchmark Temuan
6. Riwayat Temuan
7. Report generation footer

The report uses the existing restrained SIDAK light palette, system sans-serif typography, tabular numerals, clear section spacing, and visible borders. It does not introduce decorative gradients, heavy shadows, or unrelated dashboard cards.

## Trend Chart

### Shared renderer

The chart is an inline SVG generated from `data.personalTrend`. A shared chart model calculates:

- x-axis positions from period labels;
- y-axis scale and horizontal grid lines;
- line and point coordinates;
- deterministic series colors;
- legend labels;
- an accessible text summary and raw-data fallback.

No external assets, fonts, stylesheets, or chart libraries are required.

### HTML Interaktif

The interactive variant includes a small inline script scoped to the report. It provides:

- filter buttons for `Ringkasan`, `Total Temuan`, and each parameter;
- keyboard-operable buttons with visible selected state;
- series visibility updates without reloading the document;
- point tooltips containing period, series, and value;
- a disclosure control for the complete raw trend table.

`Ringkasan` shows the total series plus the five highest-volume parameter series. Selecting a parameter shows the total series and that parameter, matching the live page's focused comparison behavior while keeping the chart readable.

### HTML Statis

The static variant contains no executable JavaScript. Its chart is a print-ready SVG snapshot showing:

- `Total Temuan`;
- the five highest-volume parameter series;
- a visible legend;
- axes and subtle grid lines;
- an accessible textual chart summary.

The complete raw trend table remains available below the chart so no data is discarded.

## Wide-data Handling

Screen layout uses a dedicated `.table-scroll` boundary with `overflow-x: auto`, while the page container itself never grows beyond the viewport.

Print rules use landscape orientation for data-heavy pages, repeat table headers, avoid splitting compact summary blocks, and allow long findings text to wrap. The trend chart remains within the printable width. The raw trend table can continue onto additional pages without forcing the complete document wider than the page.

## Benchmark Temuan

Both variants reproduce the live six-column comparison:

- Parameter
- Agent ini
- Rata-rata tim
- Rata-rata layanan sama
- `% vs tim`
- `% vs layanan sama`

Percentage deltas use the same semantics as the live component:

- positive means the agent has more findings than the comparison average and is shown as adverse;
- negative means fewer findings and is shown as favorable;
- a zero comparison average produces `n/a` unless both values are zero;
- text signs and labels accompany color so meaning is not color-only.

The scope line retains year, month range, service, team/folder label, team cohort size, and same-service cohort size from `comparisonTable.scope` and the total row.

## Empty and Edge States

- No trend data: show the same human-readable empty message in both variants and omit empty controls.
- No comparison rows: show `Belum ada data pembanding untuk range ini`.
- One trend point: render a point without an invalid path.
- Constant or all-zero values: use a non-zero y-axis range so coordinates remain valid.
- Missing values: display `-` in raw data and do not generate invalid SVG coordinates.
- Long parameter names: wrap in controls/tables and use a concise tooltip/legend label without losing the full accessible name.

## Security and Offline Constraints

- All user-controlled strings are HTML-escaped before interpolation.
- Data passed to the interactive script is serialized with a script-safe serializer so values cannot close the script element.
- Inline behavior does not use `eval`, dynamic code construction, network calls, or external dependencies.
- Both variants contain no external stylesheet, font, image, or script URL.
- The static variant contains no executable `<script>` element.

## Testing Strategy

Tests are added before implementation and prove behavior rather than label presence.

### Export utility tests

- interactive output contains inline SVG, filter controls, safe inline data, and no external dependencies;
- static output contains inline SVG and no executable script;
- chart paths and points are generated for representative trend data;
- all-zero, single-point, empty, and missing-value datasets produce valid output;
- both variants include the six benchmark columns and correct positive, negative, zero, and `n/a` deltas;
- wide tables are placed inside the responsive boundary;
- malicious HTML and script-closing values remain escaped;
- CSV and Markdown regression coverage remains green.

### Export menu tests

- the menu exposes `HTML Interaktif` and `HTML Statis` separately;
- each selection invokes the corresponding format identifier;
- keyboard and Escape behavior remain functional.

### Verification

- run focused Vitest suites for the export utility and profile export menu;
- run TypeScript checking for the web package;
- generate both HTML fixtures and inspect them at desktop and narrow viewport widths;
- inspect the static variant in print preview/landscape;
- run the repository's required UI quality audit after implementation.

## Acceptance Criteria

The work is complete when:

1. Users can download separate interactive and static HTML reports.
2. Both reports visibly contain a real trend chart.
3. The trend section no longer expands the document beyond its viewport or printed page.
4. The interactive chart can focus total or individual parameter series without network access.
5. The static chart is readable without JavaScript and is suitable for printing.
6. The benchmark visibly compares agent, same-team average, and same-service average, including both percentage deltas.
7. Both reports preserve the data and section hierarchy of `/sidak/agents/$id`.
8. Focused tests, type checking, visual viewport checks, and the UI quality audit pass.
