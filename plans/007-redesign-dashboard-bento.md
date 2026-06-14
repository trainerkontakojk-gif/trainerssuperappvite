# Plan 007: Redesign dashboard page — bento grid layout

> **Executor instructions**: Follow this plan step by step.

## Status

- **Priority**: P2
- **Effort**: L (2-3 days)
- **Risk**: MED — touches the most-visited authenticated page
- **Depends on**: plans/001, plans/006
- **Category**: direction
- **Planned at**: commit `671c610`, 2026-06-13

## Why This Matters

The current dashboard (`routes/dashboard.tsx`, 612 lines) is a traditional card grid:
- Welcome header with user name
- Module cards (6 cards, each with icon, title, description, arrow)
- Recent activities section
- Trend panel (lazy-loaded Recharts)
- Summary stats (total users, total defects, etc.)

While functional, it doesn't match the landing page's bold, typographic, Linear-inspired aesthetic. The dashboard is the **first thing users see after login** — it sets the visual tone for the entire app experience.

The redesign transforms this into a **bento grid layout** — a modern, asymmetric grid where cards have varying sizes based on information density. This is the style used by Linear, Vercel, and Apple's marketing pages.

## Current State

**File**: `apps/web/src/routes/dashboard.tsx` (612 lines)

Current layout:
```
┌─────────────────────────────────────────────┐
│ Welcome, [Name]         Role: Trainer       │  ← hero section
├─────────┬─────────┬─────────┬─────────┬─────┤
│ Dashboard│ Ketik   │ PDKT    │ Telefun │ KTP │  ← module cards (uniform grid)
├─────────┼─────────┼─────────┴─────────┴─────┤
│ SIDAK   │  (more) │                         │
├─────────┴─────────┴─────────────────────────┤
│ Recent Activities (5 items)                 │
├─────────────────────────────────────────────┤
│ Trend Panel (Recharts)                      │  ← lazy loaded
└─────────────────────────────────────────────┘
```

**Design tokens available (after Plan 001)**:
- `--bg`, `--surface`, `--fg`, `--fg2`, `--fg3`
- `--inv-bg`, `--inv-fg`
- `--surface-elevated`, `--surface-sunken`
- Module accent colors

**Motion primitives available (after Plan 006)**:
- `FadeIn`, `StaggerList`, `StaggerItem`, `PageTransition`

## Target Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│  Selamat datang, [Name].                                         │  ← minimal greeting
│  Hari ini Selasa, 13 Jun 2026                                    │  ← date context
│                                                                  │
├────────────────────┬────────────────────┬────────────────────────┤
│                    │                    │                        │
│  KETIK             │  PDKT              │   📊 Quick Stats      │  ← bento: 1×1, 1×1, 1×2
│  Simulasi Chat     │  Email Draft       │   12 sesi KETIK       │
│  3 sesi hari ini   │  2 draft pending   │   45 temuan SIDAK     │
│                    │                    │   8 agen aktif         │
│  → Mulai sesi      │  → Buka workspace  │                       │
│                    │                    │                        │
├────────────────────┴────────────────────┼────────────────────────┤
│                                         │                        │
│  SIDAK Overview                         │  Aktivitas Terbaru     │  ← bento: 2×1, 1×1
│  ┌───────────────────────┐              │  • [User] edit temuan  │
│  │ Trend sparkline       │              │  • [User] submit sesi  │
│  └───────────────────────┘              │  • ...                 │
│  156 temuan · 23 agen · 4 periode       │                        │
│                                         │                        │
├────────────────────┬────────────────────┴────────────────────────┤
│                    │                                             │
│  Telefun           │   KTP / Profiler                            │  ← bento: 1×1, 2×1
│  Voice Sim         │   245 peserta · 12 tim                      │
│  Avg: 8.2/10       │   Last update: 2 jam lalu                   │
│                    │                                             │
└────────────────────┴─────────────────────────────────────────────┘
```

## Steps

### Step 1: Define bento grid CSS

Add to `apps/web/src/index.css`:

```css
.bento-grid {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: minmax(160px, auto);
}

.bento-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: border-color 0.15s ease;
}

.bento-card:hover {
  border-color: var(--fg3);
}

.bento-span-2 { grid-column: span 2; }
.bento-span-3 { grid-column: span 3; }
.bento-row-2 { grid-row: span 2; }

@media (max-width: 768px) {
  .bento-grid { grid-template-columns: 1fr; }
  .bento-span-2, .bento-span-3 { grid-column: span 1; }
  .bento-row-2 { grid-row: span 1; }
}

