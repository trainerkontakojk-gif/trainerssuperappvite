# SIDAK Agent Ranking and Forecast Quickview Design

**Date:** 2026-07-16
**Route:** `/sidak/agents/:id`
**Status:** Approved design, pending implementation plan

## 1. Purpose

Add a compact performance quickview to the SIDAK agent detail profile area. The quickview must answer three questions without requiring the user to open the Ranking or Forecast pages:

1. What is this agent's current rank within the combined parent team?
2. What is this agent's current rank within the leader batch/subteam?
3. Is the agent forecast improving, stable/stagnant, declining, or based on insufficient data?

The feature is informational only. It does not add navigation, editing, filtering, or coaching actions.

## 2. Definitions

### 2.1 Ranking scopes

- **Tim Gabungan:** the agent's parent folder and all of its child batches/subteams.
- **Tim Leader:** the child folder or batch/subteam where the agent is registered.
- If the agent's folder has no parent, the current folder is used as both the combined and leader scope. The UI must avoid presenting two misleadingly different labels for the same cohort.
- The ranking denominator is the number of agents eligible for ranking because they have auditable SIDAK data in the selected context. It is not the number of all profiler participants.
- Ranking order and score must reuse the canonical SIDAK dashboard/ranking calculation. The quickview must not introduce another scoring formula.

### 2.2 Time and service context

- Ranking uses **YTD** for the selected year and selected service.
- Selecting a month in `MonthRail` does not alter the ranking quickview.
- Forecast uses the selected year and service, data from the start of the year through the latest available period, and a fixed three-month horizon.
- Changing the selected year or service reloads the quickview.

### 2.3 Access scope

- Admin and trainer responses may use all agents available to their normal SIDAK scope.
- Leader responses must remain fail-closed and may only use accessible agents, folders, and services.
- Ranking totals must never reveal the size of a cohort outside the requesting user's access scope.
- An inaccessible agent returns the same protected behavior used by the existing agent detail route.

## 3. Accepted Visual Direction

The accepted direction is **Option A: a structural rail integrated into the bottom of `AgentProfileBar`**.

The rail is separated from the profile identity area by one horizontal divider. It contains three segments:

1. **Tim Gabungan**
   - Primary value: `#8 dari 64`
   - Supporting label: combined parent-team name or short scope description
2. **Tim Leader**
   - Primary value: `#2 dari 12`
   - Supporting label: leader batch/subteam name
3. **Forecast 3 Bulan**
   - Primary value: `Membaik`, `Stabil/Stagnan`, `Memburuk`, or `Data belum cukup`
   - Supporting label: a short explanation such as `Temuan diproyeksikan turun`

### 3.1 Visual rules

- Use the existing background, surface, border, foreground, muted, and semantic state tokens.
- Ranking values use tabular figures.
- Forecast meaning is communicated with icon, text, and supporting copy. Color is supplementary only.
- Use green for improving, neutral foreground for stable/stagnant, red for declining, and amber for insufficient data.
- Do not add gradients, shadows, ornamental badges, nested cards, or decorative motion.
- The rail is not clickable and has no tooltip.
- Loading affects only the rail; the profile identity and actions remain usable.

### 3.2 Responsive behavior

- Desktop and tablet: three columns with vertical separators.
- Mobile: the three metrics stack vertically with horizontal separators.
- No horizontal scrolling is introduced.
- Long folder or leader labels wrap safely without changing the ranking value alignment.

## 4. User-Facing States

### 4.1 Loading

Each rail segment shows a stable-height skeleton. Existing profile content is not replaced by a page-level spinner.

### 4.2 Ready

Both ranks and the forecast status render with the current year/service context.

### 4.3 Missing ranking cohort

Render `—` with supporting copy:

- `Belum ada agent pembanding`, or
- `Agent belum masuk ranking pada konteks ini`.

The UI must not display `#0 dari 0`.

