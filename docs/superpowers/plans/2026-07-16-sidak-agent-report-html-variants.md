# SIDAK Agent Report HTML Variants Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Add separate offline interactive and static HTML downloads whose trend chart, benchmark comparison, responsive behavior, and section hierarchy match the SIDAK agent-detail page.

**Architecture:** Keep CSV and Markdown generation in apps/web/src/utils/exportAgentReport.ts, move HTML-specific rendering into a focused apps/web/src/utils/agentReportHtml.ts module, and feed both variants through one normalized chart/comparison renderer. The interactive variant adds a script-safe inline controller over the same SVG model used by the no-script static variant.

**Tech Stack:** React 19, TypeScript, Vitest, inline HTML/CSS/SVG, dependency-free browser JavaScript.

## Global Constraints

- Both HTML variants must remain self-contained and usable offline.
- The static variant must contain no executable script element.
- Do not add React, Recharts, external fonts, stylesheets, images, scripts, or network calls to downloaded reports.
- Preserve existing CSV and Markdown output behavior.
- Preserve backend comparison cohort semantics; this work only renders AgentDetailData already returned by the API.
- Escape every user-controlled HTML value and script-safe serialize interactive chart data.
- Follow the light-mode visual hierarchy and section order of /sidak/agents/$id.
- Use tests first and observe each new behavioral assertion fail before production edits.
- Leave implementation changes uncommitted unless the user explicitly asks for an implementation commit.

## File Structure

- apps/web/src/utils/exportAgentReport.ts: public CSV, Markdown, and HTML export API; delegates HTML rendering.
- apps/web/src/utils/agentReportHtml.ts: shared report model, SVG chart, benchmark, responsive tables, and interactive/static HTML shells.
- apps/web/src/hooks/useAgentDetail.ts: maps menu format identifiers to content, MIME type, and filename suffix.
- apps/web/src/components/sidak/AgentProfileBar.tsx: presents the four export choices.
- apps/web/src/__tests__/exportAgentReport.test.ts: generator, chart, security, comparison, and edge-state regressions.
- apps/web/src/__tests__/AgentProfileBar.test.tsx: dropdown labels, callbacks, keyboard, and Escape regressions.

---

### Task 1: Define the four-format export contract

**Files:**
- Modify: apps/web/src/components/sidak/AgentProfileBar.tsx
- Modify: apps/web/src/hooks/useAgentDetail.ts
- Modify: apps/web/src/utils/exportAgentReport.ts
- Test: apps/web/src/__tests__/AgentProfileBar.test.tsx
- Test: apps/web/src/__tests__/exportAgentReport.test.ts

**Interfaces:**
- Produces: AgentReportFormat = "csv" | "md" | "html-interactive" | "html-static".
- Produces: generateHTML(..., variant: "interactive" | "static"): string.
- Consumes: existing agent-detail data and export arguments.

- [ ] **Step 1: Write the failing dropdown test**

~~~tsx
it("offers separate interactive and static HTML downloads", async () => {
  const onExport = vi.fn();
  renderProfile({ onExport });
  await userEvent.click(screen.getByRole("button", { name: /unduh laporan/i }));
  expect(screen.getByRole("menuitem", { name: /html interaktif/i })).toBeInTheDocument();
  expect(screen.getByRole("menuitem", { name: /html statis/i })).toBeInTheDocument();
  await userEvent.click(screen.getByRole("menuitem", { name: /html interaktif/i }));
  expect(onExport).toHaveBeenLastCalledWith("html-interactive");
});
~~~

- [ ] **Step 2: Run RED**

~~~bash
pnpm --dir apps/web exec vitest run src/__tests__/AgentProfileBar.test.tsx
~~~

Expected: FAIL because the two HTML labels and identifiers do not exist.

- [ ] **Step 3: Implement the minimal type and menu contract**

~~~ts
export type AgentReportFormat =
  | "csv"
  | "md"
  | "html-interactive"
  | "html-static";
~~~

Use labels HTML Interaktif and HTML Statis. Update useAgentDetail so both use text/html;charset=utf-8, call the matching variant, and produce _interaktif.html or _statis.html filename suffixes.

- [ ] **Step 4: Run GREEN**

