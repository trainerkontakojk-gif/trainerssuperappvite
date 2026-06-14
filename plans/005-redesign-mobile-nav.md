# Plan 005: Redesign mobile navigation — persistent tab bar + fullscreen drawer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 671c610..HEAD -- apps/web/src/components/layout/MobileTabBar.tsx apps/web/src/components/Layout.tsx`

## Status

- **Priority**: P2
- **Effort**: M (1-2 days)
- **Risk**: LOW — mobile-only changes, desktop unaffected
- **Depends on**: plans/003, plans/004
- **Category**: direction
- **Planned at**: commit `671c610`, 2026-06-13

## Why This Matters

The current mobile navigation has **two overlapping systems**:
1. A **bottom tab bar** (`<nav>` at bottom with 6 module icons) — always visible
2. A **sidebar overlay** (triggered by hamburger) — full sidebar slides in from left

This is confusing — the tab bar shows 6 modules but the sidebar has 15+ items including sub-navigation and management links. Users need to figure out which UI to use for what.

The redesign unifies these into:
1. **Persistent bottom tab bar** (keep, but redesign) — 5 primary modules max, with a "More" overflow icon
2. **Fullscreen drawer** (replaces sidebar overlay) — triggered by "More" tab or hamburger, shows ALL navigation in a clean vertical list

## Current State (after Plans 002-004)

**File**: `apps/web/src/components/layout/MobileTabBar.tsx`

Current bottom bar:
```html
<nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border/40 bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
  <div className="flex h-14 items-center justify-around px-2">
    {MOBILE_TABS.map(tab => (
      <Link className="flex flex-col items-center gap-0.5 ...">
        <tab.icon className="h-5 w-5" />
        <span className="text-[10px] font-bold uppercase tracking-wider">{tab.shortTitle}</span>
      </Link>
    ))}
  </div>
</nav>
```

Tabs shown: Dashboard, Ketik, PDKT, Telefun, KTP, SIDAK (6 tabs — crowded on small screens).

**Design constraints from `docs/design.md`**:
- No glass/blur effects on navigation chrome
- Crisp borders, `border-color: var(--border)`
- Typography hierarchy via size/weight, not color decoration
- Motion: `0.15s ease` for hover, `0.4s easeOut` for entrance

## Commands You Will Need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Build     | `pnpm build:web`                     | exit 0              |
| Test      | `pnpm test:targeted`                 | all pass            |

## Scope

**In scope**:
- `apps/web/src/components/layout/MobileTabBar.tsx` — redesign
- `apps/web/src/components/layout/MobileDrawer.tsx` [NEW] — fullscreen nav drawer
- `apps/web/src/components/Layout.tsx` — update mobile integration
- `apps/web/src/index.css` — add mobile nav utility classes

**Out of scope**:
- Desktop sidebar (Plan 003)
- Desktop header (Plan 004)
- `apps/web/src/router.tsx`
- Any backend files

## Git Workflow

- Branch: `advisor/005-redesign-mobile-nav`
- Commit style: `feat: redesign mobile bottom bar + drawer`

## Steps

### Step 1: Reduce bottom tab bar to 4 tabs + "More"

Rewrite `MobileTabBar.tsx`:

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import { LayoutDashboard, MessageSquare, Phone, BarChart3, Menu } from "lucide-react";
import { isRoleAllowed } from "../../lib/app-config";

// Primary 4 tabs — most used modules, role-filtered
const PRIMARY_TABS = [
  { id: "dashboard", href: "/dashboard", icon: LayoutDashboard, label: "Home" },
  { id: "ketik", href: "/ketik", icon: MessageSquare, label: "Ketik" },
  { id: "telefun", href: "/telefun", icon: Phone, label: "Telefun" },
  { id: "qa-analyzer", href: "/sidak", icon: BarChart3, label: "SIDAK", allowedRoles: ["trainer","leader","admin"] },
];

interface MobileTabBarProps {
  profile: { role?: string } | null;
  hasTelefunAccess: boolean;
  openMaintenance: () => void;
  onOpenDrawer: () => void;
}

