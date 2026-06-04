# Phase 113: Profiler Slides Label Fix

## Requirement

User reported confusing slide mode labels: "Opsi 2" and "Original" were unclear to trainers. Changed to intuitive labels: "Landscape" and "Portrait".

## Changes

- **SlideModeControls.tsx**: Renamed "Original" → "Landscape" (title: "Versi Landscape"), "Opsi 2" → "Portrait" (title: "Portrait A4")
- **ParticipantSlide.tsx**: Changed subtitle label from "Opsi 2 · Portrait A4" to "Portrait A4"

## Files Modified

- `apps/web/src/routes/profiler/components/slides/SlideModeControls.tsx` — button labels and titles
- `apps/web/src/routes/profiler/components/slides/ParticipantSlide.tsx` — slide subtitle label