Run the same focused command. Expected: all AgentProfileBar tests PASS.

---

### Task 2: Build the shared static SVG chart and responsive data boundary

**Files:**
- Create: apps/web/src/utils/agentReportHtml.ts
- Modify: apps/web/src/utils/exportAgentReport.ts
- Test: apps/web/src/__tests__/exportAgentReport.test.ts

**Interfaces:**
- Produces: AgentHtmlVariant = "interactive" | "static".
- Produces: generateAgentHtmlReport(input: AgentHtmlReportInput): string.
- Consumes: the existing report arguments through AgentHtmlReportInput.

- [ ] **Step 1: Write failing static-chart tests**

~~~ts
const html = generateHTML(
  sampleData(), sampleSummaries, sampleTemuan, sampleTickets,
  sampleRootCauses, 2026, "call", "static",
);
expect(html).toContain('data-report-variant="static"');
expect(html).toContain('<svg class="trend-chart"');
expect(html).toContain('data-series="Skor Final"');
expect(html).toContain('class="table-scroll"');
expect(html).not.toMatch(/<script(?:\s|>)/i);
expect(html).not.toContain("NaN");
expect(html).not.toContain("Infinity");
~~~

Add separate tests for empty data, one point, all-zero data, and a missing value.

- [ ] **Step 2: Run RED**

~~~bash
pnpm --dir apps/web exec vitest run src/__tests__/exportAgentReport.test.ts
~~~

Expected: FAIL because variant selection, SVG rendering, and responsive wrappers are absent.

- [ ] **Step 3: Implement the shared report contract**

~~~ts
export type AgentHtmlVariant = "interactive" | "static";

export interface AgentHtmlReportInput {
  data: AgentDetailData;
  monthlySummaries: AgentPeriodSummary[];
  temuanDisplayItems: TemuanDisplayItemExport[];
  topTickets: TicketScoreExport[];
  activeRootCauses: RootCauseResult[];
  selectedYear: number;
  selectedService: string;
  variant: AgentHtmlVariant;
}

export function generateAgentHtmlReport(input: AgentHtmlReportInput): string;
~~~

Normalize finite chart values, calculate a non-zero y-domain, select total plus the five highest-volume parameter series, and render a figure containing an inline SVG with viewBox 0 0 960 420. Add a screen-reader figcaption and wrap raw trend, benchmark, and findings tables in .table-scroll. Use width: 100% and height: auto instead of a fixed document width.

- [ ] **Step 4: Delegate from generateHTML**

Keep the public generateHTML function but add the final AgentHtmlVariant argument and delegate all arguments to generateAgentHtmlReport.

- [ ] **Step 5: Run GREEN**

Run the focused export test. Expected: static, empty, one-point, all-zero, missing-value, CSV, and Markdown cases PASS.

---

### Task 3: Add dependency-free interactive filtering and safe serialization

**Files:**
- Modify: apps/web/src/utils/agentReportHtml.ts
- Test: apps/web/src/__tests__/exportAgentReport.test.ts

**Interfaces:**
- Consumes: normalized chart series from Task 2.
- Produces: interactive HTML with data-trend-filter, data-chart-series, and one inline controller script.

- [ ] **Step 1: Write failing interactive and injection-safety tests**

