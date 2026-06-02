# Phase 101: SIDAK Input Selection Grid & Card Refactor

## Requirements & Objective

Refactor the SIDAK Input page (`/sidak/input`) selection steps (folder, agent, period) and temuan list to use a unified, responsive grid layout with shared components. This improves visual consistency, reduces code duplication, and makes the interface more glanceable on desktop without sacrificing mobile readability.

## Changes

### 1. New Shared Components

- **`SidakSelectionCard.tsx`** — Unified vertical card component (flex-col, min-h-32, rounded-2xl, p-5) with icon slot, title, optional subtitle, framer-motion animation, and hover/active states. Replaces 3 inline card implementations (folder, agent, period).

- **`SidakSelectionGrid.tsx`** — Responsive grid container (`grid-cols-1 sm:grid-cols-2 xl:grid-cols-3`) with testId support. Wraps `SidakSelectionCard` children in a consistent layout.

- **`TemuanGroupGrid.tsx`** — Responsive grid container for temuan group cards (`grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 items-start gap-4`). Accepts `TemuanGroup[]` and spreads remaining `TemuanGroupCardProps` handlers via Omit utility type.

### 2. Component Extraction in `input.tsx`

- Folder selection: replaced inline `motion.button` + icon + chevron pattern with `<SidakSelectionGrid>` + `<SidakSelectionCard>`
- Agent selection: same extraction; skeleton loaders updated to match new card shape (min-h-32 p-5)
- Period selection: same extraction; period cards now use a consistent layout
- Temuan list: replaced inline `groupedTemuan.map(...)` with `<TemuanGroupGrid>` reducing ~30 lines to 1

### 3. Layout Changes

- Container width: removed conditional `max-w-6xl`/`max-w-3xl` switching — now always `max-w-6xl` for consistent breathing room
- Selection cards: changed from horizontal (`flex items-center gap-4 px-5 py-4`) to vertical (`flex-col items-start justify-between p-5 min-h-32`)
- Temuan grid: changed from single-column `space-y-3` to responsive multi-column grid (1→2→3 columns)
- Responsive button layout inside TemuanGroupCard edit panel: `flex flex-col sm:flex-row gap-2`

### 4. TemuanGroupCard Interface Cleanup

- Exported `TemuanItem`, `TemuanGroup`, and `TemuanGroupCardProps` interfaces
- Renamed `Props` → `TemuanGroupCardProps`
- Replaced outer `<div>` with `<article>` for semantic HTML
- Removed unused `X` icon import

### 5. Test Updates

- `sidak-input-parity.test.tsx`: updated assertions from vertical-list layout to multi-column grid layout; added `SidakSelectionCard` contract tests (min-h-32, flex-col)
- `sidak-selection-grid.test.tsx` (NEW): 1 test — validates SidakSelectionGrid renders responsive classes and content
- `temuan-group-grid.test.tsx` (NEW): 1 test — validates TemuanGroupGrid renders responsive classes and indicator labels

## Files Modified (4) + Created (5)

| File | Action |
|------|--------|
| `apps/web/src/components/sidak/SidakSelectionCard.tsx` | NEW |
| `apps/web/src/components/sidak/SidakSelectionGrid.tsx` | NEW |
| `apps/web/src/components/sidak/TemuanGroupGrid.tsx` | NEW |
| `apps/web/src/__tests__/sidak-selection-grid.test.tsx` | NEW |
| `apps/web/src/__tests__/temuan-group-grid.test.tsx` | NEW |
| `apps/web/src/routes/sidak/input.tsx` | MODIFIED |
| `apps/web/src/components/sidak/TemuanGroupCard.tsx` | MODIFIED |
| `apps/web/src/__tests__/sidak-input-parity.test.tsx` | MODIFIED |
| `docs/SIDAK_LOGIC_AND_SCORING.md` | MODIFIED |

## Verification

- All existing SIDAK input tests pass with updated layout assertions
- New component unit tests pass for grid layouts and card rendering
- No new dependencies added
- Zero logic changes — pure UI extraction and layout refactor