@media (min-width: 769px) and (max-width: 1024px) {
  .bento-grid { grid-template-columns: repeat(2, 1fr); }
  .bento-span-3 { grid-column: span 2; }
}
```

### Step 2: Rewrite dashboard hero section

Replace the welcome header:
```tsx
<FadeIn className="mb-8">
  <p className="text-[13px] font-medium" style={{ color: 'var(--fg3)' }}>
    {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
  </p>
  <h1 className="font-display text-3xl font-bold tracking-tight mt-1" style={{ color: 'var(--fg)' }}>
    Selamat datang, {profile?.full_name?.split(' ')[0] || 'User'}.
  </h1>
</FadeIn>
```

Key: just name + date. No role badge, no description paragraph. Typography does the work.

### Step 3: Build module bento cards

Each module card uses `StaggerItem` and has:
- Module accent dot (4px circle with module color)
- Module name (Inter, 13px, semibold, `--fg`)
- Expanded title (Inter, 11px, `--fg3`)
- 1-2 live stat lines (fetched from API, same as current)
- Bottom: action link (`→ Mulai sesi`)

```tsx
<StaggerList className="bento-grid">
  <StaggerItem>
    <Link to="/ketik" className="bento-card">
      <div>
        <div className="flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full" style={{ background: 'var(--module-ketik)' }} />
          <span className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>KETIK</span>
        </div>
        <p className="text-[11px]" style={{ color: 'var(--fg3)' }}>Kelas Etika & Trik Komunikasi</p>
        <p className="text-[20px] font-bold tracking-tight mt-4" style={{ color: 'var(--fg)' }}>
          {ketikStats?.totalSessions ?? '—'}
        </p>
        <p className="text-[11px]" style={{ color: 'var(--fg3)' }}>sesi total</p>
      </div>
      <span className="text-[12px] font-medium mt-4" style={{ color: 'var(--fg2)' }}>
        Mulai sesi →
      </span>
    </Link>
  </StaggerItem>
  {/* ... repeat for PDKT, Telefun, KTP, SIDAK */}
</StaggerList>
```

### Step 4: Build quick stats panel

A `bento-row-2` card on the right:
```tsx
<StaggerItem className="bento-row-2">
  <div className="bento-card h-full">
    <p className="text-[11px] font-bold uppercase tracking-[0.2em]"
       style={{ color: 'var(--fg3)' }}>Ringkasan</p>
    <div className="mt-4 space-y-4 flex-1">
      {stats.map(stat => (
        <div key={stat.label}>
          <p className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--fg)' }}>
            {stat.value}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--fg3)' }}>{stat.label}</p>
        </div>
      ))}
    </div>
  </div>
</StaggerItem>
```

### Step 5: Build SIDAK overview card with sparkline

The 2-column-wide SIDAK card:
```tsx
<StaggerItem className="bento-span-2">
  <Link to="/sidak/dashboard" className="bento-card">
    <div className="flex items-center gap-2 mb-3">
      <span className="h-2 w-2 rounded-full" style={{ background: 'var(--module-sidak)' }} />
      <span className="text-[13px] font-semibold" style={{ color: 'var(--fg)' }}>SIDAK</span>
    </div>
    {/* Reuse existing TrendPanel but compact */}
    <Suspense fallback={<div className="h-16" />}>
      <DashboardTrendPanel compact />
    </Suspense>
    <div className="flex gap-6 mt-4 text-[11px]" style={{ color: 'var(--fg3)' }}>
      <span>{totalDefects} temuan</span>
      <span>{auditedAgents} agen</span>
      <span>{activePeriods} periode</span>
    </div>
  </Link>
</StaggerItem>
```

### Step 6: Build recent activities card

Replace the current list:
```tsx
<StaggerItem>
  <div className="bento-card">
    <p className="text-[11px] font-bold uppercase tracking-[0.2em] mb-3"
       style={{ color: 'var(--fg3)' }}>Aktivitas Terbaru</p>
    <div className="space-y-3 flex-1">
      {recentActivities.map(a => (
        <div key={a.id} className="flex items-start gap-2">
          <span className="mt-1.5 h-1.5 w-1.5 rounded-full shrink-0"
                style={{ background: 'var(--fg3)' }} />
          <div>
            <p className="text-[12px] font-medium" style={{ color: 'var(--fg2)' }}>
              {normalizeActionText(a.action)}
            </p>
            <p className="text-[10px]" style={{ color: 'var(--fg3)' }}>
              {formatTimeAgo(a.created_at)}
            </p>
          </div>
        </div>
      ))}
    </div>
    <Link to="/dashboard/activities"
      className="text-[12px] font-medium mt-3 inline-block"
      style={{ color: 'var(--fg2)' }}>
      Lihat semua →
    </Link>
  </div>
</StaggerItem>
```

### Step 7: Final verification

```bash
pnpm build:web        # exit 0
pnpm test:targeted    # all pass
```

## Done Criteria

- [ ] `pnpm build:web` exits 0
- [ ] `pnpm test:targeted` exits 0
- [ ] Dashboard uses `bento-grid` layout on desktop (3-column)
- [ ] Responsive: 2-column on tablet, 1-column on mobile
- [ ] All module cards are clickable and navigate to correct routes
- [ ] No `backdrop-blur` or glass effects on dashboard cards
- [ ] Cards use `var(--surface)` background and `var(--border)` borders
- [ ] FadeIn/StaggerList motion primitives used for entrance
- [ ] `plans/README.md` status row updated

## STOP Conditions

- Plan 001 has not landed (design tokens unavailable).
- Plan 006 has not landed (motion primitives unavailable — but can be skipped by using inline motion).
- Existing data fetching logic breaks — the dashboard API calls must remain identical.
- `DashboardTrendPanel` (Recharts) fails to render in compact mode — may need a `compact` prop added.

## Maintenance Notes

- The bento grid is CSS-only — no JavaScript layout library needed.
- Module stats in the cards should come from the same API calls the current dashboard uses. Don't add new API endpoints.
- The `compact` prop for `DashboardTrendPanel` would make it render without axis labels and with a smaller height — this is the main integration point that might need custom work.
- If new modules are added, they appear as additional bento cards — the grid auto-flows.
