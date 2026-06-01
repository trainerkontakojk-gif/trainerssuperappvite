# Phase 94: PDKT Settings Visual Polish

**Goal:** Align the PDKT SettingsModal visual language with the KETIK and Telefun modals already polished in earlier phases, reducing cognitive load and ensuring a consistent design system across all three simulation modules.

## Summary of Changes

- **SettingsModal.tsx:** Refined overlay (`bg-background/80 backdrop-blur-md`), increased max-height to `88vh`, smoother spring animation (bounce 0.1→0.1, duration 0.4→0.6 → 0.1/0.4), added `bg-muted/20` header bar, `border-border/30` tab container, `cursor-pointer` on all interactive buttons.
- **PdktScenariosTab.tsx:** Compact control bar (`p-4`, `gap-4`), smaller checkbox (`w-6 h-6 rounded-md`), `gap-3` list spacing, `text-xs` description text, `p-2` action buttons with `bg-background border-border`, "Lampiran" label instead of "Attachments".
- **PdktConsumersTab.tsx:** Left-border accent tips banner (`border-l-2 border-primary`), reduced grid gap (`gap-3`), smaller check badge (`w-3.5 h-3.5`), consistent active state with `border-primary shadow-sm` instead of `bg-primary` fill, consistent inactive `bg-card/40 border-border/40`.
- **PdktIdentityTab.tsx:** Same left-border banner pattern, tighter input spacing (`space-y-3`), smaller icon containers (`w-8 h-8 rounded-lg`), cleaner label typography (`text-[10px] font-bold uppercase tracking-widest`), reduced grid gap (`gap-6`).
- **PdktSystemTab.tsx:** Consistent left-border header, compact writing-style and model selection cards (`p-5`), smaller dot indicators (`w-2 h-2`), `cursor-pointer` on all option cards, `text-xs` descriptions.

## Design Consistency Pattern

All three settings modals (KETIK, PDKT, Telefun) now share:
- Header: `bg-muted/20` with `border-b border-border/40`
- Tab strip: `bg-muted border border-border/30` with `rounded-lg` active indicator
- Content: `bg-card px-6 py-5`
- Banner: `bg-primary/5 border-l-2 border-primary rounded-r-xl`
- Cards: `border-primary shadow-sm` active, `bg-card/40 border-border/40` inactive
- Buttons: `rounded-lg` with `cursor-pointer`
- Typography: `text-xs` body, `text-[10px] font-bold uppercase tracking-widest` labels

## Files Modified

1. `apps/web/src/routes/pdkt/components/SettingsModal.tsx`
2. `apps/web/src/routes/pdkt/components/settings/PdktScenariosTab.tsx`
3. `apps/web/src/routes/pdkt/components/settings/PdktConsumersTab.tsx`
4. `apps/web/src/routes/pdkt/components/settings/PdktIdentityTab.tsx`
5. `apps/web/src/routes/pdkt/components/settings/PdktSystemTab.tsx`

## Verification

- Visual parity across KETIK, PDKT, and Telefun settings modals
- No logic changes — pure styling refinements
- All existing tests unaffected
