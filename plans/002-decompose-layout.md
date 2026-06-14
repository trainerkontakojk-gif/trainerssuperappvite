# Plan 002: Decompose monolithic Layout.tsx into sub-components

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 671c610..HEAD -- apps/web/src/components/Layout.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L (2 days)
- **Risk**: MED — pure refactor, no behavior change, but incorrect extraction could break sidebar state
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `671c610`, 2026-06-13

## Why This Matters

`Layout.tsx` is **679 lines** — a single file containing the sidebar, header, mobile overlay, mobile bottom tab bar, user menu dropdown, SIDAK sub-nav, Telefun maintenance guard, and all associated state. This makes it impossible to redesign individual shell pieces in isolation. Plans 003, 004, and 005 each need to rewrite a specific sub-component; they can't do that if everything is tangled in one file.

The decomposition is a **pure structural refactor** with zero visual/behavioral changes. The exact same JSX, same classes, same state — just in separate files.

## Current State

**Single file**: `apps/web/src/components/Layout.tsx` (679 lines)

Structure inside `DashboardLayoutContent()`:
- Lines 35-60: `SIDAK_CHILDREN` config constant
- Lines 62-93: `MANAGEMENT_LINKS` config constant
- Lines 95-106: `MOBILE_TAB_IDS` / `MOBILE_TABS` constants
- Lines 108-152: `getHeaderContent()` function
- Lines 154-301: Component state + effects + public route guard
- Lines 302-510: Sidebar JSX (`<aside>`)
- Lines 512-620: Main content area (header + workspace section)
- Lines 622-665: Mobile bottom tab bar
- Lines 667: Maintenance modal
- Lines 672-678: `DashboardLayout` wrapper with TelefunWarningProvider

**Conventions**:
- Components are in `apps/web/src/components/` (flat structure, no subdirs for layout currently)
- Imports use relative paths from `../` or `./`
- Path alias `@` → `./src` is configured in `vite.config.ts`

**Exemplar for structure**: `apps/web/src/routes/profiler/components/` uses subdirectories with focused components (e.g., `workspace/WorkspaceHeader.tsx`, `workspace/WorkspaceNavigator.tsx`)

## Commands You Will Need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `pnpm --filter @trainers/web tsc --noEmit` | exit 0              |
| Build     | `pnpm build:web`                     | exit 0              |
| Lint      | `pnpm --filter @trainers/web lint`   | exit 0              |
| Test      | `pnpm test:targeted`                 | all pass            |

## Scope

**In scope** (files you will create/modify):
- `apps/web/src/components/Layout.tsx` — slim down to orchestration only
- `apps/web/src/components/layout/Sidebar.tsx` [NEW]
- `apps/web/src/components/layout/AppHeader.tsx` [NEW]
- `apps/web/src/components/layout/MobileTabBar.tsx` [NEW]
- `apps/web/src/components/layout/UserMenu.tsx` [NEW]
- `apps/web/src/components/layout/nav-config.ts` [NEW] — extracted constants
- `apps/web/src/components/layout/index.ts` [NEW] — barrel export

**Out of scope**:
- `apps/web/src/router.tsx` — must NOT change; it imports `DashboardLayout` from `../components/Layout`
- `apps/web/src/routes/*` — no page files touched
- Any behavioral changes — this is EXTRACTION only
- `apps/web/src/components/ThemeToggle.tsx` — already separate, keep as-is

## Git Workflow

- Branch: `advisor/002-decompose-layout`
- Commit per step
- Commit style: `refactor: extract <Component> from Layout.tsx`
- Do NOT push or open a PR.

## Steps

### Step 1: Create the layout directory and nav-config

Create `apps/web/src/components/layout/nav-config.ts` with the extracted constants:

```typescript
// Extract from Layout.tsx lines 35-106
export const SIDAK_CHILDREN = [ /* ... exact content from Layout.tsx:35-60 */ ];
export const MANAGEMENT_LINKS = [ /* ... exact content from Layout.tsx:62-93 */ ];
export const MOBILE_TAB_IDS = ["dashboard","ketik","pdkt","telefun","profiler","qa-analyzer"] as const;

// Import APP_MODULES and re-export MOBILE_TABS
import { APP_MODULES } from "../../lib/app-config";
export const MOBILE_TABS = APP_MODULES.filter((module) =>
  MOBILE_TAB_IDS.some((id) => id === module.id),
);

// Extract getHeaderContent function from Layout.tsx:108-152
export function getHeaderContent(pathname: string) { /* ... exact content ... */ }
```

**Verify**: `pnpm --filter @trainers/web tsc --noEmit` → exit 0

### Step 2: Extract UserMenu component

Create `apps/web/src/components/layout/UserMenu.tsx`:

```typescript
// Contains: user avatar button + dropdown (Layout.tsx:538-594)
// Props: { profile, session, theme, setTheme, handleLogout }
// State: userMenuOpen, userMenuRef (moved from Layout)
```

The UserMenu handles:
- Avatar button with initial letter
- Dropdown with signed-in info, Account link, Theme toggle, Logout
- Click-outside close behavior (useRef + useEffect)

**Verify**: `pnpm --filter @trainers/web tsc --noEmit` → exit 0

### Step 3: Extract AppHeader component

Create `apps/web/src/components/layout/AppHeader.tsx`:

```typescript
// Contains: the sticky glass header (Layout.tsx:516-598)
// Props: { pathname, onOpenMobileMenu, profile, session, theme, setTheme, handleLogout }
// Renders: hamburger button, eyebrow+title, ThemeToggle, <UserMenu />
```

