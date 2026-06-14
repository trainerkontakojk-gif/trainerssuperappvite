# Plan 003: Redesign sidebar — slim icon rail + expandable flyout panel

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 671c610..HEAD -- apps/web/src/components/layout/Sidebar.tsx apps/web/src/index.css`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: L (2-3 days)
- **Risk**: MED — significant UX change; must preserve all nav paths and role-based visibility
- **Depends on**: plans/001, plans/002
- **Category**: direction
- **Planned at**: commit `671c610`, 2026-06-13

## Why This Matters

The current sidebar is a **fat 19rem (304px) panel** that eats 21% of a 1440px viewport. When collapsed, it drops to 5rem (80px) — still thick for an icon rail. The visual language is "generic shadcn dashboard": rounded-2xl nav items, backdrop-blur glass, `bg-card/55`. This doesn't match the landing page's crisp, minimal, Linear-style aesthetic.

A radical redesign replaces this with a **3-column approach** inspired by Linear/Notion:
1. **Icon Rail** (56px) — always visible on desktop, module icons + user avatar
2. **Flyout Panel** (260px) — slides out on hover/click, shows labels + sub-navigation
3. Both columns share the same `--surface` background, separated by a subtle `--border` line

This gives the content area ~95% of the viewport while keeping navigation instantly accessible.

## Current State (after Plan 002)

**File**: `apps/web/src/components/layout/Sidebar.tsx`

Current visual:
- Width: `w-76` (19rem = 304px) expanded, `lg:w-20` collapsed
- Background: `bg-card/55 backdrop-blur-2xl`
- Border: `border-r border-border/40`
- Nav items: `rounded-2xl px-4 py-3`, active = `bg-primary text-primary-foreground shadow-md shadow-primary/15`
- SIDAK sub-nav: collapsible accordion with `pl-11` indent
- Footer: signed-in card + account/theme/logout buttons

**Design tokens available (after Plan 001)**:
- `--bg`, `--surface`, `--border`, `--fg`, `--fg2`, `--fg3`
- `--inv-bg`, `--inv-fg`
- Module colors: `--module-ketik`, `--module-pdkt`, `--module-telefun`, `--module-profiler`, `--module-sidak`

**Conventions from `docs/design.md`**:
- "High Contrast & Crisp: gunakan garis tepi (border) yang tegas"
- "NO AI SLOP: hindari gradien kompleks, floating blobs, warna neon"
- "Hierarki informasi dibangun menggunakan Tipografi dan Spasi"
- Cards: `background: var(--surface)`, `border: 1px solid var(--border)`, **no box-shadow**
- Radius: `6px` small, `8px` medium, `12px-24px` large containers
- Motion: `transition: all 0.15s ease` for hover, framer-motion `0.4s easeOut` for entrance

**Module registry**: `apps/web/src/lib/app-config.ts` — 6 modules with `id`, `shortTitle`, `href`, `icon`, `allowedRoles`

## Commands You Will Need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `pnpm --filter @trainers/web tsc --noEmit` | exit 0              |
| Build     | `pnpm build:web`                     | exit 0              |
| Lint      | `pnpm --filter @trainers/web lint`   | exit 0              |
| Test      | `pnpm test:targeted`                 | all pass            |

## Scope

**In scope**:
- `apps/web/src/components/layout/Sidebar.tsx` — complete rewrite
- `apps/web/src/index.css` — add sidebar-specific utility classes if needed
- `apps/web/src/components/Layout.tsx` — update sidebar integration (width, state)

**Out of scope**:
- `apps/web/src/components/layout/AppHeader.tsx` — handled by Plan 004
- `apps/web/src/components/layout/MobileTabBar.tsx` — handled by Plan 005
- `apps/web/src/router.tsx` — routes must NOT change
- `apps/web/src/lib/app-config.ts` — module config stays as-is
- Any backend files

## Git Workflow

- Branch: `advisor/003-redesign-sidebar`
- Commit style: `feat: redesign sidebar to slim rail + flyout`
- Do NOT push or open a PR.

## Steps

### Step 1: Define the new sidebar anatomy in CSS

Add to `apps/web/src/index.css` (in the `@layer utilities` section):

```css
/* ── Sidebar Rail ──────────────── */
.sidebar-rail {
  width: var(--sidebar-collapsed-width);  /* 72px from Plan 001 */
  background: var(--surface);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 0;
  gap: 4px;
  z-index: 20;
  transition: none;
}

