# Feature Request — Agent Detail Export: CSV / MD / HTML

## Status

✅ **IMPLEMENTED** — CSV, Markdown, HTML Statis, dan HTML Interaktif.

---

## Latar Belakang

Halaman `/sidak/agents/$id` saat ini memiliki tombol **"UNDUH LAPORAN"** di `AgentProfileBar` yang memicu `handleExport()` di `useAgentDetail.ts`.

**Masalah:** Export saat ini hanya:
- Format **XLSX** (Excel) via library `xlsx`
- Data **sangat minim** — hanya nama, tim, batch, jabatan, tahun + tabel ringkasan skor per bulan (finalScore, ncScore, crScore, sessionCount, findingsCount)
- **Tidak menyertakan:** daftar temuan detail, root causes, top tickets, trend data, comparison table

## Permintaan

Mekanisme export tersedia melalui dropdown **4 format**:

### 1. CSV
- Delimiter koma (`,`) atau semicolon (`;`)
- Header: semua kolom data agent
- Cocok untuk dibuka di Excel / Google Sheets / tools data

### 2. MD (Markdown)
- Tabel Markdown yang rapi
- Bisa langsung dipakai di dokumentasi atau commit message
- Struktur: profil → ringkasan skor → detail temuan → top tickets → root causes

### 3. HTML Statis / 4. HTML Interaktif
- Snapshot dari shell halaman live saat ini: header, profile identity + action affordances, quickview, context, tabs, MonthRail, dossier, trend, benchmark, dan findings.
- Action affordances export dirender sebagai elemen visual non-focusable; `INPUT AUDIT` hanya muncul saat konteks staff/role memang visible di layar live.
- MonthRail pada export hanya snapshot state terpilih; bukan disclosure interaktif.
- Kedua varian memakai markup/CSS dan dataset yang sama; interaktif menambahkan anchor tabs, filter trend, dan tiket root cause.
- Snapshot parity targets the AgentDetailPage content surfaces in light mode; global application chrome (sidebar, global header, route shell) is intentionally excluded from the standalone file. This is a structural/visual parity target, not a claim of exact pixel identity across browsers.
- Live trend first paint intentionally renders all available series. This supersedes the stale static top-five-only behavior: static/interactive exports keep the same visible first paint while adding a visually hidden complete semantic trend table for offline/accessibility fidelity.
- Clone layout, warna, spacing, font, card style dari halaman AgentDetailPage
- Harus self-contained (inline CSS, no external deps kecuali Google Fonts)
- Mode: **light mode** (mengikuti tema aplikasi saat ini)

## Spesifikasi Teknis

### Data yang Harus Ada di Semua Format

| Data | Sumber |
|------|--------|
| Profil agent (nama, tim, batch, jabatan) | `data.peserta` |
| Ringkasan skor per bulan | `monthlySummaries` |
| Detail temuan (indikator, nilai, ketidaksesuaian, sebaiknya) | `temuanDisplayItems` |
| Top tickets (deduksi terbesar) | `topTickets` |
| Root causes analysis | `activeRootCauses` |
| Trend score (jika ada) | `data.personalTrend` |
| Comparison table | `data.comparisonTable` |

### Arsitektur

**Client-side only** — semua data sudah tersedia dari response `/sidak/agents/:id` yang di-fetch oleh `useApi<AgentDetailData>`.

### File yang Akan Diubah

| File | Perubahan |
|------|-----------|
| `apps/web/src/hooks/useAgentDetail.ts` | `handleExport` menerima format CSV/MD/HTML dan snapshot context ringan |
| `apps/web/src/components/sidak/AgentProfileBar.tsx` | Dropdown format export |
| `apps/web/src/utils/exportAgentReport.ts` | **(BARU)** Utility functions: `generateCSV()`, `generateMD()`, `generateHTML()` |

### HTML Export — Persyaratan Visual

- **Light mode** persis seperti tampilan web saat ini
- Semua section: ProfileBar, Score Cards, MonthRail, AuditDossier, TrendChart, ComparisonTable, TemuanTab
- Font: Outfit (headings) + Inter (body) — mengikuti UI live saat ini
- Color scheme: same Tailwind CSS light mode colors (`bg-surface`, `bg-background`, `border-border`, dll.)
- Cards dengan rounded-2xl + border
- Inline CSS, satu file HTML self-contained. The intentionally embedded CSS keeps offline snapshots dependency-free; a bounded CSS/template extraction remains a follow-up if the generator grows further.
- ukuran cetak / print-friendly (opsional)

### Prioritas

1. Implementasi dropdown + CSV + MD (cepat, text-based)
2. HTML layout cloning (lebih kompleks, butuh inspect DOM lebih dalam)

## Referensi

- `useAgentDetail.ts` — current `handleExport` (line 443-475)
- `AgentProfileBar.tsx` — tombol Unduh Laporan (line 81-87)
- `AgentDetailData` type di `packages/types/src/sidak.ts` (line 472-506)