Import `getHeaderContent` from `./nav-config` and `UserMenu` from `./UserMenu`.

**Verify**: `pnpm --filter @trainers/web tsc --noEmit` → exit 0

### Step 4: Extract Sidebar component

Create `apps/web/src/components/layout/Sidebar.tsx`:

```typescript
// Contains: the <aside> block (Layout.tsx:313-510)
// Props: {
//   pathname, profile,
//   effectiveIsCollapsed, isSidebarCollapsed, isSidebarHovered,
//   setIsSidebarCollapsed, setIsSidebarHovered,
//   sidakOpen, setSidakOpen,
//   mobileMenuOpen, setMobileMenuOpen,
//   hasTelefunAccess, openMaintenance,
//   theme, setTheme, handleLogout, session
// }
```

Import `SIDAK_CHILDREN`, `MANAGEMENT_LINKS` from `./nav-config`.

**Verify**: `pnpm --filter @trainers/web tsc --noEmit` → exit 0

### Step 5: Extract MobileTabBar component

Create `apps/web/src/components/layout/MobileTabBar.tsx`:

```typescript
// Contains: the <nav> bottom tab bar (Layout.tsx:624-665)
// Props: { pathname, profile, hasTelefunAccess, openMaintenance, setMobileMenuOpen }
```

Import `MOBILE_TABS` from `./nav-config`.

**Verify**: `pnpm --filter @trainers/web tsc --noEmit` → exit 0

### Step 6: Create barrel export

Create `apps/web/src/components/layout/index.ts`:
```typescript
export { Sidebar } from './Sidebar';
export { AppHeader } from './AppHeader';
export { MobileTabBar } from './MobileTabBar';
export { UserMenu } from './UserMenu';
```

**Verify**: file exists, exports 4 components.

### Step 7: Rewrite Layout.tsx as orchestrator

Replace `Layout.tsx` content — it should now be ~100 lines max:

```typescript
import { Outlet, useLocation } from "@tanstack/react-router";
import { Suspense, useState, useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { supabase } from "../lib/supabase";
import { clearAuthLocalState } from "../lib/authLocalState";
import { useThemeMode } from "../hooks/useThemeMode";
import { TelefunWarningProvider, useTelefunWarning } from "../context/TelefunWarningContext";
import { MaintenanceModal } from "../routes/telefun/components/MaintenanceModal";
import { Sidebar, AppHeader, MobileTabBar } from "./layout";

function DashboardLayoutContent() {
  // ... keep ALL existing state and effects (lines 155-288)
  // ... but JSX is now composed from sub-components:

  return (
    <div className="flex h-screen bg-background text-foreground transition-colors duration-300">
      {mobileMenuOpen && <div className="..." onClick={() => setMobileMenuOpen(false)} />}
      <Sidebar ... />
      <main className="flex-1 flex flex-col overflow-hidden ...">
        {!pathname.startsWith("/profiler") && <AppHeader ... />}
        <section className="flex-1 min-w-0 ...">
          <Suspense ...><Outlet /></Suspense>
        </section>
      </main>
      <MobileTabBar ... />
      <MaintenanceModal ... />
    </div>
  );
}

export function DashboardLayout() {
  return (
    <TelefunWarningProvider>
      <DashboardLayoutContent />
    </TelefunWarningProvider>
  );
}
```

**Verify**:
1. `pnpm --filter @trainers/web tsc --noEmit` → exit 0
2. `pnpm build:web` → exit 0
3. `pnpm test:targeted` → all pass

### Step 8: Verify the export contract is preserved

The file `router.tsx` imports `DashboardLayout` from `../components/Layout`. Confirm this import still resolves:

```bash
grep -n "DashboardLayout" apps/web/src/router.tsx
```

→ Should show: `import { DashboardLayout } from "../components/Layout";` — unchanged.

**Verify**: `pnpm build:web` → exit 0 (entire app builds without route errors)

## Test Plan

- No new tests needed — this is a zero-behavior-change refactor.
- Run `pnpm test:targeted` — all existing tests must pass.
- Visual: start dev server, confirm sidebar/header/mobile nav look and behave identically.
- Confirm keyboard shortcut flows (sidebar collapse, user menu open/close) still work.

## Done Criteria

- [ ] `pnpm build:web` exits 0
- [ ] `pnpm test:targeted` exits 0
- [ ] `wc -l apps/web/src/components/Layout.tsx` returns ≤ 150 lines
- [ ] 6 new files exist under `apps/web/src/components/layout/`
- [ ] `grep "DashboardLayout" apps/web/src/router.tsx` still resolves correctly
- [ ] No files outside the in-scope list are modified
- [ ] `plans/README.md` status row updated

## STOP Conditions

- Layout.tsx at lines 302-670 doesn't match the structure described above (codebase drifted).
- After extraction, sidebar collapse/expand no longer works — state wiring between Layout and Sidebar is broken.
- After extraction, mobile menu no longer opens — the overlay's click handler lost its reference.
- TypeScript errors involving the `useTelefunWarning` context — it must remain INSIDE the `TelefunWarningProvider` boundary.

## Maintenance Notes

- Plans 003, 004, 005 will each **rewrite** one of these extracted components. This plan just creates the files so they can be worked on independently.
- The prop-drilling in this extraction is intentionally heavy — it mirrors the current state management. A future plan could introduce a `LayoutContext` to reduce prop chains, but that's premature here.
- `router.tsx` still imports from `../components/Layout` (the wrapper). This path MUST NOT change.