.sidebar-rail-item {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  color: var(--fg3);
  transition: all 0.15s ease;
  position: relative;
  cursor: pointer;
}

.sidebar-rail-item:hover {
  background: color-mix(in srgb, var(--fg) 8%, transparent);
  color: var(--fg);
}

.sidebar-rail-item[data-active="true"] {
  background: var(--inv-bg);
  color: var(--inv-fg);
}

/* ── Sidebar Flyout Panel ──────── */
.sidebar-flyout {
  width: 0;
  overflow: hidden;
  background: var(--bg);
  border-right: 1px solid var(--border);
  transition: width 0.2s ease, opacity 0.15s ease;
  opacity: 0;
  z-index: 19;
}

.sidebar-flyout[data-open="true"] {
  width: 260px;
  opacity: 1;
}
```

**Verify**: `pnpm build:web` → exit 0

### Step 2: Rewrite Sidebar component with rail + flyout architecture

Rewrite `apps/web/src/components/layout/Sidebar.tsx` with this structure:

```
<div className="flex h-screen">
  {/* Icon Rail — always visible on desktop */}
  <div className="sidebar-rail hidden lg:flex">
    <BrandMark />      {/* "S" logo, 36x36, links to /dashboard */}
    <Separator />
    {modules.map(m => (
      <RailIcon key={m.id}
        icon={m.icon}
        label={m.shortTitle}
        active={isModuleActive(m)}
        onClick={() => navigateOrExpandFlyout(m)}
        moduleColor={getModuleColor(m.id)}
      />
    ))}
    <Spacer />
    <RailIcon icon={UserCog} label="Akun" />
    <RailIcon icon={theme === "dark" ? Sun : Moon} label="Tema" onClick={toggleTheme} />
    <UserAvatar initial={userInitial} onClick={toggleUserMenu} />
  </div>

  {/* Flyout Panel — slides out on module hover/click */}
  <div className="sidebar-flyout hidden lg:block" data-open={flyoutOpen}>
    <FlyoutHeader title={activeModule?.shortTitle} onClose={closeFlyout} />
    <FlyoutNavList items={getNavItemsForModule(activeModule)} pathname={pathname} />
  </div>
</div>
```

Key behavioral rules:
- **Click on a module icon** → if module has sub-routes (SIDAK), open flyout. If not, navigate directly.
- **Hover on rail** → show tooltip with module name (CSS `::after` pseudo-element, not a React tooltip component).
- **Click outside flyout** → close flyout.
- **Active module** → rail icon gets `data-active="true"` (filled bg), its accent color shows as a 2px left border.

**Verify**: `pnpm --filter @trainers/web tsc --noEmit` → exit 0

### Step 3: Implement module accent indicators on the rail

Each rail icon should have a subtle module-color indicator when active:

```tsx
<div
  className="sidebar-rail-item"
  data-active={isActive}
  style={isActive ? {
    '--rail-accent': `var(--module-${moduleId})`,
    boxShadow: `inset 3px 0 0 var(--rail-accent)`
  } : undefined}
>
  <module.icon className="h-[18px] w-[18px]" />
</div>
```

This gives each module its identity color on the rail without breaking the monochrome aesthetic.

**Verify**: Visual — active module has a colored left-bar accent on its rail icon.

### Step 4: Implement SIDAK flyout with grouped sub-navigation

When SIDAK is clicked on the rail, the flyout opens showing:

```
┌──────────────────────┐
│ SIDAK                │  ← module title, Outfit font, --fg
│ Sistem Informasi...  │  ← expandedTitle, Inter, --fg3, 11px
├──────────────────────┤
│ ◉ Beranda SIDAK      │  ← active item: --fg, font-medium
│   Dashboard QA       │  ← inactive: --fg2
│   Analisis Individu  │
│   Ranking Agen       │
├──────────────────────┤  ← separator for admin-only items
│   Laporan            │
│   Input Temuan       │
│   Periode QA         │
│   Parameter QA       │
└──────────────────────┘
```

Navigation items: `padding: 6px 16px`, `border-radius: 6px`, `font-size: 13px`, Inter font.
Active: `background: color-mix(in srgb, var(--fg) 8%, transparent)`, `font-weight: 500`.

**Verify**: Click SIDAK on rail → flyout opens with 8 sub-items, role-filtered correctly.

### Step 5: Handle Management section in the flyout

Management links (User Management, Access Approval, etc.) are shown when the user clicks a dedicated "gear" icon at the bottom of the rail, or as a separate rail section below a divider. The flyout opens with management items:

```
┌──────────────────────┐
│ Management           │
├──────────────────────┤
│   User Management    │
│   Access Approval    │
│   Access Groups      │
│   Monitoring         │
│   Activity Logs      │
└──────────────────────┘
```

Role filtering: reuse `isRoleAllowed(profile?.role, item.allowedRoles)` from `app-config.ts`.

**Verify**: Trainer/Admin sees management icon on rail. Agent/QA does not.

### Step 6: Mobile sidebar — full-screen overlay (reuse existing pattern)

On mobile (`lg:hidden`), the sidebar becomes a full-screen overlay triggered by the hamburger in the header:

```
<div className="fixed inset-0 z-[70] bg-bg lg:hidden" data-open={mobileMenuOpen}>
  <div className="flex flex-col h-full p-6">
    <div className="flex justify-between items-center mb-8">
      <span className="font-display font-bold text-lg">Menu</span>
      <button onClick={closeMobile}>✕</button>
    </div>
    <nav className="flex-1 space-y-1">
      {/* All module links — flat list, no rail/flyout on mobile */}
    </nav>
    <div className="border-t border-border pt-4">
      {/* Account / Theme / Logout */}
    </div>
  </div>
