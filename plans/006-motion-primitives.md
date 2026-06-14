# Plan 006: Establish unified motion primitives (framer-motion wrappers)

> **Executor instructions**: Follow this plan step by step.

## Status

- **Priority**: P2
- **Effort**: M (1 day)
- **Risk**: LOW — additive, no existing code changes
- **Depends on**: plans/001
- **Category**: tech-debt
- **Planned at**: commit `671c610`, 2026-06-13

## Why This Matters

The app uses `framer-motion` in **40+ files** — all with inline `motion.div` and hand-typed `initial/animate/transition` props. There is **no reusable animation wrapper**. This causes:
1. **Inconsistency**: entrance animations range from `y: 15` to `y: 20`, durations from `0.3s` to `0.6s`
2. **Verbosity**: every animated element repeats 3-4 lines of motion props
3. **No page transitions**: route changes are instant cuts — no animation between pages

The `docs/design.md` spec defines standard motion parameters:
- `initial={{ opacity: 0, y: 15 }}`
- `animate={{ opacity: 1, y: 0 }}`
- `transition={{ duration: 0.4, ease: "easeOut" }}`
- Max duration: `0.6s`

This plan creates **4 reusable primitives** that encode these rules.

## Scope

**In scope** (all NEW files):
- `apps/web/src/components/motion/FadeIn.tsx` — entrance animation wrapper
- `apps/web/src/components/motion/StaggerList.tsx` — staggered children
- `apps/web/src/components/motion/PageTransition.tsx` — route transition wrapper
- `apps/web/src/components/motion/index.ts` — barrel export

**Out of scope**:
- Existing components — do NOT migrate them to use these wrappers yet (that's future work)
- `apps/web/src/router.tsx` — PageTransition integration is opt-in per page
- Plan 007 will be the first consumer of these primitives

## Steps

### Step 1: Create FadeIn wrapper

```tsx
// apps/web/src/components/motion/FadeIn.tsx
import { motion, type HTMLMotionProps } from "framer-motion";

interface FadeInProps extends HTMLMotionProps<"div"> {
  delay?: number;
  duration?: number;
  y?: number;
  className?: string;
  children: React.ReactNode;
}

export function FadeIn({
  delay = 0,
  duration = 0.4,
  y = 15,
  children,
  ...rest
}: FadeInProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration, delay, ease: "easeOut" }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}
```

### Step 2: Create StaggerList wrapper

```tsx
// apps/web/src/components/motion/StaggerList.tsx
import { motion } from "framer-motion";

interface StaggerListProps {
  stagger?: number;
  className?: string;
  children: React.ReactNode;
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.06 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

export function StaggerList({ stagger = 0.06, className, children }: StaggerListProps) {
  return (
    <motion.div
      className={className}
      variants={{ ...containerVariants, show: { ...containerVariants.show, transition: { staggerChildren: stagger } } }}
      initial="hidden"
      animate="show"
    >
      {children}
    </motion.div>
  );
}

// Export item wrapper for use inside StaggerList
export function StaggerItem({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={itemVariants}>
      {children}
    </motion.div>
  );
}
```

### Step 3: Create PageTransition wrapper

```tsx
// apps/web/src/components/motion/PageTransition.tsx
import { motion, AnimatePresence } from "framer-motion";

interface PageTransitionProps {
  routeKey: string;
  children: React.ReactNode;
}

export function PageTransition({ routeKey, children }: PageTransitionProps) {
  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={routeKey}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
```

### Step 4: Create barrel export

```tsx
// apps/web/src/components/motion/index.ts
export { FadeIn } from './FadeIn';
export { StaggerList, StaggerItem } from './StaggerList';
export { PageTransition } from './PageTransition';
```

### Step 5: Verify

```bash
pnpm --filter @trainers/web tsc --noEmit  # exit 0
pnpm build:web                             # exit 0
```

## Done Criteria

- [ ] 4 new files exist under `apps/web/src/components/motion/`
- [ ] `pnpm build:web` exits 0
- [ ] No existing files modified
- [ ] `plans/README.md` status row updated

## Maintenance Notes

- These primitives are intentionally minimal — they encode the `docs/design.md` motion spec and nothing else.
- `PageTransition` uses `mode="wait"` to prevent content overlap during transitions. This means the exit animation must complete before the next page enters.
- Components should be imported from `@/components/motion` once a path alias is set, or `../../components/motion` via relative imports.
- Future work: migrate existing 40+ inline `motion.div` usages to these wrappers (separate cleanup plan).
