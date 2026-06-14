# Plan 002: Radical Redesign of SIDAK Module to Match Design System

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 671c610..HEAD -- apps/web/src/routes/sidak apps/web/src/components/sidak`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L (multi-day — 10 route files, 31 components)
- **Risk**: LOW (visual-only changes, no business logic, no API modifications)
- **Depends on**: none (plan 001-profiler-redesign is DONE, establishes pattern)
- **Category**: tech-debt (UI/UX radical redesign)
- **Planned at**: commit `671c610`, 2026-06-14

## Why this matters

The `docs/design.md` establishes a "Utility-First & Minimalist" design system with a strict "No AI Slop" rule — no floating blobs, no decorative gradients, no excessive shadows. The landing page (`apps/web/src/routes/index.tsx` + `landing.css`) and auth modal have been redesigned with this language: crisp `1px solid var(--border)` borders, `Outfit` headings with tight tracking, `Inter` body text, and flat `var(--surface)` backgrounds.

The Profiler module (plan 001, DONE) was the first internal module to be redesigned. The SIDAK module is the **largest and most complex** module — it has 10 route files and 31 components — and it still carries heavy legacy styling violations:

1. **"AI Slop" violations**: `blur-3xl` glowing blobs in `index.tsx:105-106`, `KpiCard.tsx:73-74`, `AgentCard.tsx:101`. Decorative gradients in `reports/index.tsx:57,85`.
2. **Excessive shadows**: `shadow-xl` in 7 files, `shadow-2xl` in 6 files — violates "Hindari *box-shadow*" rule.
3. **Glassmorphism anti-patterns**: `backdrop-blur-2xl`, `backdrop-blur-3xl`, `bg-white/50 dark:bg-black/20` transparent selects in `ranking.tsx:168-240`. These don't exist in the design system.
4. **Typography misalignment**: Inconsistent use of `font-black`, `font-extrabold`, `font-bold` without clear hierarchy. Missing `font-outfit` on headings. `text-[10px] font-black uppercase tracking-widest` micro-label pattern used inconsistently.
5. **Over-rounded corners**: `rounded-[2.5rem]`, `rounded-[2rem]`, `rounded-3xl` used arbitrarily. Design system specifies `12px` to `24px` (roughly `rounded-xl` to `rounded-3xl`), but `2.5rem = 40px` exceeds this.
6. **Color system violations**: Hardcoded `bg-white/50`, `border-white/20`, `border-black/5` instead of design system variables (`var(--surface)`, `var(--border)`).

Redesigning SIDAK brings the most-used analytical module into visual parity with the new design language, creating a consistent, premium, distraction-free experience.

## Current state

### Route files (in `apps/web/src/routes/sidak/`):

| File | Lines | Role | Key violations |
|------|-------|------|----------------|
| `index.tsx` | 168 | Landing page with module cards | `blur-3xl` blobs (L105-106), `shadow-xl` hero (L104), `backdrop-blur-xl` (L104), over-rounded `rounded-[2.5rem]` |
| `dashboard.tsx` | 537 | Main analytics dashboard | `shadow-sm` on cards (L336,426,462,471,504), `shadow-lg` hover on KpiCard |
| `agents.tsx` | 196 | Agent directory grid | `backdrop-blur-xl` header (L51), `shadow-lg shadow-primary/20` on active batch pills (L101-102) |
| `agents.$id.tsx` | 303 | Agent detail/analysis | `backdrop-blur-sm` header (L159), heavy component composition |
| `ranking.tsx` | 457 | Agent ranking table | `backdrop-blur-3xl` filter bar (L168), `shadow-2xl` (L168), `bg-white/50 dark:bg-black/20` selects (L179,200,222,240), `shadow-xl` table (L257) |
| `input.tsx` | 831 | QA temuan data entry | Large file, wizard steps |
| `periods.tsx` | 350 | Period management | `shadow-lg shadow-primary/20` header icon (L78), `shadow-2xl` modals |
| `settings.tsx` | 401 | Rule version settings | `backdrop-blur-xl` header (L238), `shadow-xl` empty state (L348) |
| `reports/index.tsx` | 154 | Reports landing | `bg-gradient-to-br` decorative overlays (L57,85), `backdrop-blur-sm` (L55,83), `shadow-2xl` modal (L119) |
| `reports-ai.tsx` | ~340 | AI report generator | `shadow-xl` (L145), `backdrop-blur-2xl` throughout |
| `reports-data.tsx` | ~230 | Data report viewer | `shadow-xl` (L101,197), `backdrop-blur-2xl` |

### Component files (in `apps/web/src/components/sidak/`):

| File | Lines | Key violations |
|------|-------|----------------|
| `KpiCard.tsx` | 148 | `blur-3xl` glow blob (L73), `shadow-[0_1px_2px...]` (L71), `hover:shadow-lg` (L71), `backdrop-blur-xl` (L71) |
| `AgentCard.tsx` | 170 | `blur-2xl` glow (L101), `shadow-[0_1px_3px...]` (L98), `hover:shadow-2xl` (L98), `backdrop-blur-sm` (L98) |
| `DashboardFilters.tsx` | 163 | `shadow-[0_1px_2px...]` (L59) — minor but still shadow |
| `TopAgentsTable.tsx` | ~120 | Inline styles, potential shadow usage |
| `EditTemuanModal.tsx` | ~160 | Modal overlay patterns |

### Design system conventions to follow (from `docs/design.md`):

```
- Headings: font-family: Outfit, font-weight: 700-900, letter-spacing: -0.02em to -0.04em
- Body: font-family: Inter, font-weight: 400-600
- Cards: background: var(--surface), border: 1px solid var(--border), NO box-shadow
- Buttons Primary: background: var(--inv-bg), color: var(--inv-fg)
- Buttons Ghost: background: transparent, border: 1px solid var(--border)
- Inputs: background: transparent or var(--bg), border: 1px solid var(--border), focus: border-color var(--fg)
- Border Radius: 12px to 24px (rounded-xl to rounded-3xl)
- Motion: transition 0.15s ease, Framer staggered fade-up
- Colors: ONLY CSS variables (--bg, --surface, --border, --fg, --fg2, --fg3)
```

Exemplar file for the new design language: `apps/web/src/routes/profiler/index.tsx` (post plan-001 redesign) — uses `bg-surface border border-border` without shadows, `font-outfit font-black tracking-tight` for headings, no blobs/gradients.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm --filter @trainers/web typecheck` | exit 0, no errors |
| Lint      | `pnpm --filter @trainers/web lint` | exit 0              |
| Build     | `pnpm --filter @trainers/web build` | exit 0             |
| Test      | `pnpm test:core`         | all pass             |

