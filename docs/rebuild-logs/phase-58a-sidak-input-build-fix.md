# Phase 58a — SIDAK Input Railway Build Fix (ArrowLeft Import)

**Status:** DONE
**Date:** 2026-05-26
**Type:** Build Fix (Hotfix)

## Summary

Railway deployment build failed with TypeScript error `TS2304: Cannot find name 'ArrowLeft'` at `apps/web/src/routes/sidak/input.tsx:1032`.

The `ArrowLeft` icon component was used in the compact breadcrumb navigation (back button) introduced in Phase 58, but was missing from the `lucide-react` import statement — causing `tsc` to fail during `pnpm run build:web`.

## Root Cause

Phase 58 refactored `input.tsx` to add a compact inline breadcrumb with a back-arrow button (`<ArrowLeft className="w-4 h-4" />`), but `ArrowLeft` was not added to the existing `lucide-react` import block (line 5–10).

## Fix

Added `ArrowLeft` to the `lucide-react` named import on line 6:

```tsx
// Before
import {
  FolderOpen, User as UserIcon, CalendarDays, Plus,
  Upload, Download, Check, X, ChevronRight,
  Loader2, AlertCircle,
  AlertTriangle, Eye, EyeOff,
} from "lucide-react";

// After
import {
  ArrowLeft, FolderOpen, User as UserIcon, CalendarDays, Plus,
  Upload, Download, Check, X, ChevronRight,
  Loader2, AlertCircle,
  AlertTriangle, Eye, EyeOff,
} from "lucide-react";
```

## Files Modified

| File | Change |
|------|--------|
| `apps/web/src/routes/sidak/input.tsx` | Added `ArrowLeft` to lucide-react import |

## Verification

- TypeScript compilation: No errors
- Railway build: `pnpm run build:web` passes