~~~ts
const html = generateHTML(
  sampleData(), sampleSummaries, sampleTemuan, sampleTickets,
  sampleRootCauses, 2026, "call", "interactive",
);
expect(html).toContain('data-report-variant="interactive"');
expect(html).toContain('data-trend-filter="summary"');
expect(html).toContain('data-trend-filter="total"');
expect(html).toContain('aria-pressed="true"');
expect(html).toMatch(/<script>\s*\(\(\) =>/);
expect(html).not.toContain("<script src=");
~~~

Pass a series label containing a script-closing payload and assert the raw closing sequence is absent from serialized chart data.

- [ ] **Step 2: Run RED**

Run the focused export test. Expected: FAIL because filter controls and the controller are absent.

- [ ] **Step 3: Implement safe interactive behavior**

Serialize interactive data with JSON followed by replacements for less-than, greater-than, ampersand, U+2028, and U+2029. The controller must query only inside the interactive report root, update hidden state on data-chart-series nodes, and synchronize aria-pressed on filter buttons. Ringkasan shows total plus five summary series; Total Temuan shows only total; a parameter shows total plus that parameter. Use SVG title nodes for native offline tooltips and keep raw data inside a details disclosure.

- [ ] **Step 4: Run GREEN**

Run the focused export test. Expected: all interactive, security, and prior static cases PASS.

---

### Task 4: Restore complete benchmark parity

**Files:**
- Modify: apps/web/src/utils/agentReportHtml.ts
- Test: apps/web/src/__tests__/exportAgentReport.test.ts

**Interfaces:**
- Consumes: data.comparisonTable.rows and scope.
- Produces: the six-column benchmark table and deltas matching AgentComparisonTable.tsx.

- [ ] **Step 1: Write failing comparison tests**

~~~ts
expect(html).toContain("Rata-rata layanan sama");
expect(html).toContain("% vs tim");
expect(html).toContain("% vs layanan sama");
expect(html).toContain("+50%");
expect(html).toContain("-50%");
expect(html).toContain("n/a");
~~~

Use fixture rows that independently exercise positive, negative, both-zero, and nonzero-versus-zero averages.

- [ ] **Step 2: Run RED**

Run the focused export test. Expected: FAIL because the delta columns are missing.

- [ ] **Step 3: Implement parity helpers**

~~~ts
function calculateDeltaPercent(agentCount: number, average: number): number | null {
  if (average === 0) return agentCount === 0 ? 0 : null;
  return ((agentCount - average) / average) * 100;
}

function formatDeltaPercent(value: number | null): string {
  if (value === null) return "n/a";
  const rounded = Math.round(value * 10) / 10;
  if (Object.is(rounded, -0) || rounded === 0) return "0%";
  const sign = rounded > 0 ? "+" : "-";
  return sign + formatIdNumber(Math.abs(rounded)) + "%";
}
~~~

Render adverse/favorable classes plus signed text. Preserve year, month range, team/folder label, service label, and both cohort counts.

- [ ] **Step 4: Run GREEN**

Run the focused export test. Expected: all comparison and prior generator tests PASS.

---

### Task 5: Verify types, visuals, print behavior, and regressions

**Files:**
- Modify only if verification exposes a scoped defect in the files above.
- Test: apps/web/src/__tests__/AgentProfileBar.test.tsx
- Test: apps/web/src/__tests__/exportAgentReport.test.ts

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified interactive and static report fixtures.

- [ ] **Step 1: Run focused suites together**

~~~bash
pnpm --dir apps/web exec vitest run \
  src/__tests__/AgentProfileBar.test.tsx \
  src/__tests__/exportAgentReport.test.ts
~~~

Expected: all tests PASS with zero failures.

- [ ] **Step 2: Run TypeScript checking**

~~~bash
pnpm --dir apps/web exec tsc --noEmit
~~~

Expected: exit code 0.

- [ ] **Step 3: Generate deterministic fixtures**

Write temporary interactive and static fixtures under /tmp/sidak-agent-report-qa and inspect both at approximately 1440px and 375px widths. Confirm no document-level horizontal overflow, both SVG charts are visible, interactive filters change series, benchmark has six columns inside its scroll boundary, and long findings wrap.

- [ ] **Step 4: Verify print behavior**

Inspect the static report in landscape print preview. Confirm the chart fits, compact sections avoid awkward splits, table headers repeat where supported, and findings continue without clipping.

- [ ] **Step 5: Run UI quality review**

Apply the Impeccable audit checklist to AgentProfileBar.tsx and agentReportHtml.ts. Resolve all P0/P1 findings and rerun focused tests plus TypeScript checking after any edit.

- [ ] **Step 6: Review the final diff**

~~~bash
git diff --check
git status --short
git diff -- \
  apps/web/src/components/sidak/AgentProfileBar.tsx \
  apps/web/src/hooks/useAgentDetail.ts \
  apps/web/src/utils/exportAgentReport.ts \
  apps/web/src/utils/agentReportHtml.ts \
  apps/web/src/__tests__/AgentProfileBar.test.tsx \
  apps/web/src/__tests__/exportAgentReport.test.ts
~~~

Expected: only scoped report-export changes, no whitespace errors, and no unrelated user changes overwritten.
