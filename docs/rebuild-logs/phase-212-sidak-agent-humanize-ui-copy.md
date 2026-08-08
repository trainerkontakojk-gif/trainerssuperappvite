# Phase 212: Humanize UI Copy — SIDAK Agent Directory & Detail

**Status:** DONE
**Date:** 2026-08-08
**Tests:** 121 web tests passing (halaman agents + agents/$id subset), no regressions

## Summary

Penerapan humanize (port mini perilaku Humanizer humanizr/humanizer ke TS) pada halaman `/sidak/agents` (direktori) dan `/sidak/agents/$id` (detail agent): titleize nama/tim/batch, label status & trend Indonesia, sentence case di tombol/pill/badge, hapus UPPERCASE teriak, konsistensi "Agen" bukan "Agent".

## Files

### Source

| File | Change |
|------|--------|
| `apps/web/src/lib/humanize.ts` | **Baru** — port inti Humanizer: `titleize()`, `humanizeRiskStatus()`, `humanizeTrend()` |
| `apps/web/src/components/sidak/AgentCard.tsx` | Nama/tim/batch di-titleize; badge status → `Perlu Perhatian/Sesuai/Belum Diaudit`; trend → `Naik/Turun/Stabil/Belum Ada Tren` |
| `apps/web/src/routes/sidak/agents.tsx` | Breadcrumb `SIDAK · Daftar Agen`; `Cari agen...`; pill batch titleize + sentence case; `Muat N agen lagi`; `Reset filter`; hapus UPPERCASE tombol |
| `apps/web/src/components/sidak/EditTemuanModal.tsx` | `SESUAI/PERBAIKAN/TIDAK SESUAI/KRITIS` → sentence case; label & tombol tanpa UPPERCASE |
| `apps/web/src/components/sidak/TemuanGroupCard.tsx` | `Edit temuan`; label form, tombol, label nilai tanpa UPPERCASE |
| `apps/web/src/components/sidak/AgentTemuanTab.tsx` | `MEI 2026` → `Mei 2026` (titleize); badge kategori → `Kritis/Non-kritis`; label Ketidaksesuaian/Rekomendasi/Poin normal |
| `apps/web/src/components/sidak/AgentTrendTab.tsx` | Pill filter & label statistik tanpa UPPERCASE |
| `apps/web/src/components/sidak/RootCauseCard.tsx` | Badge `N pola / Utama / N kritis` normal |
| `apps/web/src/components/sidak/TopTicketsCard.tsx` | Judul & header kolom normal |
| `apps/web/src/components/sidak/AgentAuditDossier.tsx` | monthLabel, score label, badge `N pola` normal |
| `apps/web/src/components/sidak/AgentComparisonTable.tsx` | Header tabel normal |
| `apps/web/src/components/sidak/ContextControlBar.tsx` | `Trend` → `Tren`; pill layanan normal |
| `apps/web/src/components/sidak/MonthRail.tsx` | Label bulan normal |
| `apps/web/src/routes/sidak/agents.$id.tsx` | Nav tabs tanpa UPPERCASE |
| `apps/web/src/utils/exportAgentReport.ts` | `↻ Refresh` → `↻ Muat ulang` |

### Tests

| File | Tests | Coverage |
|------|-------|----------|
| `apps/web/src/__tests__/humanize.test.ts` | 3 (baru) | `titleize`, `humanizeRiskStatus`, `humanizeTrend` |
| `apps/web/src/__tests__/AgentCard.test.tsx` | 4 | Tim titleize `Telepon · Tim Call` |
| `apps/web/src/__tests__/sidak-agents-load-more-copy.test.tsx` | 2 | `Muat 6 agen lagi` |
| `apps/web/src/__tests__/sidak-agent-detail-temuan-parity.test.tsx` | 4 | `Mei 2026`, `Kritis/Non-kritis` |
| `apps/web/src/__tests__/exportAgentReport.test.ts` | — | `Muat ulang` di HTML export |

### Documentation

| File | Change |
|------|--------|
| `docs/SIDAK_SCORING_GUARDRAILS.md` | `Tampilkan Data Keseluruhan` → `Tampilkan semua data`; `INPUT AUDIT` → `Input Audit` |
| `docs/SIDAK_LOGIC_AND_SCORING.md` | `Refresh` → `Muat ulang` |
| `docs/feature-agent-detail-export-csv-md-html.md` | `UNDUH LAPORAN` → `Unduh Laporan`; `INPUT AUDIT` → `Input Audit` |
| `docs/superpowers/specs/2026-07-16-sidak-agent-report-html-variants-design.md` | Section names sinkron label live (`Ringkasan Skor Bulanan`, `Perkembangan Skor`, `Riwayat Temuan`) |

## Key Decisions

- **Port mini, bukan full Humanizer**: humanizr/humanizer adalah .NET — tidak ada versi npm. Diport manual: `titleize` + mapping label status/trend. Belum termasuk Pluralize, DateTime.Humanize, Number.ToWords, Truncate, Dehumanize.
- **Dua "Humanizer" berbeda**: humanizr (pemformat data, dipakai sebagai acuan) vs blader/humanizer (penghilang jejak AI di prosa — disimpan sebagai referensi skill, bukan untuk label UI).
- **Eyebrow/breadcrumb label tetap UPPERCASE**: `SIDAK · Profil Agen`, `Tahun 2026 • Layanan CALL` — gaya header, konsisten kedua halaman.
- **Data teknis uppercase dibiarkan**: no. tiket, `AUDIT INTERNAL`, initial avatar.
- **Rebuild log lama tidak diedit** (`phase-29-sidak-agent-directory-load-more-copy.md` menyebut `Muat ... Agent Lagi` — historis, dibiarkan).
