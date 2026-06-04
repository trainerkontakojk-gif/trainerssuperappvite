# Phase 109: SIDAK Agent Score Caching & Score Card UI Overhaul

## Summary

Two improvements: (1) Agent Detail page now queries `qa_dashboard_agent_period_summary` materialized view for cached per-period scores, with real-time fallback using `resolveEffectiveRuleVersionForPeriod` for dynamic weights/indicators; (2) `SidakInputScoreCard` UI overhaul with SVG radial progress ring, glassmorphism, live pulse badge.

## Changes

### 1. Agent Detail Score Caching

**Files:**
- `apps/api/src/services/sidak/agent-directory.ts` — Added parallel query to `qa_dashboard_agent_period_summary` MV for cached `(period_id, service_type)` scores; if MV has data, use `final_score`/`non_critical_score`/`critical_score`/`session_count` directly (avoiding expensive real-time recalculation); else fallback to real-time calculation via `resolveEffectiveRuleVersionForPeriod` for period-specific rule weights/indicators, with error-safe fallback to `DEFAULT_SERVICE_WEIGHTS`

**Behavior:**
- Agent detail summaries now use DB-cached scores when available (faster, consistent with dashboard)
- If MV row is missing (e.g., period not yet summarized), falls back to real-time calculation using the effective rule version for that specific period
- Error handling: if `resolveEffectiveRuleVersionForPeriod` throws, gracefully uses `DEFAULT_SERVICE_WEIGHTS` and period's registered indicators

### 2. SidakInputScoreCard UI Overhaul

**Files:**
- `apps/web/src/components/sidak/SidakInputScoreCard.tsx` — Complete visual overhaul:
  - Renamed from "Estimasi Skor" to "Skor Kualitas (Live)"
  - SVG radial progress ring (circumference/strokeDashoffset) replacing horizontal progress bar
  - Glassmorphism design (`backdrop-blur-md`, `bg-card/75`, `border-border/80`)
  - Live pulse badge with `animate-ping` green dot + "Kalkulasi Live" text
  - ShieldAlert and ShieldCheck icons for NC/CR breakdown cards
  - Rounded-2xl cards for NC/CR with `[0.04]` opacity backgrounds
  - Flat mode and No Category mode cards restyled with updated typography
  - Info footnote with "Telah diinput X sesi" text + Info icon
  - Glow effect (`bg-primary/5 blur-3xl`)

- `apps/web/src/__tests__/sidak-input-parity.test.tsx` — Updated assertions: "Skor Kualitas (Live)" title, SVG circle selector, `text-2xl font-black` class, updated NC/CR card class names

## Files Modified

- `apps/api/src/services/sidak/agent-directory.ts` — **Moderate**: MV score caching with fallback
- `apps/web/src/components/sidak/SidakInputScoreCard.tsx` — **Major**: Full UI overhaul (~195 lines changed)
- `apps/web/src/__tests__/sidak-input-parity.test.tsx` — **Minor**: Updated test selectors

## Test Impact

Updated existing SidakInputPage test assertions. 0 new tests needed (existing tests already cover contract).

## Regression Tests

468 web + 479 API tests passing.
