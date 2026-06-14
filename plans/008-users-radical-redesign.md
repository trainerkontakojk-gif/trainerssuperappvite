# 008 - Kelola Pengguna (User Management) Radical Redesign

## Context & Motivation

The "Kelola Pengguna" (`apps/web/src/routes/dashboard/users.tsx`) page currently uses an older, Tailwind-heavy design system with hardcoded colors (e.g., `indigo-50`, `gray-200`), generic drop-shadows (`shadow-sm`), and complex colored badges for status and roles. 

According to the new `docs/design.md`, the UI must be radically redesigned to be:
- **Utility-First & Minimalist**: Avoid decorative badges and unnecessary backgrounds.
- **High Contrast & Crisp**: Rely on firm borders and CSS variables (`var(--surface)`, `var(--border)`).
- **NO "AI SLOP"**: Remove "tameng" (shield) icons in colored squares just to signify active status. Rely on simple, clear typography and spacing.

This plan details the steps to completely overhaul the User Management page to match the `design.md` specifications while keeping the UX intuitive and the existing functionality intact.

## Executable Steps

### Step 1: Strip Old Tailwind Classes and Apply CSS Variables in `users.tsx`
**File:** `apps/web/src/routes/dashboard/users.tsx`

**Action:** Replace all instances of hardcoded Tailwind colors, borders, and shadows with arbitrary values using the required CSS variables from `docs/design.md`.

**Details:**
1. **Container Backgrounds & Shadows:**
   - Change `bg-white shadow-sm` to `bg-[var(--surface)]`.
   - Remove all instances of `shadow-sm`, `shadow-md`, `hover:shadow-md`.
   - Change borders from `border-gray-200` or `border` to `border border-[var(--border)]`.

2. **Typography & Colors:**
   - Change headings and primary text from `text-gray-900` to `text-[var(--fg)]`.
   - Change secondary text from `text-gray-500` and `text-gray-400` to `text-[var(--fg2)]` and `text-[var(--fg3)]`.
   - Change fonts: apply `font-['Outfit',sans-serif]` for main headings and `font-['Inter',sans-serif]` for body text (or rely on global sans setting if already configured).

3. **Buttons:**
   - **Primary Buttons (e.g., Approve, Simpan):** 
     Change to: `bg-[var(--inv-bg)] text-[var(--inv-fg)] rounded-[6px] px-3 py-1.5 text-xs font-medium transition-all hover:opacity-90`
   - **Secondary/Ghost Buttons (e.g., Tolak, Suspend, Hapus Akun, Reset Pwd):** 
     Change to: `bg-transparent border border-[var(--border)] text-[var(--fg)] rounded-[6px] px-3 py-1.5 text-xs font-medium transition-all hover:bg-[var(--surface)]`
     *Note: Do not use red/emerald/amber buttons for actions. Use standard secondary buttons, perhaps with an icon to denote destructive actions but strictly adhering to the neutral color palette from `design.md`.*

4. **Inputs & Selects:**
   - Search Input: Change to `bg-transparent border border-[var(--border)] text-[var(--fg)] placeholder:text-[var(--fg3)] focus:border-[var(--fg)] focus:outline-none rounded-[6px]`. Remove focus rings (`focus:ring-1`).
   - Select Input (Role): Apply similar input styling.

5. **Status Badges & Decorative Icons:**
   - Remove the large `bg-amber-50`, `bg-emerald-50` avatar blocks with `ShieldCheck`/`UserPlus` icons. This is classified as "AI Slop".
   - Instead, present the user's name cleanly. Show the status as a minimal, high-contrast pill or simple text (e.g., `text-[var(--fg2)] uppercase tracking-wider text-[10px] border border-[var(--border)] rounded-full px-2 py-0.5`).

6. **Tabs (Filter):**
   - Replace the `bg-indigo-600 text-white` active state with `bg-[var(--fg)] text-[var(--bg)]`.
   - Replace the inactive state with `text-[var(--fg2)] hover:bg-[var(--surface)]`.
   - Simplify the pill counters.

### Step 2: Streamline the Layout Structure
**File:** `apps/web/src/routes/dashboard/users.tsx`

**Action:** Reorganize the grid layout of user cards to be more compact and scannable.

**Details:**
- Remove the "Actions Description Cards" (Status Approval, Reset Password, Lifecycle descriptions). They clutter the UI. Rely on clear button labels instead.
- Combine user details and action buttons into a cleaner row/flex layout instead of the complex grid. 
- Example new structure for a user card:
  ```jsx
  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border border-[var(--border)] bg-[var(--surface)] rounded-[12px] gap-4 mb-3">
    {/* User Info */}
    <div className="flex flex-col">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-[var(--fg)]">{entry.full_name}</h3>
        <span className="text-[10px] uppercase tracking-wider text-[var(--fg2)] border border-[var(--border)] rounded px-1.5">
          {normalizeStatusLabel(entry.status)}
        </span>
      </div>
      <p className="text-xs text-[var(--fg2)] mt-0.5">{entry.email}</p>
      <div className="text-[11px] text-[var(--fg3)] mt-2">
        ID: {entry.id.slice(0, 8)} • Role: {normalizeRoleLabel(entry.role)}
      </div>
    </div>

    {/* Actions */}
    <div className="flex flex-wrap items-center gap-2">
      {/* Role Select */}
      {/* Action Buttons */}
    </div>
  </div>
  ```

### Step 3: Animation & Transitions
**File:** `apps/web/src/routes/dashboard/users.tsx`

**Action:** Apply Framer Motion (if available) or standard CSS transitions.

**Details:**
- Ensure all hover states have `transition-all duration-150 ease-out`.
- If using `framer-motion`, wrap the user list mapping in an `<AnimatePresence>` and each card in a `<motion.div>` with:
  `initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: "easeOut" }}`

## Scope & Boundaries
- **IN SCOPE:** `apps/web/src/routes/dashboard/users.tsx`
- **OUT OF SCOPE:** API endpoints, authentication logic, database schema, other pages.
- **RESTRICTIONS:** Do not introduce any new colors outside of the CSS variables listed in `docs/design.md`. Do not add any new external dependencies. 

## Verification & Done Criteria
1. Run `pnpm --filter @trainers/web run build` and ensure there are no TypeScript or build errors.
2. Run `pnpm --filter @trainers/web run lint` to ensure no linting regressions.
3. Visually verify the UI matches the minimalist, high-contrast aesthetic defined in `design.md`.
4. Ensure all user actions (Change Role, Approve, Reject, Suspend, Reset Password, Delete) still trigger the correct API calls and notify the user successfully.

## Escape Hatch
If you encounter missing CSS variables in the actual runtime environment, do not create a separate CSS file. Ensure you use the exact variable names provided in `docs/design.md` via Tailwind arbitrary values (e.g., `bg-[var(--surface)]`). If the variables aren't globally injected yet, implement them via inline `style={{ '--surface': '#171717', ... }}` at the root wrapper of this component as a fallback, but prioritize using the arbitrary tailwind classes first.
