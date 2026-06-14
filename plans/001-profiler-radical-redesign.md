# Plan 001: Implement Radical Redesign in Profiler Workspace

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat 671c610..HEAD -- apps/web/src/routes/profiler`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tech-debt (UI/UX)
- **Planned at**: commit `671c610`, 2026-06-13

## Why this matters

The `docs/design.md` specifies a "Utility-First & Minimalist" approach with "No AI Slop" (no floating blobs, no decorative gradients). The recent landing page and auth modal updates executed this radical redesign with high-contrast borders and `Outfit` / `Inter` typography. The Profiler Workspace still retains the legacy styling—including decorative glowing blobs (`blur-[120px]`), excessive drop shadows, and misaligned typography. Redesigning this module brings it to parity with the new application-wide design language, creating a consistent, premium, and distraction-free user experience.

## Current state

- The relevant files:
  - `apps/web/src/routes/profiler/index.tsx` — Main layout containing outdated glowing backgrounds.
  - `apps/web/src/routes/profiler/components/workspace/HierarchyPanel.tsx` — Sidebar navigation; uses outdated shadows and font weights.
  - `apps/web/src/routes/profiler/components/workspace/WorkspaceNavigator.tsx` — Active tabs and team cards; uses outdated shadow effects.
  - `apps/web/src/routes/profiler/components/workspace/WorkspaceHeader.tsx` — Top header; needs typography alignment.

- Code excerpt (`apps/web/src/routes/profiler/index.tsx:258-261`):
  ```tsx
  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full pointer-events-none overflow-hidden z-0">
    <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/3 rounded-full blur-[120px]" />
    <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-module-profiler/5 rounded-full blur-[120px]" />
  </div>
  ```

- The repo conventions that apply here:
  "High Contrast & Crisp: Gunakan garis tepi (border) yang tegas, kontras warna yang jelas, dan hindari bayangan (drop-shadow) yang terlalu lembut/berlebihan." (from `docs/design.md`). Use `bg-surface border border-border` instead of `shadow-xl`. Headings must use `font-outfit` and `tracking-tight`.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `pnpm --filter @trainers/web typecheck` | exit 0, no errors |
| Lint      | `pnpm --filter @trainers/web lint` | exit 0              |
| Build     | `pnpm --filter @trainers/web build` | exit 0             |

## Scope

**In scope**:
- `apps/web/src/routes/profiler/index.tsx`
- `apps/web/src/routes/profiler/components/workspace/HierarchyPanel.tsx`
- `apps/web/src/routes/profiler/components/workspace/WorkspaceNavigator.tsx`
- `apps/web/src/routes/profiler/components/workspace/WorkspaceHeader.tsx`
- `apps/web/src/routes/profiler/components/workspace/WorkspaceActiveBatch.tsx`

**Out of scope**:
- Analytics or export modules inside Profiler.
- Any API service calls or data fetching hooks.

## Git workflow

- Branch: `advisor/001-profiler-redesign`
- Commit message style: `feat: redesign profiler UI to match docs/design.md`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Remove "AI Slop" backgrounds
In `apps/web/src/routes/profiler/index.tsx`, locate the absolute positioned wrapper containing the `blur-[120px]` glowing blobs and delete it entirely. This adheres to the "NO AI SLOP" rule.

**Verify**: `grep -rn "blur-\[120px\]" apps/web/src/routes/profiler/index.tsx` → returns empty.

### Step 2: Implement Crisp Borders & Remove Drop Shadows
In `HierarchyPanel.tsx`, `WorkspaceNavigator.tsx`, and `WorkspaceActiveBatch.tsx`:
- Find all instances of `shadow-lg`, `shadow-xl`, `shadow-2xl` and remove them.
- Replace container backgrounds that rely on shadows with `bg-surface border border-border`. For elements that were already `bg-card` and had shadows, transition them to `bg-surface border border-border`.

**Verify**: `grep -rn "shadow-2xl" apps/web/src/routes/profiler/components/workspace/` → returns no matches.

### Step 3: Align Typography with Design System
In all in-scope files:
- Find large headings (like `PROFILER WORKSPACE` or titles of modals/panels). Ensure they use `font-outfit font-black tracking-tight`.
- Ensure body text relies on `font-inter` and `text-fg2` or `text-muted-foreground`. Use `text-fg` for primary values.

**Verify**: `pnpm --filter @trainers/web lint` → exits 0.

### Step 4: Enhance UX with Micro-interactions and Animation (Framer Motion)
Following `docs/design.md` Motion & Animation rules:
- **Hover States**: For clickable cards/rows (e.g., in `WorkspaceNavigator.tsx` and `HierarchyPanel.tsx`), ensure `transition-all duration-150 ease-out` is applied. Change the background to a slightly lighter surface or change border color on hover (`hover:bg-accent` or `hover:border-foreground/20`).
- **Entrance Animation**: For list items (teams/folders), wrap them in Framer Motion `<motion.div>` if not already, using the staggered fade-up pattern: `initial={{ opacity: 0, y: 15 }}`, `animate={{ opacity: 1, y: 0 }}`, `transition={{ duration: 0.4, ease: "easeOut" }}`. Remove any jumpy or overly bouncy animations.
- **Focus States**: On interactive elements like inputs or buttons in modals, apply `focus:outline-none focus:border-fg` to match the crisp input styling.

**Verify**: Code review confirms the presence of `initial={{ opacity: 0, y: 15 }}` and hover transitions on interactive cards.

## Test plan

- Manual UI Check: Run `pnpm dev`, navigate to `/profiler`. Verify that the background is completely solid without gradients/blobs. Verify the sidebar and cards have 1px crisp borders without shadows. Verify headings look sharp using the `Outfit` font.
- Verification: `pnpm --filter @trainers/web build` → exits 0 without type errors.

## Done criteria

- [ ] `pnpm --filter @trainers/web typecheck` exits 0
- [ ] `pnpm --filter @trainers/web build` exits 0
- [ ] No files outside the in-scope list are modified (`git status`)
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:
- The codebase has drifted since this plan was written and the excerpts do not match.
- Applying `bg-surface border border-border` drastically breaks the layout constraints.
- You encounter custom CSS in `index.tsx` that overrides standard Tailwind utility classes for typography or colors.

## Maintenance notes

- This redesign should serve as a template for other modules (`SIDAK`, `Telefun` dashboard) to follow the new UI conventions in `docs/design.md`. Reviewers should scrutinize any new UI components to ensure no drop-shadows or gradients creep back in.