## Scope

**In scope** (the only files you should modify):

Route files:
- `apps/web/src/routes/sidak/index.tsx`
- `apps/web/src/routes/sidak/dashboard.tsx`
- `apps/web/src/routes/sidak/agents.tsx`
- `apps/web/src/routes/sidak/agents.$id.tsx`
- `apps/web/src/routes/sidak/ranking.tsx`
- `apps/web/src/routes/sidak/input.tsx`
- `apps/web/src/routes/sidak/periods.tsx`
- `apps/web/src/routes/sidak/settings.tsx`
- `apps/web/src/routes/sidak/reports/index.tsx`
- `apps/web/src/routes/sidak/reports-ai.tsx`
- `apps/web/src/routes/sidak/reports-data.tsx`

Component files:
- `apps/web/src/components/sidak/KpiCard.tsx`
- `apps/web/src/components/sidak/AgentCard.tsx`
- `apps/web/src/components/sidak/DashboardFilters.tsx`
- `apps/web/src/components/sidak/TopAgentsTable.tsx`
- `apps/web/src/components/sidak/EditTemuanModal.tsx`
- `apps/web/src/components/sidak/AgentProfileBar.tsx`
- `apps/web/src/components/sidak/ContextControlBar.tsx`
- `apps/web/src/components/sidak/MonthRail.tsx`
- `apps/web/src/components/sidak/ScoreDetailCard.tsx`
- `apps/web/src/components/sidak/TopTicketsCard.tsx`
- `apps/web/src/components/sidak/AiInsightCard.tsx`
- `apps/web/src/components/sidak/AgentTrendTab.tsx`
- `apps/web/src/components/sidak/AgentTemuanTab.tsx`
- `apps/web/src/components/sidak/QaStatePanel.tsx`
- `apps/web/src/components/sidak/SidakInputScoreCard.tsx`
- `apps/web/src/components/sidak/SidakSelectionCard.tsx`
- `apps/web/src/components/sidak/SidakInputManualForm.tsx`
- `apps/web/src/components/sidak/SidakInputImportPanel.tsx`
- `apps/web/src/components/sidak/TemuanGroupCard.tsx`
- `apps/web/src/components/sidak/ParetoChart.tsx`
- `apps/web/src/components/sidak/FatalDonutChart.tsx`
- `apps/web/src/components/sidak/ServiceBarChart.tsx`
- `apps/web/src/components/sidak/ParamTrendChart.tsx`
- `apps/web/src/components/sidak/ParetoImprovementInsight.tsx`
- `apps/web/src/components/sidak/NilaiBadge.tsx`
- `apps/web/src/components/sidak/ScoreDisplay.tsx`
- `apps/web/src/components/sidak/TabSkeleton.tsx`
- `apps/web/src/routes/sidak/settings/components/RuleVersionPicker.tsx`
- `apps/web/src/routes/sidak/settings/components/ServiceWeightsPanel.tsx`
- `apps/web/src/routes/sidak/settings/components/RuleIndicatorsPanel.tsx`
- `apps/web/src/routes/sidak/settings/components/PublishRulePanel.tsx`
- `apps/web/src/routes/sidak/settings/components/AddIndicatorModal.tsx`
- `apps/web/src/routes/sidak/settings/components/EditIndicatorModal.tsx`
- `apps/web/src/routes/sidak/settings/components/PublishPreviewModal.tsx`

