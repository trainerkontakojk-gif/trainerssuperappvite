# Plan 004: Redesign header — minimal context bar with breadcrumb

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 671c610..HEAD -- apps/web/src/components/layout/AppHeader.tsx apps/web/src/index.css`

## Status

- **Priority**: P1
- **Effort**: M (1 day)
- **Risk**: LOW — header is isolated, no complex state
- **Depends on**: plans/001, plans/002
- **Category**: direction
- **Planned at**: commit `671c610`, 2026-06-13

## Why This Matters

The current header is a **64px sticky glass bar** with `backdrop-blur-xl`, eyebrow text, title, theme toggle, and user avatar dropdown — all duplicated from the sidebar footer. After Plan 003 moves the user avatar and theme toggle to the rail, the header becomes redundant fluff. But it still serves one purpose: **context** — telling the user which module they're in.

The redesign replaces it with a **48px minimal breadcrumb bar** inspired by Linear's header:
- Left: breadcrumb trail (`Dashboard > SIDAK > Ranking Agen`)
- Right: module-specific actions (search, filter toggles — future; empty for now)
- No backdrop blur, no glass — just `border-bottom: 1px solid var(--border)` and `background: var(--bg)`

This is thinner, crisper, and provides better wayfinding than the eyebrow/title pattern.

## Current State (after Plan 002)

**File**: `apps/web/src/components/layout/AppHeader.tsx`

Current:
```html
<header className="sticky top-0 z-30 border-b border-border/40 bg-background/70 backdrop-blur-xl">
  <div className="flex h-16 items-center justify-between px-6 lg:px-10">
    <!-- hamburger (mobile) -->
    <!-- eyebrow + title via getHeaderContent() -->
    <!-- ThemeToggle + UserMenu dropdown -->
  </div>