### 4.4 Insufficient forecast data

Render:

- Label: `Data belum cukup`
- Supporting copy: `Butuh minimal 2 periode audit`

This state must not be shown as stable/stagnant.

### 4.5 Partial failure

The backend response may return ranking data while forecast is unavailable, or forecast data while one cohort cannot be resolved. Each segment renders independently.

### 4.6 Request failure

Render a compact neutral fallback inside the rail:

`Quickview belum dapat dimuat`

The profile, filters, audit summary, and other detail-page sections remain usable.

### 4.7 Stale responses

The UI must never render a response whose returned year or service differs from the current selection. While the replacement request is in flight, show the rail skeleton instead of retained data from the previous context.

## 5. Shared Contract

Add a shared response contract equivalent to:

```ts
interface SidakAgentRankQuickview {
  rank: number | null;
  total: number;
  scopeId: string | null;
  scopeLabel: string;
}

interface SidakAgentForecastQuickview {
  status: "improving" | "declining" | "stable" | "insufficient_data";
  label: "Membaik" | "Memburuk" | "Stabil/Stagnan" | "Data belum cukup";
  supportingText: string;
  findingsSlope: number | null;
  sourcePointCount: number;
  confidence: "low" | "medium" | "high" | null;
  horizonMonths: 3;
}

interface SidakAgentQuickviewResponse {
  context: {
    agentId: string;
    year: number;
    serviceType: ServiceType;
    periodMode: "ytd";
  };
  combinedTeam: SidakAgentRankQuickview | null;
  leaderTeam: SidakAgentRankQuickview | null;
  forecast: SidakAgentForecastQuickview | null;
}
```

Export these contracts as `SidakAgentRankQuickview`,
`SidakAgentForecastQuickview`, and `SidakAgentQuickviewResponse`.

## 6. Backend Architecture

### 6.1 Endpoint

Add:

```text
GET /sidak/agents/:id/quickview?year=<year>&service_type=<service>
```

The endpoint uses the same role protection and scope resolution as the existing agent detail route.

### 6.2 Service boundary

Add the focused service module:

```text
apps/api/src/services/sidak/agent-quickview.ts
```

This module owns:

- resolving the agent's child folder and parent folder;
- calculating combined-team and leader-team ranking positions;
- obtaining the existing deterministic forecast entry for the agent;
- shaping the shared quickview response.

It must not duplicate score calculation, ranking sorting, or forecast classification.

### 6.3 Ranking calculation

For each resolved cohort:

1. Reuse the canonical dashboard/ranking data path with `limit: 0`.
2. Apply selected year, selected service, YTD period semantics, accessible agent IDs, allowed services, and the cohort folder ID.
3. Locate the viewed agent in the canonical ordered ranking.
4. Return its one-based position and the number of ranked agents.

The combined and leader calculations may execute in parallel after folder resolution.

### 6.4 Folder resolution

Resolve the agent's `batch_name` against the accessible profiler folder catalog.

- Exact folder identity should use the existing folder ID/catalog rules rather than relying only on display labels.
- When the child folder has a parent, use the child for `leaderTeam` and the parent for `combinedTeam`.
- When no parent exists, use the standalone folder as the effective combined cohort and mark both scopes with the same identity so the frontend can avoid duplicate presentation.
- If folder resolution fails, return null for the affected ranking segment without failing forecast generation.

### 6.5 Forecast calculation

Reuse `generateSidakAgentForecast()` with:

- the selected year and service;
- start month `1`;
- the latest available/end month for that year;
- horizon `3`;
- existing accessible agent and allowed-service constraints.

Find the viewed agent across improving, declining, stable, and watchlist entries. The displayed status must come from the existing `classifyStatus()` behavior:

- findings slope `< -0.5`: improving;
- findings slope `> 0.5`: declining;
- otherwise stable;
- fewer than two historical points: insufficient data.

The quickview must not infer forecast direction from score change.