export function MobileTabBar({ profile, hasTelefunAccess, openMaintenance, onOpenDrawer }: MobileTabBarProps) {
  const { pathname } = useLocation();

  const tabs = PRIMARY_TABS.filter(t => isRoleAllowed(profile?.role, t.allowedRoles));

  return (
    <nav
      aria-label="Navigasi utama"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-bg pb-[env(safe-area-inset-bottom,0px)] lg:hidden"
      style={{ borderColor: 'var(--border)' }}
    >
      <div className="flex h-12 items-center justify-around">
        {tabs.map(tab => {
          const active = tab.id === "dashboard"
            ? pathname === tab.href
            : pathname.startsWith(tab.href);

          return (
            <Link
              key={tab.id}
              to={tab.href as any}
              onClick={(e) => {
                if (tab.id === "telefun" && !hasTelefunAccess) {
                  e.preventDefault();
                  openMaintenance();
                }
              }}
              className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 transition-colors"
              style={{ color: active ? 'var(--fg)' : 'var(--fg3)' }}
            >
              <tab.icon className="h-[18px] w-[18px]" />
              <span className="text-[9px] font-semibold tracking-wider">{tab.label}</span>
            </Link>
          );
        })}

        {/* "More" tab — opens fullscreen drawer */}
        <button
          onClick={onOpenDrawer}
          className="flex flex-col items-center justify-center gap-0.5 px-3 py-1 transition-colors"
          style={{ color: 'var(--fg3)' }}
        >
          <Menu className="h-[18px] w-[18px]" />
          <span className="text-[9px] font-semibold tracking-wider">Lainnya</span>
        </button>
      </div>
    </nav>
  );
}
```

Key changes:
- 6 tabs → 4 + "More" button
- Height: `h-14` → `h-12` (48px, matching header)
- No `backdrop-blur-xl` — solid `bg-bg`
- Label font: `10px bold uppercase` → `9px semibold` (more refined)
- Active state: `text-primary` → `color: var(--fg)` (neutral, not colored)
- PDKT and KTP moved to "More" drawer

**Verify**: `pnpm build:web` → exit 0

### Step 2: Create MobileDrawer component

Create `apps/web/src/components/layout/MobileDrawer.tsx`:

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import { X, UserCog, Sun, Moon, LogOut } from "lucide-react";
import { APP_MODULES, isRoleAllowed } from "../../lib/app-config";
import { SIDAK_CHILDREN, MANAGEMENT_LINKS } from "./nav-config";

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  profile: any;
  session: any;
  theme: string;
  setTheme: (t: string) => void;
  handleLogout: () => void;
  hasTelefunAccess: boolean;
  openMaintenance: () => void;
}

export function MobileDrawer({ isOpen, onClose, profile, session, theme, setTheme, handleLogout, hasTelefunAccess, openMaintenance }: MobileDrawerProps) {
  const { pathname } = useLocation();

  const modules = APP_MODULES.filter(m => isRoleAllowed(profile?.role, m.allowedRoles));
  const managementLinks = MANAGEMENT_LINKS.filter(l => isRoleAllowed(profile?.role, l.allowedRoles));

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[80] lg:hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0"
            style={{ background: 'color-mix(in srgb, var(--bg) 90%, transparent)' }}
            onClick={onClose}
          />

          {/* Drawer content — slides up from bottom */}
          <motion.div
            className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl"
            style={{
              background: 'var(--surface)',
              borderTop: '1px solid var(--border)',
            }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-2">
              <div
                className="h-1 w-8 rounded-full"
                style={{ background: 'var(--fg3)' }}
              />
            </div>

            {/* User info */}
            <div className="px-6 pb-4 border-b" style={{ borderColor: 'var(--border)' }}>
              <p className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>
                {profile?.full_name || session?.user?.email || "User"}
              </p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--fg3)' }}>
                {profile?.email}
              </p>
            </div>

            {/* All modules */}
            <div className="px-4 py-3">
              <p className="px-2 mb-2 text-[10px] font-bold uppercase tracking-[0.2em]"
                 style={{ color: 'var(--fg3)' }}>
                Platform
              </p>
              {modules.map(m => {
                const active = pathname === m.href || pathname.startsWith(m.href + "/");
                return (
                  <Link
                    key={m.id}
                    to={m.href as any}
                    onClick={(e) => {
                      if (m.id === "telefun" && !hasTelefunAccess) {
                        e.preventDefault();
                        openMaintenance();
                      }
                      onClose();
                    }}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors"
                    style={{
                      color: active ? 'var(--fg)' : 'var(--fg2)',
                      background: active ? 'color-mix(in srgb, var(--fg) 6%, transparent)' : 'transparent',
                    }}
                  >
                    <m.icon className="h-4 w-4" />
                    {m.shortTitle}
                  </Link>
                );
              })}
            </div>

            {/* Management */}
            {managementLinks.length > 0 && (
              <div className="px-4 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
                <p className="px-2 mb-2 text-[10px] font-bold uppercase tracking-[0.2em]"
                   style={{ color: 'var(--fg3)' }}>
                  Management
                </p>
                {managementLinks.map(item => (
                  <Link
                    key={item.to}
                    to={item.to as any}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors"
                    style={{ color: 'var(--fg2)' }}
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                ))}
              </div>
            )}

            {/* Footer actions */}
            <div className="px-4 py-4 border-t flex items-center gap-2"
                 style={{ borderColor: 'var(--border)', paddingBottom: 'calc(16px + env(safe-area-inset-bottom, 0px))' }}>
              <Link to="/account" onClick={onClose}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg py-2.5 text-[13px] font-medium"
                style={{ color: 'var(--fg2)', border: '1px solid var(--border)' }}>
                <UserCog className="h-4 w-4" /> Akun
              </Link>
              <button onClick={() => { setTheme(theme === "dark" ? "light" : "dark"); }}
                className="flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-[13px] font-medium"
                style={{ color: 'var(--fg2)', border: '1px solid var(--border)' }}>
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </button>
              <button onClick={() => { onClose(); handleLogout(); }}
                className="flex items-center justify-center gap-2 rounded-lg py-2.5 px-4 text-[13px] font-medium"
                style={{ color: '#DC2626', border: '1px solid var(--border)' }}>
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

Key design decisions:
- **Bottom sheet** instead of left-sliding sidebar — more natural on mobile, matches iOS conventions
- **Spring animation** for the sheet reveal — feels physical and responsive
- **85vh max height** — always shows the bottom bar behind
- **Handle bar** at top — visual cue that it's draggable (actual drag-to-dismiss is a future enhancement)
- **Safe area padding** at bottom — respects iPhone notch/bar

**Verify**: `pnpm build:web` → exit 0

### Step 3: Wire up Layout.tsx

Add `mobileDrawerOpen` state and connect components:

```typescript
const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