**Out of scope** (do NOT touch, even though they look related):
- Any API service files (`apps/api/src/services/sidak*`) — no business logic changes.
- Any hooks files (`apps/web/src/routes/sidak/hooks/*`) — data fetching logic stays unchanged.
- Shared library files (`apps/web/src/lib/scoring.ts`, `apps/web/src/lib/sidak-kpi-delta.ts`) — utility logic untouched.
- `docs/design.md` — the source of truth, do not modify.
- `apps/web/src/components/sidak/pareto-view-model.ts` — pure data transformation, no UI.

## Git workflow

- Branch: `advisor/002-sidak-redesign`
- Commit per step or per logical unit; message style: `style(sidak): <imperative description>`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove all "AI Slop" — blobs, glows, and decorative gradients

In every in-scope file, locate and remove:

1. **Floating blur blobs**: Any `<div>` with `blur-3xl`, `blur-2xl`, or `blur-[120px]` that serves as a decorative background glow. Delete the entire element.
   - `index.tsx:105-106` — two `blur-3xl` blobs inside hero
   - `KpiCard.tsx:72-75` — `blur-3xl` glow blob (`<div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full blur-3xl" style={{ backgroundColor: c.glow }} />`)
   - `AgentCard.tsx:101` — `blur-2xl` hover glow (`<div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/5 blur-2xl...`)

2. **Decorative gradients**: Remove `bg-gradient-to-br from-*/5 to-transparent` overlays.
   - `reports/index.tsx:57` — `<div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent pointer-events-none" />`
   - `reports/index.tsx:85` — `<div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent pointer-events-none" />`

3. **Remove the `glow` property** from `KpiCard.tsx` COLOR_MAP — it's no longer needed:
   ```tsx
   // REMOVE the "glow" key from each color entry in COLOR_MAP
   ```

