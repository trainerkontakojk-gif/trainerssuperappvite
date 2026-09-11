# Feature Request — Agent Detail Export: CSV / MD / HTML

## Status

✅ **IMPLEMENTED** — CSV, Markdown, HTML Statis, dan HTML Interaktif.

---

## Latar Belakang

Halaman `/sidak/agents/$id` memiliki header ringkas dengan tombol **"Unduh Laporan"** di `AgentProfileBar` yang memicu `handleExport()` di `useAgentDetail.ts`.

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
- Snapshot dari shell halaman live saat ini: header, profile identity + action affordances, context, tiga tab audit, quickview pada Ringkasan, MonthRail, dossier, trend, benchmark, dan findings.
- Action affordances export dirender sebagai elemen visual non-focusable; `Input Audit` hanya muncul saat konteks staff/role memang visible di layar live.
- MonthRail pada export hanya snapshot state terpilih; bukan disclosure interaktif.
- Kedua varian memakai markup/CSS dan dataset yang sama; HTML interaktif menambahkan tab audit dengan Ringkasan sebagai default, filter tren, dan disclosure tiket/root cause.
- Snapshot konteks export hanya memuat tahun/layanan dan perpindahan profil; rentang bulan ditampilkan bersama bagian Tren agar konteksnya tetap lokal pada panel tersebut.
- HTML interaktif hanya menampilkan satu panel audit pada satu waktu. HTML statis membuka seluruh panel audit agar lengkap saat dibaca atau dicetak. Riwayat simulasi tidak termasuk ekspor audit.
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

### File yang Diubah

| File | Perubahan |
|------|-----------|
| `apps/web/src/hooks/useAgentDetail.ts` | `handleExport` menerima format CSV/MD/HTML dan snapshot context ringan |
| `apps/web/src/components/sidak/AgentProfileBar.tsx` | Header identitas ringkas dan dropdown format export |
| `apps/web/src/components/sidak/SidakAgentDetailTabs.tsx` | Tab presentation `summary`, `trend`, `temuan`, `simulations` dan mounted panel state |
| `apps/web/src/components/sidak/ContextControlBar.tsx` | Filter konteks audit, rentang tren, dan perpindahan profil |
| `apps/web/src/utils/exportAgentReport.ts` | Utility `generateCSV()`, `generateMD()`, dan `generateHTML()` |

### HTML Export — Persyaratan Visual

- **Light mode** mengikuti token tampilan web saat ini
- Semua section audit: header/profile, quickview, MonthRail, AuditDossier, TrendChart, ComparisonTable, dan TemuanTab
- Font: Outfit (headings) + Inter (body) — mengikuti UI live saat ini
- Color scheme: same Tailwind CSS light mode colors (`bg-surface`, `bg-background`, `border-border`, dll.)
- Panel dengan radius 12–16px dan border
- Inline CSS, satu file HTML self-contained. The intentionally embedded CSS keeps offline snapshots dependency-free; a bounded CSS/template extraction remains a follow-up if the generator grows further.
- ukuran cetak / print-friendly (opsional)

### Prioritas

1. Implementasi dropdown + CSV + MD (cepat, text-based)
2. HTML layout cloning (lebih kompleks, butuh inspect DOM lebih dalam)

## Referensi

- `useAgentDetail.ts` — current `handleExport` (line 443-475)
- `AgentProfileBar.tsx` — tombol Unduh Laporan (line 81-87)
- `AgentDetailData` type di `packages/types/src/sidak.ts` (line 472-506)

## Perilaku Presentation Agent Detail

- Shell halaman memakai satu `max-w-7xl` dengan padding responsif 16/24/32px.
- Header memiliki satu H1 nama agen, avatar shadcn/ui 96px pada mobile dan 112px mulai `sm`, metadata yang dapat membungkus, dan aksi minimum 44px.
- Surface dan kontrol detail agen memakai primitive shadcn/ui yang dipasang melalui konfigurasi workspace: Avatar, Button, Badge, Card, Dialog, DropdownMenu, Progress, Select, Skeleton, Table, Tabs, Textarea, dan Empty sesuai konteks. Token tema aplikasi tetap mengatur warna, tipografi, dan radius.
- Tab live memiliki empat pilihan: **Ringkasan**, **Tren**, **Temuan**, dan **Simulasi**. Hanya panel aktif terlihat; panel yang sudah dibuka tetap mounted agar state lokal seperti disclosure dan filter grafik terpelihara.
- Tahun dan layanan berlaku untuk tiga panel audit. Rentang bulan hanya muncul pada Tren. Filter serta riwayat Simulasi tetap independen dari konteks audit.
- Quickview berada di panel Ringkasan dan menampilkan scope tahun + layanan. Tabel pembanding berada di permukaan Tren.
- MonthRail menandai setiap skor QA di bawah 95 persen dengan ikon peringatan kecil dan legenda target; indikator ini tetap tersedia pada snapshot HTML.
- Detail Riwayat Simulasi memakai modal lebar responsif dengan judul yang dapat membungkus dan area isi yang menggulir di dalam batas tinggi viewport.
