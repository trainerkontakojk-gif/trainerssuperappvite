# Plan 012: Hide the sidebar shell on mobile

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report - do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 6204fbf..HEAD -- apps/web/src/components/layout/Sidebar.tsx apps/web/src/__tests__/sidebar-active-open-separation.test.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW - the change is limited to responsive shell visibility, but a bad breakpoint change could hide desktop nav
- **Depends on**: plans/005-redesign-mobile-nav.md
- **Category**: bug
- **Planned at**: commit `6204fbf`, 2026-06-22

## Why This Matters

Mobile already has its own navigation surfaces:
- the header hamburger opens `MobileDrawer`
- the bottom tab bar stays pinned to the viewport

That means the left sidebar shell should not compete for space on small screens. Today the sidebar is still mounted on mobile, and the inner rail uses a custom `display: flex` rule, which is why the rail can still show up alongside the mobile chrome. This plan makes the sidebar a desktop-only shell so the mobile layout stays clean and follows the `docs/design.md` guidance for a minimal, utility-first surface.

## Current State

### `docs/design.md:9-16`
```md
- Utility-First & Minimalist: focus on content and functionality.
- High Contrast & Crisp: use firm borders and avoid soft shadows.
- NO "AI Slop": do not add decorative duplication or meaningless chrome.
```

### `apps/web/src/components/Layout.tsx:157-225`
```tsx
<Sidebar
  pathname={pathname}
  profile={profile}
  session={session}
  mobileMenuOpen={mobileDrawerOpen}
  setMobileMenuOpen={setMobileDrawerOpen}
  ...
/>

<AppHeader onOpenMobileMenu={() => setMobileDrawerOpen(true)} />
<MobileTabBar ... onOpenDrawer={() => setMobileDrawerOpen(true)} />
<MobileDrawer isOpen={mobileDrawerOpen} ... />
```

### `apps/web/src/components/layout/Sidebar.tsx:130-376`
```tsx
return (
  <div className="hidden h-screen shrink-0 lg:flex" ref={sidebarRef}>
    {/* Desktop Icon Rail */}
    <div className="sidebar-rail hidden lg:flex">
      ...
    </div>

    {/* Desktop Flyout Panel */}
    <div className="sidebar-flyout hidden lg:block" data-open={flyoutOpen}>
      ...
    </div>

    {/* Mobile Sidebar Overlay */}
    <AnimatePresence>
      {mobileMenuOpen && (
        <>
          <motion.div className="fixed inset-0 z-[60] ... lg:hidden" />
          <motion.div className="fixed inset-y-0 left-0 z-[70] ... lg:hidden flex ..." />
        </>
      )}
    </AnimatePresence>
  </div>
);
```

### `apps/web/src/index.css:233-245`
```css
.sidebar-rail {
  width: var(--sidebar-collapsed-width);
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  ...
}
```

### `apps/web/src/components/layout/AppHeader.tsx:19-26`
```tsx
<button
  onClick={onOpenMobileMenu}
  className="lg:hidden ..."
>
  <PanelLeftOpen className="h-4 w-4" />
</button>
```

### `apps/web/src/components/layout/MobileTabBar.tsx:37-81`
```tsx
<nav
  aria-label="Navigasi utama"
  className="fixed inset-x-0 bottom-0 ... lg:hidden ..."
>
```

### `apps/web/src/components/layout/MobileDrawer.tsx:45-220`
```tsx
<AnimatePresence>
  {isOpen && (
    <motion.div className="fixed inset-0 z-[80] lg:hidden">
      ...
    </motion.div>
  )}
</AnimatePresence>
```

### `apps/web/src/__tests__/sidebar-active-open-separation.test.tsx:29-56`
```tsx
render(
  <Sidebar
    pathname={pathname}
    ...
    mobileMenuOpen={false}
    ...
  />,
);
```

That existing test covers desktop active/open state. We will extend it with a responsive class regression so the sidebar shell stays desktop-only without requiring browser auth.

## Commands You Will Need

| Purpose   | Command | Expected on success |
|-----------|---------|---------------------|
| Typecheck | `pnpm --filter @trainers/web tsc --noEmit` | exit 0 |
| Lint | `pnpm --filter @trainers/web lint` | exit 0 |
| Unit test | `pnpm exec vitest run src/__tests__/sidebar-active-open-separation.test.tsx` | sidebar root class regression passes |
| Build | `pnpm build:web` | exit 0 |