</div>
```

Use `framer-motion` `AnimatePresence` for the overlay entrance (`opacity: 0→1`, `x: -100%→0`, `duration: 0.2s`).

**Verify**: On viewport < 1024px, hamburger opens full-screen nav overlay. All links work.

### Step 7: Remove deprecated sidebar state

In `Layout.tsx`, remove `isSidebarCollapsed` and `isSidebarHovered` state — the new rail doesn't collapse/expand the same way. Replace with:

```typescript
const [flyoutOpen, setFlyoutOpen] = useState(false);
const [flyoutModule, setFlyoutModule] = useState<string | null>(null);
```

Pass these to the new `Sidebar` component.

**Verify**:
1. `pnpm build:web` → exit 0
2. `pnpm test:targeted` → all pass
3. `pnpm --filter @trainers/web lint` → exit 0

## Test Plan

- No new unit tests (UI structural change, not logic change).
- Run existing suite: `pnpm test:targeted` → all pass.
- Visual verification matrix:
  - [ ] Desktop 1440px: rail visible, click module → navigate or open flyout
  - [ ] Desktop 1440px: click SIDAK → flyout shows 8 items
  - [ ] Desktop 1440px: click outside flyout → closes
  - [ ] Mobile 375px: hamburger → full screen overlay, all links present
  - [ ] Role check: agent sees only Dashboard/Ketik/Telefun; trainer sees all
  - [ ] Theme toggle works from both rail footer and mobile overlay

## Done Criteria

- [ ] `pnpm build:web` exits 0
- [ ] `pnpm test:targeted` exits 0
- [ ] Rail width is exactly `72px` on desktop
- [ ] Content area occupies `calc(100vw - 72px)` when flyout is closed
- [ ] All 39 route paths still navigate correctly (no broken links)
- [ ] SIDAK sub-nav has all 8 items, role-filtered
- [ ] Management section visible only to trainer/admin roles
- [ ] Mobile overlay has all nav items in a flat list
- [ ] No `backdrop-blur-2xl` or `bg-card/55` remains in sidebar code (old style removed)
- [ ] `plans/README.md` status row updated

## STOP Conditions

- Plan 002 has not been completed (Sidebar.tsx doesn't exist yet as a separate file).
- Plan 001 has not been completed (design tokens `--bg`, `--surface`, `--border` not available).
- After rewrite, a route path returns 404 — the navigation `to=` prop was changed accidentally.
- The Telefun maintenance guard (`hasTelefunAccess` / `openMaintenance`) is broken — it must still intercept Telefun clicks.
- Any import from `router.tsx` was modified.

## Maintenance Notes

- The flyout panel is intentionally **not** a permanent sidebar — it closes after navigation. This keeps the content area maximized, which is critical for data-heavy modules like SIDAK and Profiler.
- Module accent colors on the rail give wayfinding without labeling. The Landing page uses the same color associations.
- If a new module is added to `app-config.ts`, it automatically appears on the rail — no sidebar code change needed.
- The mobile overlay is a complete replacement for both the old mobile sidebar AND the bottom tab bar (Plan 005 decides the mobile bottom bar's fate).