**Verify**: 
```bash
grep -rn "blur-3xl\|blur-2xl\|blur-\[120px\]" apps/web/src/routes/sidak/ apps/web/src/components/sidak/ | grep -v "backdrop-blur"
```
→ returns empty (backdrop-blur for modals/headers is acceptable in limited use).

```bash
grep -rn "bg-gradient-to" apps/web/src/routes/sidak/ apps/web/src/components/sidak/
```
→ returns empty.

### Step 2: Replace all shadows with crisp borders

In every in-scope file, apply these replacements:

| Find | Replace with |
|------|-------------|
| `shadow-xl shadow-black/5` | (remove, rely on existing `border`) |
| `shadow-xl` | (remove) |
| `shadow-2xl` | (remove) |
| `shadow-lg` | (remove) |
| `shadow-sm` | (remove) |
| `shadow-[0_1px_2px_rgba(15,23,42,0.04)]` | (remove) |
| `shadow-[0_1px_3px_rgba(15,23,42,0.04)]` | (remove) |
| `hover:shadow-lg` | (remove) |
| `hover:shadow-2xl hover:shadow-primary/10` | `hover:border-foreground/20` |
| `shadow-lg shadow-primary/20` | (remove) |
| `shadow-lg shadow-red-500/20` | (remove) |
| `shadow-lg shadow-emerald-500/20` | (remove) |
| `shadow-xl shadow-emerald-500/20` | (remove) |

Where a container loses its shadow, ensure it has `border border-border`. The pattern is:
- Was: `bg-card/40 backdrop-blur-sm shadow-xl border border-border/50`  
- Now: `bg-surface border border-border`

**Verify**:
```bash
grep -rn "shadow-xl\|shadow-2xl\|shadow-lg\b" apps/web/src/routes/sidak/ apps/web/src/components/sidak/ | grep -v "shadow-primary\|shadow-red\|shadow-emerald" | grep -v "\.test\."
```
→ returns only intentional colored shadows on small status badges (if any — those are acceptable).

### Step 3: Remove glassmorphism and standardize backgrounds

Replace all glassmorphism patterns with the design system's flat backgrounds:

| Find | Replace with |
|------|-------------|
| `bg-card/40 backdrop-blur-xl` | `bg-surface` |
| `bg-card/40 backdrop-blur-2xl` | `bg-surface` |
| `bg-card/40 backdrop-blur-sm` | `bg-surface` |
| `bg-card/40 backdrop-blur-md` | `bg-surface` |
| `bg-card/50 backdrop-blur-xl` | `bg-surface` |
| `bg-background/40 backdrop-blur-3xl` | `bg-surface` |
| `bg-background/40 backdrop-blur-2xl` | `bg-surface` |
| `bg-card/60` (in hovers) | `bg-accent` |

For select/input glassmorphism in `ranking.tsx:179,200,222,240`:
```tsx
// Was:
className="w-full h-12 bg-white/50 dark:bg-black/20 backdrop-blur-md border border-black/5 dark:border-white/10 rounded-2xl px-4 appearance-none focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all font-semibold text-sm cursor-pointer"

// Now:
className="w-full h-10 bg-transparent border border-border rounded-lg px-4 appearance-none focus:outline-none focus:border-fg transition-all font-medium text-sm cursor-pointer"
```

For sticky headers — `backdrop-blur-xl` on headers is acceptable but simplify:
```tsx
// Was:
className="sticky top-0 z-30 w-full border-b border-border/40 bg-background/70 backdrop-blur-xl"

// Now:
className="sticky top-0 z-30 w-full border-b border-border bg-background/95 backdrop-blur-sm"
```