## Scope

**In scope** (the only files you should modify):
- `apps/web/src/components/layout/Sidebar.tsx`
- `apps/web/src/__tests__/sidebar-active-open-separation.test.tsx`
- `plans/README.md`

**Out of scope** (do NOT touch):
- `apps/web/src/components/Layout.tsx`
- `apps/web/src/components/layout/AppHeader.tsx`
- `apps/web/src/components/layout/MobileDrawer.tsx`
- `apps/web/src/components/layout/MobileTabBar.tsx`
- `apps/web/src/index.css`
- Any route or backend files

## Git Workflow

- Branch: use the existing branch, do not create a new one unless the workspace requires it
- Commit style: match the repo's existing `feat:` / `fix:` convention if you are asked to commit later
- Do NOT push or open a PR unless the operator explicitly asks for it

## Steps

### Step 1: Make the sidebar shell desktop-only

Update the outermost wrapper in `apps/web/src/components/layout/Sidebar.tsx` so the whole sidebar shell is hidden below `lg` and only participates in layout on desktop.

Use the existing desktop shell as the pattern:

```tsx
<div className="hidden h-screen shrink-0 lg:flex" ref={sidebarRef}>
```

Keep the desktop rail, flyout, and role-based module logic unchanged. Do not add any new mobile chrome. The mobile drawer and bottom tab bar already exist and should remain the only mobile navigation surfaces.

**Verify**: `pnpm --filter @trainers/web tsc --noEmit` -> exit 0

### Step 2: Add a regression test for the sidebar shell class

Extend `apps/web/src/__tests__/sidebar-active-open-separation.test.tsx` with a focused regression test that asserts the sidebar shell root has the responsive visibility classes:

- `hidden`
- `h-screen`
- `shrink-0`
- `lg:flex`

Use the existing mocked `Sidebar` render helper so the test stays independent of dashboard auth and browser navigation.

**Verify**: `pnpm exec vitest run src/__tests__/sidebar-active-open-separation.test.tsx` -> the sidebar regression test passes

### Step 3: Finish with repo gates

Run lint and the web production build after the new test is in place. If either command fails, fix the sidebar visibility change before considering the task done.

**Verify**:
- `pnpm --filter @trainers/web lint` -> exit 0
- `pnpm build:web` -> exit 0

## Test Plan

- New Vitest regression: `apps/web/src/__tests__/sidebar-active-open-separation.test.tsx`
- Assertions:
  - sidebar shell root includes `hidden`, `h-screen`, `shrink-0`, and `lg:flex`
  - desktop active/open behavior on the sidebar still works
  - the regression stays independent of dashboard auth and browser navigation

## Done Criteria

All of the following must be true:

- [ ] Mobile viewport no longer shows the left sidebar shell in the browser
- [ ] Desktop viewport still shows the sidebar shell and flyout
- [ ] `pnpm --filter @trainers/web tsc --noEmit` exits 0
- [ ] `pnpm --filter @trainers/web lint` exits 0
- [ ] `pnpm exec vitest run src/__tests__/sidebar-active-open-separation.test.tsx` passes
- [ ] `pnpm build:web` exits 0
- [ ] Only files in scope are modified
- [ ] `plans/README.md` includes the new TODO row and stays in sync with the plan file

## STOP Conditions

Stop and report back instead of improvising if:

- The sidebar is still visible on mobile after the root wrapper becomes desktop-only, which would mean another container or CSS rule is leaking the shell back into the viewport.
- The sidebar shell root does not pick up the responsive visibility classes, which would mean another wrapper or CSS rule still leaks the shell onto mobile.
- Hiding the sidebar on mobile also hides or breaks the desktop flyout, the bottom tab bar, or the mobile drawer trigger.
- The fix appears to require changing `Layout.tsx`, `MobileDrawer.tsx`, or `MobileTabBar.tsx`. If that happens, stop and report so the scope can be re-evaluated.

## Maintenance Notes

- Keep mobile nav single-sourced: `AppHeader` + `MobileDrawer` + `MobileTabBar` should remain the only mobile chrome.
- If someone later reintroduces a mobile sidebar overlay, add a responsive visibility regression test immediately.
- Reviewers should pay special attention to breakpoint classes on the sidebar root, because a single missing `hidden` can bring the entire rail back on small screens.
