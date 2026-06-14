# Plan 001: Unify design token system in `index.css` to match `docs/design.md`

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat 671c610..HEAD -- apps/web/src/index.css docs/design.md`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M (1 day)
- **Risk**: MED — touches the color foundation of every page; visual regressions are likely during transition
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `671c610`, 2026-06-13

## Why This Matters

The app currently has **two competing token systems**:

1. `docs/design.md` defines: `--bg`, `--fg`, `--fg2`, `--fg3`, `--surface`, `--border`, `--inv-bg`, `--inv-fg`
2. `index.css` defines: `--background`, `--foreground`, `--card`, `--primary`, `--muted-foreground`, `--border` (shadcn-compatible naming)
3. The landing page CSS (`landing.css`) uses the `design.md` tokens directly.

This means **landing page and app shell speak different design languages**. The recently updated landing page looks like a Linear/Vercel site; the app shell still looks like a generic shadcn dashboard. A radical redesign requires a single unified token vocabulary that ALL pages consume.

Additionally, the dark mode primary color shifts from **Navy (#1E293B)** in light mode to **Amber/Gold (#F59E0B)** in dark mode — an identity inconsistency where the brand literally changes color between themes. The design.md spec uses neutral `--inv-bg`/`--inv-fg` which avoids this.

## Current State

### `apps/web/src/index.css` (lines 59-177):
```css
:root {
  --background: #FAFAF9;      /* Stone-50 */
  --foreground: #1C1917;      /* Stone-900 */
  --card: #FFFFFF;
  --primary: #1E293B;         /* Slate-800 - Navy */
  --primary-foreground: #F8FAFC;
  --muted-foreground: #78716C; /* Stone-500 */
  --border: #E7E5E4;          /* Stone-200 */
  /* ... 30+ more tokens */
}

.dark {
  --background: #09090B;      /* Zinc-950 */
  --primary: #F59E0B;         /* Amber-500 - Gold — DIFFERENT from light! */
  --border: #27272A;
  /* ... */
}
```

### `docs/design.md` (lines 24-44) — the target:
```css
/* Light */
--bg: #fafafa;  --surface: #f5f5f5;  --border: #e5e5e5;
--fg: #0a0a0a;  --fg2: #525252;  --fg3: #a3a3a3;
--inv-bg: #0a0a0a;  --inv-fg: #fafafa;