For modal overlays — `backdrop-blur-md` stays (it's a functional UX pattern, not decoration):
```tsx
// Keep:
className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-background/80 backdrop-blur-md"
```

**Verify**:
```bash
grep -rn "backdrop-blur-2xl\|backdrop-blur-3xl\|backdrop-blur-xl" apps/web/src/routes/sidak/ apps/web/src/components/sidak/
```
→ returns only sticky headers (with `backdrop-blur-sm`) and modal overlays (with `backdrop-blur-md`).

```bash
grep -rn "bg-white\|bg-black" apps/web/src/routes/sidak/ apps/web/src/components/sidak/
```
→ returns empty (no hardcoded white/black backgrounds).

### Step 4: Standardize border colors and opacity

Replace all fractional border colors with solid design-system borders:

| Find | Replace with |
|------|-------------|
| `border-border/50` | `border-border` |
| `border-border/40` | `border-border` |
| `border-border/70` | `border-border` |
| `border-white/20` | `border-border` |
| `border-white/10` | `border-border` |
| `border-black/5` | `border-border` |

**Verify**:
```bash
grep -rn "border-border/" apps/web/src/routes/sidak/ apps/web/src/components/sidak/ | head -5
```
→ returns empty or very few (e.g., hover states using `/20` are acceptable).

### Step 5: Normalize border radius

Replace over-rounded values with design-system-compliant radii:

| Find | Replace with | Rationale |
|------|-------------|-----------|
| `rounded-[2.5rem]` | `rounded-2xl` | 40px → 16px (24px max per design.md) |
| `rounded-[2rem]` | `rounded-2xl` | 32px → 16px |
| `rounded-[1.5rem]` | `rounded-xl` | 24px — acceptable, but normalize |
| `rounded-3xl` on containers | `rounded-2xl` | 24px → 16px for main containers |

Exception: `rounded-full` on pills/badges/avatars stays.
Exception: `rounded-2xl` on small cards and inputs stays.
Exception: `rounded-lg` and `rounded-xl` stay.

**Verify**:
```bash
grep -rn "rounded-\[2" apps/web/src/routes/sidak/ apps/web/src/components/sidak/
```
→ returns empty.

### Step 6: Align typography with design system

In all in-scope files, ensure:

1. **Page titles** (h1-level): Use `font-outfit font-black tracking-tight text-foreground`
   - Check: `ranking.tsx:153` uses `font-extrabold` → change to `font-black`
   - Check: `reports/index.tsx:41` uses `font-black tracking-tighter` → change tracking to `tracking-tight` (tighter is too extreme)

2. **Section headings** (h2-level): Use `font-outfit font-bold tracking-tight text-foreground`
   - Verify all `<h2>` and `<h3>` in dashboard cards use consistent weight

3. **Body text / descriptions**: Use `text-fg2` (which maps to `text-muted-foreground` in Tailwind)
   - Keep existing `text-muted-foreground` — it maps to `--fg2`

4. **Micro-labels** (uppercase tracking labels): Standardize to `text-[11px] font-semibold uppercase tracking-widest text-muted-foreground`
   - Current inconsistency: some use `font-black`, some use `font-bold`, some `text-[10px]`, some `text-[9px]`
   - Normalize: all micro-labels → `text-[11px] font-semibold uppercase tracking-wide text-muted-foreground`

5. **Value displays** (large numbers in KPI cards): Keep `font-black tabular-nums` — this is correct.

**Verify**: `pnpm --filter @trainers/web lint` → exit 0.

### Step 7: Redesign the SIDAK landing page (`index.tsx`)

The current landing has a hero card with blobs and colored module cards with hover shadows. Redesign to match the clean design language:

```tsx
// Hero section — replace the current elaborate hero with a clean, flat version:
<div className="border-b border-border bg-surface px-8 py-10 sm:py-14">
  <div className="mx-auto max-w-5xl">
    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
      Modul Utama
    </p>
    <h2 className="font-outfit text-4xl font-black tracking-tight text-foreground lg:text-5xl">
      Selamat Datang di SIDAK
    </h2>
    <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
      Pusat kendali analisis kualitas. Pantau performa agen, identifikasi area perbaikan...
    </p>
  </div>
</div>
```

Module cards — remove color config complexity. Use simple border + hover:
```tsx
// Each card:
<motion.div
  whileHover={{ y: -2 }}
  className="group flex h-full flex-col rounded-2xl border border-border bg-surface p-6 transition-all hover:border-foreground/20"
>
  <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl bg-muted">
    <card.icon className="h-5 w-5 text-muted-foreground" />
  </div>
  <h4 className="font-outfit text-base font-bold tracking-tight text-foreground">
    {card.title}
  </h4>
  <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
    {card.desc}
  </p>
  <div className="mt-4 flex items-center text-[11px] font-semibold text-muted-foreground group-hover:text-foreground transition-colors">
    Buka Modul <ArrowRight className="ml-1 h-3 w-3" />
  </div>
</motion.div>
```

Remove the entire `colorConfig` record — it's no longer needed.

**Verify**: `pnpm --filter @trainers/web build` → exit 0.

### Step 8: Redesign the Ranking page filter bar and table

The ranking page has the heaviest glassmorphism violations. Redesign:

**Filter bar** — replace `bg-background/40 backdrop-blur-3xl border-white/20 shadow-2xl` with:
```tsx
<div className="rounded-2xl border border-border bg-surface p-4 md:p-6">
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
    {/* Each select */}
    <div className="space-y-2">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-2 px-1">
        <LayoutGrid className="w-3.5 h-3.5" /> Layanan
      </label>
      <select className="w-full h-10 bg-transparent border border-border rounded-lg px-3 appearance-none focus:outline-none focus:border-foreground transition-all text-sm cursor-pointer">
```

**Table wrapper** — replace `bg-background/40 backdrop-blur-2xl border-white/20 rounded-[2.5rem] shadow-xl` with:
```tsx
<div className="rounded-2xl border border-border bg-surface overflow-hidden">
```

**Table header row** — replace `bg-white/50 dark:bg-black/20` with:
```tsx
<tr className="bg-muted/50">
```

**Verify**: Visual inspection — the ranking table should have crisp borders, no blur, no transparency.

### Step 9: Redesign KPI Cards

Replace the current elaborate KPI card with a cleaner version:

1. Remove the `glow` property from `COLOR_MAP`
2. Remove the blur blob element (line 72-75)
3. Replace the card wrapper:

```tsx
// Was:
<article className="relative flex h-full flex-col overflow-hidden rounded-[2.5rem] border border-border/70 bg-card/50 p-5 shadow-[0_1px_2px...] backdrop-blur-xl transition-shadow duration-300 hover:shadow-lg">

// Now:
<article className="relative flex h-full flex-col rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-foreground/20">
```

4. Keep the sparkline chart — it's functional and adds data density.
5. Keep the delta badge — it's informational.

**Verify**: `grep -rn "blur-3xl\|shadow-lg" apps/web/src/components/sidak/KpiCard.tsx` → empty.

### Step 10: Redesign Agent Cards

1. Remove the blur glow element (line 101)
2. Replace the card wrapper:

```tsx
// Was:
className="group relative block overflow-hidden rounded-[2rem] border border-border/50 bg-card/40 p-5 shadow-[0_1px_3px...] backdrop-blur-sm transition-all duration-300 hover:border-primary/30 hover:shadow-2xl hover:shadow-primary/10"

// Now:
className="group relative block rounded-2xl border border-border bg-surface p-5 transition-all duration-200 hover:border-foreground/20"
```

3. Keep the status badge (At Risk / Compliant) — it's functional.
4. Keep the trend icon — it's informational.

**Verify**: `grep -rn "blur-2xl\|shadow-2xl" apps/web/src/components/sidak/AgentCard.tsx` → empty.

### Step 11: Standardize dashboard card containers

In `dashboard.tsx`, replace every chart/data card container:

```tsx
// Was (all chart sections):
<div className="bg-card p-4 rounded-2xl border border-border shadow-sm">

// Now:
<div className="bg-surface p-4 rounded-2xl border border-border">
```

Remove `shadow-sm` from all dashboard cards. The DashboardFilters component gets the same treatment:
```tsx
// Was:
className="flex flex-col gap-3 rounded-[2rem] border border-border/70 bg-card px-3 py-3 shadow-[0_1px_2px...] lg:flex-row ..."

// Now:
className="flex flex-col gap-3 rounded-2xl border border-border bg-surface px-3 py-3 lg:flex-row ..."
```

**Verify**: `grep -rn "shadow-sm\|shadow-\[0" apps/web/src/routes/sidak/dashboard.tsx apps/web/src/components/sidak/DashboardFilters.tsx` → empty.

### Step 12: Standardize reports pages

In `reports/index.tsx`, `reports-ai.tsx`, `reports-data.tsx`:

1. Remove gradient overlays (Step 1 already handles this)
2. Replace card containers:
```tsx
// Was:
className="bg-card/40 backdrop-blur-2xl border border-white/20 rounded-[2rem] shadow-xl p-6 space-y-4"

// Now:
className="bg-surface border border-border rounded-2xl p-6 space-y-4"
```

3. The `reports/index.tsx` cards should match the new landing card pattern from Step 7.

**Verify**: `grep -rn "backdrop-blur-2xl\|border-white" apps/web/src/routes/sidak/reports*` → empty.

### Step 13: Standardize periods and settings pages

**Periods page** (`periods.tsx`):
- Replace `shadow-lg shadow-primary/20` on header icon → remove shadow
- Replace `shadow-2xl` on delete confirmation modal → remove
- Normalize `rounded-[2rem]` → `rounded-2xl`

**Settings page** (`settings.tsx`):
- Replace `bg-card/50 backdrop-blur-xl` header → `bg-surface`
- Replace `shadow-xl` on empty state → remove
- Check all settings sub-components (modals) for shadow/blur violations

**Settings modals** (`AddIndicatorModal.tsx`, `EditIndicatorModal.tsx`, `PublishPreviewModal.tsx`):
- Keep `backdrop-blur-md` on overlay (functional)
- Replace `shadow-2xl` on modal card → remove, ensure `border border-border`
- Replace `shadow-xl shadow-emerald-500/20` on publish button → remove colored shadow

**Verify**: `pnpm --filter @trainers/web build` → exit 0.

### Step 14: Standardize input page

The `input.tsx` is the largest file (831 lines). Focus on:

1. Replace wizard step card containers — remove shadows, use flat borders
2. Standardize all select/input styling to match design system
3. Ensure form cards use `bg-surface border border-border rounded-2xl p-6`
4. Check sub-components: `SidakInputScoreCard.tsx`, `SidakSelectionCard.tsx`, `SidakInputManualForm.tsx`, `SidakInputImportPanel.tsx`, `TemuanGroupCard.tsx`

**Verify**: `pnpm --filter @trainers/web build` → exit 0.

### Step 15: Verify micro-animations follow design system

In all in-scope files, verify Framer Motion usage:

1. **Entrance animations**: Should use `initial={{ opacity: 0, y: 15 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.4, ease: "easeOut" }}` — keep as-is, they match.
2. **Hover animations**: `whileHover={{ y: -5 }}` is too aggressive → normalize to `whileHover={{ y: -2 }}`.
3. **CSS transitions**: Ensure `transition-all duration-150 ease-out` on interactive elements.
4. Remove any `animate-pulse` on decorative elements (keep on status dots — those are functional).

**Verify**: `pnpm --filter @trainers/web lint` → exit 0.

### Step 16: Final build and regression check

1. Run full build: `pnpm --filter @trainers/web build` → exit 0
2. Run typecheck: `pnpm --filter @trainers/web typecheck` → exit 0  
3. Run lint: `pnpm --filter @trainers/web lint` → exit 0
4. Run core tests: `pnpm test:core` → all pass
5. Verify no out-of-scope files modified: `git diff --name-only` shows only in-scope files

## Test plan

- **Automated**: `pnpm --filter @trainers/web build` and `pnpm test:core` — ensures no TypeScript errors and no regression in existing tests.
- **Manual UI Check**: Run `pnpm dev`, navigate through every SIDAK page:
  1. `/sidak` — landing page: no blobs, no gradients, flat cards with crisp borders
  2. `/sidak/dashboard` — KPI cards without glows, chart cards without shadows
  3. `/sidak/agents` — agent grid with flat cards, no blur glows
  4. `/sidak/agents/<id>` — detail page clean
  5. `/sidak/ranking` — no glassmorphism selects, clean table
  6. `/sidak/input` — wizard steps clean
  7. `/sidak/periods` — clean management page
  8. `/sidak/settings` — clean settings with modals
  9. `/sidak/reports` — no gradient overlays, clean cards
  10. `/sidak/reports-data` — clean data viewer
  11. `/sidak/reports-ai` — clean AI report page
- **Dark/Light Mode**: Verify both modes on all pages — the design system variables handle this automatically.

## Done criteria

- [ ] `pnpm --filter @trainers/web typecheck` exits 0
- [ ] `pnpm --filter @trainers/web build` exits 0
- [ ] `pnpm --filter @trainers/web lint` exits 0
- [ ] `pnpm test:core` exits 0
- [ ] `grep -rn "blur-3xl\|blur-2xl\|blur-\[120px\]" apps/web/src/routes/sidak/ apps/web/src/components/sidak/ | grep -v backdrop-blur` returns empty
- [ ] `grep -rn "shadow-xl\|shadow-2xl" apps/web/src/routes/sidak/ apps/web/src/components/sidak/` returns empty (excluding intentional small status badge shadows)
- [ ] `grep -rn "bg-gradient-to" apps/web/src/routes/sidak/ apps/web/src/components/sidak/` returns empty
- [ ] `grep -rn "backdrop-blur-2xl\|backdrop-blur-3xl\|backdrop-blur-xl" apps/web/src/routes/sidak/ apps/web/src/components/sidak/` returns only acceptable patterns (sticky headers, modal overlays)
- [ ] `grep -rn "bg-white\|bg-black" apps/web/src/routes/sidak/ apps/web/src/components/sidak/` returns empty
- [ ] `grep -rn "rounded-\[2" apps/web/src/routes/sidak/ apps/web/src/components/sidak/` returns empty
- [ ] No files outside the in-scope list are modified (`git diff --name-only`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code at the locations in "Current state" doesn't match the excerpts (the codebase has drifted since this plan was written).
- A step's verification fails twice after a reasonable fix attempt.
- The fix appears to require touching an out-of-scope file (especially API services, hooks, or library utilities).
- Removing a shadow/blur causes a layout to collapse or elements to become invisible (this would indicate the shadow was load-bearing for contrast — investigate the underlying bg color).
- Any Recharts or chart component breaks because of a container style change (charts are sensitive to container dimensions).
- The build fails on a TypeScript error related to a removed prop (e.g., `glow` in KpiCard) — this means an upstream consumer passes it.
- Input page wizard functionality breaks (step navigation, form state) — these are complex state machines.

## Maintenance notes

- This redesign establishes the pattern for remaining modules (KETIK, PDKT, Telefun, Dashboard). Future module redesigns should follow the same approach: remove AI slop → replace shadows → replace glassmorphism → normalize borders → normalize radius → align typography.
- The `docs/design.md` is the source of truth. If the design system evolves, update that file first, then propagate.
- Reviewers should scrutinize any PR introducing `shadow-xl`, `blur-3xl`, `backdrop-blur-2xl`, `bg-gradient-to-br`, or `rounded-[2.5rem]` — these are now banned patterns.
- The `colorConfig` object in `index.tsx` is being removed entirely. If a future design needs per-module accent colors, define them in the design system document first.
- Chart components (Recharts) are intentionally left untouched in their internal rendering. Only the container cards around them change. If chart colors need updating, that's a separate plan.
- The `DashboardFilters.tsx` component is shared — changes here affect the dashboard view. Verify after changes.
