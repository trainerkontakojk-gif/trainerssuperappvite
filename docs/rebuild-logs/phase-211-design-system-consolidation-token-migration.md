# Phase 211 — Design System Consolidation & Legacy Palette Token Migration

**Date:** 2026-08-01
**Phase:** 211
**Type:** Docs consolidation + UI token migration (kosmetik, zero behavior change)

## Problem

1. **Dua source of truth design yang berbeda isi** — `DESIGN.md` (root, 161 baris) dan `docs/design.md` (121 baris) memiliki struktur dan konten kontradiktif: `DESIGN.md` memakai palette Tailwind lama (blue-600, gray scale, Inter untuk heading) sementara `docs/design.md` (yang dirujuk AGENTS.md §10) memakai CSS variables (`--bg/--surface/--border/--fg/--fg2/--fg3/--inv-bg/--inv-fg`) + Outfit/Inter. Skill `ui-ux-pro-max`/`impeccable` menunjuk `DESIGN.md`; AGENTS.md menunjuk `docs/design.md`. Kontradiksi ini berisiko redesign cycle (dilarang AGENTS.md §10).
2. **719 instance class palette lama** (`gray-*`, `red-*`, `amber-*`, `blue-*`, `sky-*`, `green-*`) bypass token di ~100 file — warna fixed tidak adaptif dark mode (dark adalah default app via `ThemeToggle` + `.dark` variant).
3. **Class Tailwind invalid** (`text-red-650`, `text-amber-650`, `bg-red-550`) — skala Tailwind hanya 50–950; class mati → error text tidak berwarna (styling senyap hilang).
4. **Klaim stale di AGENTS.md** — "Hooks auto-run setelah edit file UI" (hook impeccable model Claude/Codex/Cursor/Copilot tidak didukung Pi; tidak ada manifest hook terpasang di repo).

## Solution

### Konsolidasi dokumentasi design
- `docs/design.md` menjadi **satu-satunya kanonik** (merger: konten CSS-vars asli + konten unik DESIGN.md — Product Type, Design Principles, Anti-Patterns absolute bans, Komponen Tabel/Form/Modal, z-index scale, aturan tipografi/layout). Konflik diselesaikan: palette Tailwind lama dibuang, klaim stale `.codex/hooks.json` dihapus.
- `DESIGN.md` (root) menjadi **pointer file** (+ ringkasan singkat) — tetap kompatibel dengan `context.mjs` skill Impeccable full yang mencari `DESIGN.md` di root.
- Referensi skill `ui-ux-pro-max` diarahkan ke `docs/design.md`.
- AGENTS.md: klaim hooks diganti menjadi "hooks TIDAK aktif di harness Pi; audit dijalankan eksplisit".

### Migrasi legacy palette → tokens (quick win, 3 file hotspot)
Mapping: `text-gray-900→text-fg`, `text-gray-500→text-fg2`, `text-gray-400/-300→text-fg3`, `bg-gray-100→bg-surface`, `bg-gray-200→bg-border` (waveform bars/track), `bg-gray-50→bg-surface-sunken` (inset) / `bg-bg` (page), `border-gray-*→border-border`, `bg-white→bg-surface` (cards/inputs — bug dark-mode sejenis), `focus:border|ring-indigo-500→focus:border|ring-fg` (sesuai docs/design.md §5: focus state = `var(--fg)`).

| File | Instance | Keterangan |
|---|---|---|
| `routes/telefun/replay.tsx` | 38 | audio player, waveform, annotation panel |
| `routes/account.tsx` | 23 | profile settings page |
| `routes/reset-password.tsx` | 22 | standalone page (light-only → kini theme-aware) |

### Fix class invalid (dead classes)
- `SidakInputImportPanel.tsx`: `text-red-650` ×2 → `text-red-600` (error count + label kini benar-benar merah)
- `SidakInputManualForm.tsx`: `hover:bg-red-550/10` → `hover:bg-red-500/10`
- `routes/sidak/input.tsx`: `text-red-650` → `text-red-600` (error banner)
- `routes/sidak/settings/components/PublishRulePanel.tsx`: `text-amber-650` → `text-amber-600`

## Files

- `docs/design.md` (kanonik, merger), `DESIGN.md` (pointer), `AGENTS.md` (klaim hooks + aturan efisiensi orchestrator), 7 file UI (`replay.tsx`, `account.tsx`, `reset-password.tsx`, 4 file SIDAK), skill pi di luar repo (`orchestrator-mode`, `trainers-superapp-tdd`, `context7`, `impeccable`, `ui-ux-pro-max`).

## Verification

- `pnpm --filter @trainers/web exec tsc --noEmit`: exit 0
- Vitest focused (`reset-password-validation`, `account-api`, `telefun-replay-annotation-helpers`): 28/28 passed
- `git diff --check`: bersih
- Grep ulang: 0 sisa `gray-*` di 3 file termigrasi; 0 class invalid di seluruh `apps/web/src`

## Scope notes (P3, sengaja belum disentuh)

- `bg-indigo-600` + `text-white` tombol/akcent tetap (visible di kedua mode, bukan token) — masuk migrasi semantic color berikutnya.
- `hover:border-indigo-200`/`hover:bg-indigo-50/30` di replay.tsx tetap (akcent interaktif).
- Sisa ~620 instance legacy di ~90 file (hotspot berikutnya: `ReplayAnnotator.tsx` 37, `PhoneInterface.tsx` 29, `pdkt/HistoryModal.tsx` 26, `dashboard.tsx` 21).
- Hex di `exportAgentReport.ts`/`agentReportHtml.ts` = dokumen HTML export standalone (light-only) — exception yang sah, perlu dicatat eksplisit.