/* Dark */
--bg: #0a0a0a;  --surface: #171717;  --border: #262626;
--fg: #fafafa;  --fg2: #a3a3a3;  --fg3: #525252;
--inv-bg: #fafafa;  --inv-fg: #0a0a0a;
```

### Conventions to follow:
- Tailwind v4 CSS-first config — all theme in `@theme` block at top of `index.css`
- `@custom-variant dark (&:is(.dark *));` for dark mode selector
- Module accent colors (`--module-ketik`, `--module-pdkt`, etc.) are **kept as-is** — they serve a separate purpose
- Typography: `font-display: 'Outfit'`, `font-sans: 'Inter'`, `font-mono: 'JetBrains Mono'` — already correct

## Commands You Will Need

| Purpose   | Command                              | Expected on success |
|-----------|--------------------------------------|---------------------|
| Typecheck | `pnpm --filter @trainers/web tsc --noEmit` | exit 0              |
| Build     | `pnpm build:web`                     | exit 0              |
| Lint      | `pnpm --filter @trainers/web lint`   | exit 0              |
| Test      | `pnpm test:targeted`                 | all pass            |

## Scope

**In scope** (files you should modify):
- `apps/web/src/index.css`

**Out of scope** (do NOT touch):
- `apps/web/src/routes/landing.css` — landing page is self-contained and already matches design.md
- `apps/web/src/routes/index.tsx` — landing page component
- `docs/design.md` — this is the SOURCE OF TRUTH, not a file to change
- Any `*.tsx` files — token renaming will be handled via Tailwind class mapping, NOT component rewrites

## Git Workflow

- Branch: `advisor/001-unify-design-tokens`
- Commit style: `style: <description>` (matches existing pattern from git log)
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Reconcile `:root` variables with `docs/design.md`

Replace the `:root` block (lines 60-123 of `index.css`) with a new block that:

1. **Maps** `design.md` tokens as the canonical names AND provides backward-compatible aliases for existing Tailwind usage:
   ```css
   :root {
     /* ── Canonical tokens (from docs/design.md) ──── */
     --bg: #fafafa;
     --surface: #f5f5f5;
     --border: #e5e5e5;
     --fg: #0a0a0a;
     --fg2: #525252;
     --fg3: #a3a3a3;
     --inv-bg: #0a0a0a;
     --inv-fg: #fafafa;

     /* ── Tailwind compatibility aliases ────────── */
     --background: var(--bg);
     --foreground: var(--fg);
     --card: var(--surface);
     --card-foreground: var(--fg);
     --popover: var(--surface);
     --popover-foreground: var(--fg);
     --primary: var(--inv-bg);          /* Primary action = inverted bg */
     --primary-foreground: var(--inv-fg);
     --secondary: var(--surface);
     --secondary-foreground: var(--fg);
     --muted: var(--bg);
     --muted-foreground: var(--fg3);
     --accent: var(--surface);
     --accent-foreground: var(--fg);
     --destructive: #DC2626;
     --destructive-foreground: #fafafa;
     --input: var(--border);
     --ring: var(--fg);

     /* ...keep all other tokens unchanged (fonts, radius, shadow, module colors, chart colors) */
   }
   ```

2. **Key change**: `--primary` now derives from `--inv-bg` in BOTH modes. No more Navy→Gold color shift.

**Verify**: `grep -c "var(--bg)" apps/web/src/index.css` → returns at least 4 matches (the aliases)

### Step 2: Reconcile `.dark` block

Replace `.dark` (lines 125-176) with:
```css
.dark {
  /* ── Canonical tokens (dark) ──── */
  --bg: #0a0a0a;
  --surface: #171717;
  --border: #262626;
  --fg: #fafafa;
  --fg2: #a3a3a3;
  --fg3: #525252;
  --inv-bg: #fafafa;
  --inv-fg: #0a0a0a;

  /* ── Tailwind compatibility (derived) ────── */
  --background: var(--bg);
  --foreground: var(--fg);
  --card: var(--surface);
  --card-foreground: var(--fg);
  --popover: var(--surface);
  --popover-foreground: var(--fg);
  --primary: var(--inv-bg);
  --primary-foreground: var(--inv-fg);
  --secondary: #27272A;
  --secondary-foreground: var(--fg);
  --muted: var(--surface);
  --muted-foreground: var(--fg2);
  --accent: #27272A;
  --accent-foreground: var(--fg);
  --destructive: #DC2626;
  --destructive-foreground: #FEF2F2;
  --input: var(--border);
  --ring: var(--fg);

  --shadow-sm: 0 1px 2px rgba(0,0,0,.5), 0 0 0 1px rgba(255,255,255,.05);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,.4), 0 2px 4px -1px rgba(255,255,255,.05);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,.5), 0 4px 6px -2px rgba(255,255,255,.05);

  --surface-elevated: #1F1F23;

  /* Keep module + chart colors unchanged */
}
```

**Verify**: `pnpm build:web` → exit 0 (confirms Tailwind can resolve all tokens)

### Step 3: Add new semantic spacing and surface tokens

After the `.dark` block, add these new tokens that the subsequent redesign plans will use:
```css
:root {
  --sidebar-width: 280px;
  --sidebar-collapsed-width: 72px;
  --header-height: 56px;
  --content-max-width: 1400px;
  --surface-elevated: #FFFFFF;
  --surface-sunken: #F0F0EF;
}
.dark {
  --surface-elevated: #1F1F23;
  --surface-sunken: #111113;
}
```

**Verify**: `grep "sidebar-width" apps/web/src/index.css` → returns 2 matches (root + used in @theme)

### Step 4: Update `@theme` block to expose new tokens

Add the new canonical tokens to the `@theme` block (lines 5-57) so Tailwind classes like `bg-bg`, `text-fg`, `text-fg2` work:
```css
@theme {
  /* ...existing mappings... */
  --color-bg: var(--bg);
  --color-fg: var(--fg);
  --color-fg2: var(--fg2);
  --color-fg3: var(--fg3);
  --color-surface: var(--surface);
  --color-surface-elevated: var(--surface-elevated);
  --color-surface-sunken: var(--surface-sunken);
  --color-inv-bg: var(--inv-bg);
  --color-inv-fg: var(--inv-fg);
}
```

**Verify**: `pnpm build:web` → exit 0

### Step 5: Verify no visual regression on existing pages

Since `--primary` changed in dark mode (from Gold `#F59E0B` to White `#fafafa`), every `bg-primary` / `text-primary` element will change appearance in dark mode. This is **intentional** — it aligns with the design.md spec. But verify the build completes and the test suite still passes.

**Verify**:
1. `pnpm build:web` → exit 0
2. `pnpm test:targeted` → all pass
3. `pnpm --filter @trainers/web lint` → exit 0

## Test Plan

- No new tests needed for this CSS-only change.
- Run existing test suite: `pnpm test:targeted` → all pass.
- Visual verification: start dev server (`pnpm dev`), navigate to `/dashboard`, toggle dark/light mode. Primary buttons should be **black on light / white on dark** (neutral, not gold).

## Done Criteria

- [ ] `pnpm build:web` exits 0
- [ ] `pnpm test:targeted` exits 0
- [ ] `grep "var(--bg)" apps/web/src/index.css` returns at least 4 lines
- [ ] `grep "#F59E0B" apps/web/src/index.css` returns 0 lines (gold primary removed)
- [ ] `:root` and `.dark` blocks both define `--bg`, `--fg`, `--fg2`, `--fg3`, `--surface`, `--border`, `--inv-bg`, `--inv-fg`
- [ ] No files outside `apps/web/src/index.css` modified
- [ ] `plans/README.md` status row updated to DONE

## STOP Conditions

Stop and report back if:
- The code at `index.css:60-177` doesn't match the excerpts (codebase has drifted).
- `pnpm build:web` fails after step 2 — this means a Tailwind class relies on a removed/renamed token.
- Any `.tsx` file has a hardcoded color hex (e.g., `#F59E0B`) that was supposed to come from the token — that file needs updating too, which is out of scope for this plan.
- The module accent colors (`--module-ketik`, etc.) are broken — they should remain unchanged.

## Maintenance Notes

- The backward-compatible aliases (`--background: var(--bg)`) exist so that ALL existing Tailwind usage (`bg-background`, `text-foreground`, etc.) continues working without touching `.tsx` files.
- Future plans (002-007) will gradually adopt the canonical names (`bg-bg`, `text-fg`), and once migration is complete, the aliases can be removed.
- The `--primary` identity change (dark mode: gold → white) is the most visible change. Downstream plans will build on this neutral-primary approach. If the user wants to keep gold accents, they should be moved to `--accent` instead.
- If `docs/design.md` is updated in the future, this file should be updated to match.