### 6.6 Performance

- The quickview endpoint is independent from the primary agent-detail response so its work does not delay the main dossier.
- Ranking cohorts and forecast generation should run concurrently where dependencies allow.
- No new client or server dependency is required.

## 7. Frontend Architecture

### 7.1 Data hook

Add a small hook such as:

```text
apps/web/src/hooks/useAgentQuickview.ts
```

Responsibilities:

- request quickview data for `agentId`, `selectedYear`, and `selectedService`;
- expose loading, error, and data states;
- suppress retained data whose `context.year` or `context.serviceType` no longer matches the active selection;
- refetch when the detail-page refresh action runs.

### 7.2 Component boundary

Add:

```text
apps/web/src/components/sidak/AgentPerformanceQuickview.tsx
```

Responsibilities:

- render the three rail segments;
- map loading, ready, missing, insufficient-data, partial-error, and request-error states;
- provide semantic text and accessible labels;
- handle responsive stacking.

`AgentProfileBar` owns the outer profile surface and places the new component below its existing identity/action row.

### 7.3 Route integration

`apps/web/src/routes/sidak/agents.$id.tsx` passes:

- `agentId`;
- `selectedYear`;
- `selectedService`;
- the main refresh signal/callback.

The quickview does not depend on `selectedMonth`, `trendStartMonth`, or `trendEndMonth`.

## 8. Accessibility

- Use semantic text for all state meanings.
- Do not rely on red/green color alone.
- Decorative icons use `aria-hidden`; meaningful metric groups receive concise labels.
- Skeleton content must not be announced as real ranking data.
- Values and labels must remain readable in light and dark themes.
- The rail introduces no new keyboard target because it has no action.

## 9. Testing Strategy

### 9.1 Backend

Add focused tests covering:

- child-folder and parent-folder cohort resolution;
- correct rank and total for both cohorts;
- canonical ranking ordering reuse;
- standalone folder fallback;
- agent absent from a cohort ranking;
- inaccessible agent and leader fail-closed behavior;
- allowed-service enforcement;
- forecast status parity for improving, declining, stable, and insufficient data;
- partial results when folder resolution or forecast data is unavailable;
- response context fields.

### 9.2 Frontend

Add component/hook tests covering:

- three ready-state segments and exact labels;
- skeleton state without hiding profile content;
- `—` instead of `#0 dari 0`;
- insufficient-data copy;
- request-error fallback;
- partial-result rendering;
- non-color-only forecast meaning;
- stale response suppression after year/service changes;
- refresh integration;
- mobile stacking classes and dark/light token usage.

### 9.3 Verification gates

Run, at minimum:

```bash
pnpm --filter @trainers/api exec vitest run <quickview-api-tests>
pnpm --filter @trainers/web exec vitest run <quickview-web-tests>
pnpm --filter @trainers/web exec tsc --noEmit
pnpm --filter @trainers/web lint
pnpm build
git diff --check
```

Perform visual review for desktop, mobile, light mode, and dark mode. Run the Impeccable detector/audit against the changed UI files and resolve all P0/P1 findings.

## 10. Documentation

Update the human-readable SIDAK logic/design documentation to record:

- definitions of Tim Gabungan and Tim Leader;
- YTD ranking semantics;
- denominator eligibility;
- three-month deterministic forecast status;
- access-scoped totals;
- insufficient-data behavior.

## 11. Out of Scope

- Making the quickview clickable.
- Adding rank history or rank-change arrows.
- Allowing users to change the forecast horizon from the profile.
- Replacing the full Ranking or Forecast pages.
- Adding AI-generated forecast commentary.
- Changing SIDAK scoring, ranking order, or forecast thresholds.
- Adding new database tables or migrations.

## 12. Rollback

Rollback consists of removing the quickview endpoint/service, shared types, frontend hook/component, and profile integration. No data migration or cleanup is required.
