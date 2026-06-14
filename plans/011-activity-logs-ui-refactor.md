# Plan 011: Activity Logs UI Refactor

Refactor the Activity Logs page (`/dashboard/activities`) to align with the project's design system and ensure visual parity with the recently updated Monitoring and Access Groups modules.

## 1. Requirement
- **Sidebar Spacing**: Implement responsive padding (`p-4 lg:p-8`) and a max-width container (`max-w-[var(--content-max-width)]`) to prevent elements from being too close to the sidebar.
- **Typography**: Update headers to use the `Outfit` font family and semantic `--foreground` color.
- **Semantic Colors**: Replace hardcoded Tailwind color utility classes (e.g., `indigo`, `emerald`, `red`, `gray`) with semantic CSS variables (`--primary`, `--chart-green`, `--chart-red`, `--fg`, `--border`).
- **Module Identity**: Use module-specific semantic variables for the "Modul" column.
- **Theme Support**: Clean up redundant `bg-white` and `gray` classes; use `--card` and `--bg` tokens for automatic theme support.
- **Visual Polish**: Apply "Linear-style" aesthetic with crisp borders, subtle transitions, and refined badges.

## 2. Design
- **Layout**: Wrap content in a `motion.div` with entrance animations and standardized container classes.
- **Header**: Use `font-outfit` for the title; update "Audit Trail" pill to use neutral/semantic colors.
- **Table**: Standardize row hover states and border colors; update action badges to use semantic chart variables.
- **Transitions**: Ensure 0.15s ease-out transitions for interactive elements.

## 3. Tasklist
- [x] Update root layout in `activities.tsx` with responsive padding and max-width.
- [x] Update header typography and colors to use `font-outfit` and semantic variables.
- [x] Refactor `getActionColor` helper to use semantic `--chart` variables.
- [x] Refactor table headers and rows to use design system tokens (`--border`, `--fg`, `--card`).
- [x] Update filter inputs and buttons to match the Monitoring page visual style.
- [x] Clean up all hardcoded `indigo` and `gray` color tokens.
- [x] Add entrance animations using `framer-motion`.
- [x] Run `tsc` and relevant regression tests.

## 4. Test Strategy
- **Manual**: Verify visual layout across mobile and desktop views; check light and dark mode consistency.
- **Automated**: Run `pnpm --filter @trainers/web test src/__tests__/activities.test.tsx` (if it exists) or create a new smoke test.
- **Type Check**: Run `pnpm --filter @trainers/web exec tsc --noEmit`.