// In the JSX:
<MobileTabBar
  profile={profile}
  hasTelefunAccess={hasTelefunAccess}
  openMaintenance={openMaintenance}
  onOpenDrawer={() => setMobileDrawerOpen(true)}
/>
<MobileDrawer
  isOpen={mobileDrawerOpen}
  onClose={() => setMobileDrawerOpen(false)}
  profile={profile}
  session={session}
  theme={theme}
  setTheme={setTheme}
  handleLogout={handleLogout}
  hasTelefunAccess={hasTelefunAccess}
  openMaintenance={openMaintenance}
/>
```

Also update the header's hamburger on mobile to open the drawer instead of the old sidebar overlay.

**Verify**:
1. `pnpm build:web` → exit 0
2. `pnpm test:targeted` → all pass

### Step 4: Remove old mobile sidebar overlay

Remove the old `mobileMenuOpen` state and the `<div className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm lg:hidden" ...>` overlay from Layout.tsx. The MobileDrawer now handles all mobile navigation.

**Verify**: `grep "mobileMenuOpen" apps/web/src/components/Layout.tsx` → 0 matches (state fully replaced)

### Step 5: Update content padding for new tab bar height

The main content padding on mobile was `pb-[calc(4rem+env(safe-area-inset-bottom))]` for the 56px tab bar. Update to `pb-[calc(3rem+env(safe-area-inset-bottom))]` for the new 48px bar.

**Verify**: Visual — no content hidden behind the tab bar.

## Test Plan

- No new unit tests.
- Run: `pnpm test:targeted` → all pass.
- Visual verification:
  - [ ] 4 tabs + "More" visible on mobile (< 1024px viewport)
  - [ ] Tapping "More" opens bottom sheet drawer
  - [ ] Drawer shows all modules, management links, and footer actions
  - [ ] Drawer closes on backdrop tap
  - [ ] Drawer closes on navigation (clicking any link)
  - [ ] Safe area padding works on iPhone viewport simulation
  - [ ] Desktop shows no mobile elements (tab bar and drawer are `lg:hidden`)
  - [ ] Telefun maintenance guard still works on mobile

## Done Criteria

- [ ] `pnpm build:web` exits 0
- [ ] `pnpm test:targeted` exits 0
- [ ] Bottom tab bar has 4 tabs + "More" (not 6 tabs)
- [ ] "More" opens a bottom sheet drawer, not a left-sliding panel
- [ ] All 39 routes accessible from mobile (via tab bar or drawer)
- [ ] No `backdrop-blur` in mobile navigation code
- [ ] Old `mobileMenuOpen` state and overlay removed
- [ ] `plans/README.md` status row updated

## STOP Conditions

- Plans 003 and 004 have not been completed.
- The `framer-motion` `AnimatePresence` doesn't work with the bottom sheet — the spring animation causes layout jank.
- Any route returns 404 from mobile navigation.
- The bottom sheet overlaps the system home indicator on iOS.

## Maintenance Notes

- The 4 primary tabs (Dashboard, Ketik, Telefun, SIDAK) are the most-accessed modules. If analytics show PDKT or KTP are used more often on mobile, swap them into the primary tabs.
- Drag-to-dismiss on the bottom sheet is deliberately NOT implemented — it requires gesture handling (e.g., `use-gesture` library) which is out of scope. This can be added later.
- The old `MOBILE_TABS` constant in `nav-config.ts` can be removed once this plan lands.