</header>
```

Key function: `getHeaderContent(pathname)` returns `{ eyebrow, title }` pairs like:
- `/dashboard` → `{ "Dashboard Terpadu", "Pusat Kendali" }`
- `/sidak/*` → `{ "Sistem Informasi Data Analisis Kualitas", "SIDAK" }`

**Convention from `docs/design.md`**:
- "Hindari bayangan (drop-shadow) yang terlalu lembut/berlebihan"
- Buttons: `border-radius: 6px`, `font: Inter 13px 500`
- Motion: `transition: all 0.15s ease`

## Commands You Will Need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `pnpm --filter @trainers/web tsc --noEmit` | exit 0              |
| Build     | `pnpm build:web`                     | exit 0              |
| Lint      | `pnpm --filter @trainers/web lint`   | exit 0              |
| Test      | `pnpm test:targeted`                 | all pass            |

## Scope

**In scope**:
- `apps/web/src/components/layout/AppHeader.tsx` — complete rewrite
- `apps/web/src/components/layout/nav-config.ts` — replace `getHeaderContent()` with breadcrumb builder
- `apps/web/src/index.css` — add breadcrumb utility classes if needed

**Out of scope**:
- `apps/web/src/components/layout/Sidebar.tsx` — handled by Plan 003
- `apps/web/src/components/ThemeToggle.tsx` — stays in header for now (may move to rail in Plan 003)
- `apps/web/src/router.tsx` — no route changes
- User dropdown — moves to sidebar rail (Plan 003), but keep a minimal avatar in header as fallback if Plan 003 hasn't landed yet

## Git Workflow

- Branch: `advisor/004-redesign-header`
- Commit style: `feat: redesign header to minimal breadcrumb bar`

## Steps

### Step 1: Replace `getHeaderContent()` with `buildBreadcrumb()`

In `apps/web/src/components/layout/nav-config.ts`, replace the `getHeaderContent` function:

```typescript
export interface BreadcrumbSegment {
  label: string;
  href?: string;  // undefined = current page (no link)
}

export function buildBreadcrumb(pathname: string): BreadcrumbSegment[] {
  const crumbs: BreadcrumbSegment[] = [];

  // Root
  if (pathname === "/dashboard") {
    return [{ label: "Dashboard" }];
  }

  // Module root detection
  if (pathname.startsWith("/sidak")) {
    crumbs.push({ label: "SIDAK", href: "/sidak" });
    if (pathname === "/sidak") return crumbs.map((c, i) => i === crumbs.length-1 ? {...c, href: undefined} : c);
    if (pathname === "/sidak/dashboard") { crumbs.push({ label: "Dashboard QA" }); return crumbs; }
    if (pathname === "/sidak/input") { crumbs.push({ label: "Input Temuan" }); return crumbs; }
    if (pathname === "/sidak/ranking") { crumbs.push({ label: "Ranking" }); return crumbs; }
    if (pathname === "/sidak/settings") { crumbs.push({ label: "Parameter" }); return crumbs; }
    if (pathname === "/sidak/periods") { crumbs.push({ label: "Periode" }); return crumbs; }
    if (pathname.startsWith("/sidak/agents/")) { crumbs.push({ label: "Agen", href: "/sidak/agents" }); crumbs.push({ label: "Detail" }); return crumbs; }
    if (pathname === "/sidak/agents") { crumbs.push({ label: "Analisis Individu" }); return crumbs; }
    if (pathname.startsWith("/sidak/reports")) { crumbs.push({ label: "Laporan" }); return crumbs; }
    crumbs.push({ label: pathname.split("/").pop() || "" });
    return crumbs;
  }

  if (pathname.startsWith("/ketik")) { return [{ label: "KETIK" }]; }
  if (pathname.startsWith("/pdkt")) {
    crumbs.push({ label: "PDKT", href: "/pdkt" });
    if (pathname === "/pdkt/simulation") { crumbs.push({ label: "Simulasi" }); return crumbs; }
    return crumbs.map((c, i) => i === crumbs.length-1 ? {...c, href: undefined} : c);
  }
  if (pathname.startsWith("/telefun")) {
    crumbs.push({ label: "Telefun", href: "/telefun" });
    if (pathname.startsWith("/telefun/replay")) { crumbs.push({ label: "Replay" }); return crumbs; }
    return crumbs.map((c, i) => i === crumbs.length-1 ? {...c, href: undefined} : c);
  }
  if (pathname.startsWith("/profiler")) {
    crumbs.push({ label: "KTP", href: "/profiler" });
    if (pathname === "/profiler/table") { crumbs.push({ label: "Tabel" }); return crumbs; }
    if (pathname === "/profiler/analytics") { crumbs.push({ label: "Analitik" }); return crumbs; }
    if (pathname === "/profiler/slides") { crumbs.push({ label: "Slides" }); return crumbs; }
    if (pathname === "/profiler/export") { crumbs.push({ label: "Export" }); return crumbs; }
    if (pathname === "/profiler/add") { crumbs.push({ label: "Tambah" }); return crumbs; }
    if (pathname === "/profiler/import") { crumbs.push({ label: "Import" }); return crumbs; }
    if (pathname === "/profiler/teams") { crumbs.push({ label: "Tim" }); return crumbs; }
    return crumbs.map((c, i) => i === crumbs.length-1 ? {...c, href: undefined} : c);
  }
  if (pathname === "/monitoring") { return [{ label: "Monitoring" }]; }
  if (pathname === "/account") { return [{ label: "Akun" }]; }

  // Dashboard management
  if (pathname === "/dashboard/users") { return [{ label: "Dashboard", href: "/dashboard" }, { label: "Kelola Pengguna" }]; }
  if (pathname === "/dashboard/access-approval") { return [{ label: "Dashboard", href: "/dashboard" }, { label: "Persetujuan Akses" }]; }
  if (pathname === "/dashboard/access-groups") { return [{ label: "Dashboard", href: "/dashboard" }, { label: "Grup Akses" }]; }
  if (pathname === "/dashboard/activities") { return [{ label: "Dashboard", href: "/dashboard" }, { label: "Log Aktivitas" }]; }

  return [{ label: "Trainers SuperApp" }];
}
```

**Verify**: `pnpm --filter @trainers/web tsc --noEmit` → exit 0

### Step 2: Rewrite AppHeader component

Replace `apps/web/src/components/layout/AppHeader.tsx`:

```tsx
import { Link, useLocation } from "@tanstack/react-router";
import { PanelLeftOpen, ChevronRight } from "lucide-react";
import { buildBreadcrumb } from "./nav-config";

interface AppHeaderProps {
  onOpenMobileMenu: () => void;
}

export function AppHeader({ onOpenMobileMenu }: AppHeaderProps) {
  const { pathname } = useLocation();
  const crumbs = buildBreadcrumb(pathname);

  return (
    <header
      className="sticky top-0 z-30 shrink-0 border-b bg-bg"
      style={{ borderColor: 'var(--border)', height: 'var(--header-height, 48px)' }}
    >
      <div className="flex h-full items-center px-4 lg:px-6">
        {/* Mobile hamburger */}
        <button
          onClick={onOpenMobileMenu}
          className="lg:hidden p-1.5 rounded-md -ml-1 mr-2 transition-colors"
          style={{ color: 'var(--fg3)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg3)')}
        >
          <PanelLeftOpen className="h-4 w-4" />
        </button>

        {/* Breadcrumb */}
        <nav className="flex items-center gap-1 text-[13px] font-medium min-w-0">
          {crumbs.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1 min-w-0">
              {i > 0 && <ChevronRight className="h-3 w-3 shrink-0" style={{ color: 'var(--fg3)' }} />}
              {crumb.href ? (
                <Link
                  to={crumb.href}
                  className="truncate transition-colors"
                  style={{ color: 'var(--fg3)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--fg)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--fg3)')}
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate" style={{ color: 'var(--fg)' }}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>

        {/* Right side — spacer for future actions (search, filters) */}
        <div className="ml-auto" />
      </div>
    </header>
  );
}
```

Key changes from current:
- Height: `64px` → `48px` (via `--header-height`)
- No `backdrop-blur-xl` — solid `bg-bg`
- No ThemeToggle or UserMenu (moved to rail in Plan 003)
- Breadcrumb replaces eyebrow/title pattern
- `border-border/40` → `border-color: var(--border)` (full opacity, crisp)

**Verify**: `pnpm build:web` → exit 0

### Step 3: Update Layout.tsx header integration

In `apps/web/src/components/Layout.tsx`, simplify the header props:

```tsx
{!pathname.startsWith("/profiler") && (
  <AppHeader onOpenMobileMenu={() => setMobileMenuOpen(true)} />
)}
```

Remove all header-related props that are no longer needed (profile, session, theme, setTheme, handleLogout).

**Verify**:
1. `pnpm --filter @trainers/web tsc --noEmit` → exit 0
2. `pnpm build:web` → exit 0

### Step 4: Update `--header-height` token

If not already done in Plan 001, ensure `index.css` has:
```css
:root { --header-height: 48px; }
```

And update any `h-16` (64px) references in Layout.tsx main content padding to use `h-12` or the token.

**Verify**: `grep "h-16" apps/web/src/components/Layout.tsx` → 0 matches (no hardcoded old height)

## Test Plan

- No new unit tests — structural change only.
- Run: `pnpm test:targeted` → all pass.
- Visual verification:
  - [ ] Header is 48px, not 64px
  - [ ] Breadcrumb shows "SIDAK > Ranking" on `/sidak/ranking`
  - [ ] Breadcrumb shows "Dashboard" on `/dashboard`
  - [ ] SIDAK breadcrumb "SIDAK" is clickable, links to `/sidak`
  - [ ] No glass/blur effect on header
  - [ ] Mobile hamburger works
  - [ ] `/profiler` pages have no header (existing behavior preserved)

## Done Criteria

- [ ] `pnpm build:web` exits 0
- [ ] `pnpm test:targeted` exits 0
- [ ] Header height is 48px (`--header-height: 48px` in CSS)
- [ ] No `backdrop-blur` in header code
- [ ] Breadcrumb renders correctly for all module paths
- [ ] `getHeaderContent` function is removed or replaced by `buildBreadcrumb`
- [ ] ThemeToggle and UserMenu are NOT rendered in header (they live in sidebar rail now)
- [ ] `plans/README.md` status row updated

## STOP Conditions

- Plan 002 has not been completed (AppHeader.tsx doesn't exist as separate file).
- Plan 001 has not been completed (tokens `--bg`, `--fg`, `--fg3` not available).
- Breadcrumb `Link` components produce TypeScript errors due to TanStack Router's strict typing — the `to` prop may need `as any` cast (matching existing convention in Layout.tsx).
- If Plan 003 has NOT landed, the header still needs ThemeToggle and UserMenu. In that case, keep them but slim down the header visually anyway.

## Maintenance Notes

- The breadcrumb is intentionally driven by `pathname` parsing, not route metadata. This keeps it decoupled from the router config and simple to maintain.
- Future enhancement: if modules get deeper nesting (e.g., SIDAK reports with sub-tabs), extend `buildBreadcrumb` with more path segments.
- The right side of the header is empty — this is a **placeholder for future command palette** (Cmd+K) or module-specific action buttons. Don't fill it with decorative elements.
