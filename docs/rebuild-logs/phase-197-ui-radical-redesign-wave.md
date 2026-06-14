# Phase 197: UI Radical Redesign Wave

## Ringkasan

Massive UI redesign across 8+ modules following `docs/design.md` design system. Implemented 11 improvement plans in a single wave: design tokens, layout decomposition, motion primitives, SIDAK redesign, dashboard bento, users redesign, activity logs, profiler workspace, and monitoring polish.

Designed under `ui-ux-pro-max` and `thermo-nuclear-code-quality-review` skill guidelines.

## Perubahan

### 1. Design System — Canonical CSS Variables

**File:** `apps/web/src/index.css`

New canonical token system replacing hardcoded Tailwind colors:

```css
--bg: #fafafa;         /* light */  #0a0a0a;        /* dark */
--surface: #f5f5f5;               #171717;
--border: #e5e5e5;                #262626;
--fg: #0a0a0a;                    #fafafa;
--fg2: #525252;                   #a3a3a3;
--fg3: #a3a3a3;                   #525252;
--inv-bg: #0a0a0a;               #fafafa;
--inv-fg: #fafafa;                #0a0a0a;
```

Tailwind compatibility aliases added: `--background`, `--foreground`, `--card`, `--muted`, etc. Module accent colors preserved (`--module-ketik`, `--module-pdkt`, `--module-telefun`, `--module-profiler`, `--module-sidak`). Old shadcn-inspired stone palette replaced.

### 2. Layout Decomposition

**File:** `apps/web/src/components/Layout.tsx` (566 → 18 lines)

Extracted 7 new files under `apps/web/src/components/layout/`:

| Component | Description |
|-----------|-------------|
| `Sidebar.tsx` | Desktop sidebar with SIDAK/Admin submenus |
| `AppHeader.tsx` | Top header with hamburger, logo, user menu |
| `MobileTabBar.tsx` | Bottom tab bar (Phase 193, moved here) |
| `MobileDrawer.tsx` | Mobile sidebar overlay |
| `UserMenu.tsx` | User menu with profile, theme toggle, logout |
| `nav-config.ts` | Centralized navigation configuration |
| `index.ts` | Barrel file |

### 3. Motion Primitives

**New files** under `apps/web/src/components/motion/`:

| Component | Purpose |
|-----------|---------|
| `FadeIn.tsx` | Single fade-up entrance animation |
| `StaggerList.tsx` | Container with staggered children animation |
| `StaggerItem.tsx` | Individual staggered item |
| `PageTransition.tsx` | Page-level entrance transition |

Standard parameters: `initial={{ opacity: 0, y: 15 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.4, ease: "easeOut" }}`.

### 4. SIDAK Module Radical Redesign

21 files modified with new design tokens:

| Component | Key Changes |
|-----------|-------------|
| `AgentCard.tsx` | Removed gradient blobs, decorative backgrounds. Clean border + `--surface`. Risk badges as plain text (no pulse dots, no colored bg). |
| `AgentProfileBar.tsx` | Removed gradient borders, decorative blobs, blurred backdrops. Clean avatar border, `font-outfit` heading, dot-separated metadata. |
| `AgentTemuanTab.tsx` | Removed card gradients, decorative banners. Clean `--surface` cards with `--border`. |
| `DashboardFilters.tsx` | Clean filter layout with `--border` selects. |
| `KpiCard.tsx` | Simplified to `--surface` + `--border`. Removed progress bar backgrounds. |
| `ParetoChart.tsx` | Clean legends, consistent bar colors. |
| `ScoreDetailCard.tsx` | Minimal typography-driven layout. |
| `SidakInput*` | Removed glassmorphism backdrops, decorative blur. Clean cards. |
| `ParamTrendChart.tsx` | Clean axis, minimal grid. |
| `FatalDonutChart.tsx` | Simplified donut with semantic colors. |

### 5. Dashboard Bento Grid Redesign

**File:** `apps/web/src/routes/dashboard.tsx` (612 → 456 lines)

- Minimal hero: "Halo, [Name]." with role context text
- 3-column bento grid with StaggerList/StaggerItem animations
- Module cards: KETIK, PDKT, Telefun, KTP/Profiler, SIDAK overview with sparkline
- Quick stats panel (Ringkasan) with total sessions/findings/agents
- Recent activities card with time-ago formatting
- Management actions row (if admin/trainer)
- Responsive: 1-col mobile, 2-col tablet, 3-col desktop

### 6. User Management Radical Redesign

**File:** `apps/web/src/routes/dashboard/users.tsx`

- Removed decorative badge icons (`ShieldCheck`, `UserPlus`, `XCircle`, `CheckCircle2`, etc.)
- Removed "Actions Description Cards" (clutter removal per design.md)
- CSS variables throughout: `--fg`, `--fg2`, `--fg3`, `--surface`, `--border`
- `AnimatePresence` entrance animations on user cards
- Clean status pills with border-only styling
- Consistent `font-outfit` for headings

### 7. Activity Logs UI Refactor

**File:** `apps/web/src/routes/dashboard/activities.tsx`

- Responsive padding (`p-4 lg:p-8`)
- Semantic chart colors for CRUD action badges
- Clean table with module badges using `--module-*` variables
- `font-outfit` headings
- `FadeIn` entrance animation

### 8. Profiler Workspace Redesign

6 workspace components updated:

| Component | Key Changes |
|-----------|-------------|
| `BatchHero.tsx` | Clean `--surface` with `--border`, no decorative gradients |
| `HierarchyPanel.tsx` | Dot-separated metadata, minimal icons |
| `InsightPanel.tsx` | `font-outfit` heading, `--border` dividers |
| `ActionToolTile.tsx` | Clean tile with `--surface` hover state |
| `WorkspaceActiveBatch.tsx` | Responsive layout with `--surface` tokens |
| `WorkspaceNavigator.tsx` | Active/inactive states with `--fg`/`--fg3` text |

### 9. Monitoring Visual Polish

6 monitoring components updated:

| Component | Key Changes |
|-----------|-------------|
| `KetikReviewPanel.tsx` | Consistent `--surface`/`--border` tokens |
| `PdktEvaluationPanel.tsx` | Clean loading/error states |
| `TelefunReviewPanel.tsx` | Transcript card with `--surface` background |
| `ReviewStatusBadge.tsx` | Minimal text-based status |
| `UsageTab.tsx` | Clean metric cards |
| `HistoryTab.tsx` | Consistent table borders |

### 10. Access Groups & Approval Redesign

- `access-groups.tsx`: Clean card layout, CSS variables, collapsed sections with `--border`
- `access-approval.tsx`: Responsive layout, unified padding, clean request cards
- `AccessModuleBadge.tsx`: Simple text badge with `--module-*` border-left

## Files Modified

68 files changed, ~3049 insertions, ~2222 deletions.

## Design Philosophy

Per `docs/design.md`:
- **No "AI Slop"**: No decorative badges with useless icons, no gradient blobs, no floating backgrounds
- **Utility-First**: Typography and whitespace carry hierarchy, not colored backgrounds
- **High Contrast**: Crisp borders (`var(--border)`) instead of box shadows
- **Consistent Tokens**: All colors via CSS variables, zero hardcoded `#hex` colors

## Verifikasi

- `pnpm --filter @trainers/web lint` ✅
- `pnpm --filter @trainers/web build` ✅
- Visual check across light/dark mode for all modified modules
- AnimatePresence transitions working on users page
- Bento grid responsive on mobile/tablet/desktop
