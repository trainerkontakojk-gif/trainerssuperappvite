# Feature Request — Agent Detail Export: CSV / MD / HTML

## Status

📝 **DIUSULKAN** — belum diimplementasi.

---

## Latar Belakang

Halaman `/sidak/agents/$id` saat ini memiliki tombol **"UNDUH LAPORAN"** di `AgentProfileBar` yang memicu `handleExport()` di `useAgentDetail.ts`.

**Masalah:** Export saat ini hanya:
- Format **XLSX** (Excel) via library `xlsx`
- Data **sangat minim** — hanya nama, tim, batch, jabatan, tahun + tabel ringkasan skor per bulan (finalScore, ncScore, crScore, sessionCount, findingsCount)
- **Tidak menyertakan:** daftar temuan detail, root causes, top tickets, trend data, comparison table

## Permintaan

Ganti mekanisme export dengan **dropdown 3 format**:

### 1. CSV
- Delimiter koma (`,`) atau semicolon (`;`)
- Header: semua kolom data agent
- Cocok untuk dibuka di Excel / Google Sheets / tools data

### 2. MD (Markdown)
- Tabel Markdown yang rapi
- Bisa langsung dipakai di dokumentasi atau commit message
- Struktur: profil → ringkasan skor → detail temuan → top tickets → root causes

### 3. HTML
- **WAJIB: identik persis dengan tampilan UI sekarang di light mode**
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
| `apps/web/src/hooks/useAgentDetail.ts` | Ubah `handleExport` (XLSX-only) → `handleExport(format: 'csv'\|'md'\|'html')` |
| `apps/web/src/components/sidak/AgentProfileBar.tsx` | Ganti tombol tunggal → dropdown button dengan 3 opsi |
| `apps/web/src/utils/exportAgentReport.ts` | **(BARU)** Utility functions: `generateCSV()`, `generateMD()`, `generateHTML()` |

### HTML Export — Persyaratan Visual

- **Light mode** persis seperti tampilan web saat ini
- Semua section: ProfileBar, Score Cards, MonthRail, AuditDossier, TrendChart, ComparisonTable, TemuanTab
- Font: Outfit (headings) + system font (body) — sama seperti sekarang
- Color scheme: same Tailwind CSS light mode colors (`bg-surface`, `bg-background`, `border-border`, dll.)
- Cards dengan rounded-2xl + border
- Inline CSS, satu file HTML self-contained
- ukuran cetak / print-friendly (opsional)

### Prioritas

1. Implementasi dropdown + CSV + MD (cepat, text-based)
2. HTML layout cloning (lebih kompleks, butuh inspect DOM lebih dalam)

## Referensi

- `useAgentDetail.ts` — current `handleExport` (line 443-475)
- `AgentProfileBar.tsx` — tombol Unduh Laporan (line 81-87)
- `AgentDetailData` type di `packages/types/src/sidak.ts` (line 472-506)
