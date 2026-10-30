# TNA — perbaikan audit Impeccable 2026-10-30

- **Status:** disetujui Fajar 2026-10-30 ("jalankan rekomendasi sekaligus").
- **Risk lane:** **Lane C** — perubahan tampilan lintas file, termasuk dua komponen bersama (`QaStatePanel`, breadcrumb `AppHeader`) dan token warna baru. Tanpa schema, API, auth, atau perubahan kontrak.
- **Sumber:** audit Impeccable TNA 2026-10-30 (16/20): 10 layar × 1440/390 px × terang/gelap, axe WCAG 2.1 AA, `findTargetsBelow` 44 px.

## Requirement

1. **P1 kontras.** Deskripsi `QaStatePanel` memenuhi 4,5:1 di tema terang. Saat ini `text-muted-foreground` + `opacity-90` di atas `bg-muted/35` = 3,88:1 pada `/tna`.
2. **P2 target sentuh 44 px di 390 px:**
   - link breadcrumb `AppHeader` (TNA 28×20 px, EFEK 32×20 px);
   - link program "Rincian <sesi>" di tabel sesi `/tna/efek` (33–35 px lebar);
   - tombol urut header tabel peserta `/tna/efek/program/$code` (32 px tinggi).
3. **P2 filter EFEK di HP.** Di 390 px, filter tidak lagi bertumpuk satu kolom; dropdown tampil dua per baris sehingga hasil lebih cepat terlihat.
4. **P3 pesan ganda.** "Belum ada periode pembanding" tampil sekali di detail parameter.
5. **P3 token status.** Warna naik/peringatan EFEK memakai token tema `success`/`warning`, bukan palet Tailwind langsung, dengan tampilan yang sama.

Tidak termasuk: 24 pemakaian `emerald`/`amber` di luar TNA (tindak lanjut terpisah), perubahan copy lain, perubahan perilaku data.

## Design

- **QaStatePanel** (`src/components/ui/QaStatePanel.tsx`): hapus `opacity-90` dari deskripsi. Warna mengikuti `tone`; `--fg3` (#707070) di atas `--bg` lolos AA. Efeknya hanya menaikkan kontras di 25 pemakai.
- **Breadcrumb** (`src/components/layout/AppHeader.tsx`): di bawah `lg` link menjadi `flex` 44×44 px minimum dengan margin negatif agar posisi teks tetap, kecuali crumb pertama (tanpa margin kiri) supaya tidak menimpa tombol menu; label dibungkus `<span class="truncate">` supaya pemotongan tetap jalan. Desktop tidak berubah.
- **Tabel EFEK**: link program sesi mendapat `min-w-[44px]`; tombol urut `max-sm:min-h-[44px]` (desktop tetap 32 px agar tabel padat).
- **Filter EFEK** (`efek-report-ui.tsx`): grid `grid-cols-2 lg:grid-cols-4`; label APPK `max-sm:col-span-2`. `selectClass` sudah `min-w-0`, jadi opsi panjang tidak meluap.
- **Parameter** (`parameter.tsx`): bagian "Periode pembanding" (judul + isi) disembunyikan hanya bila tidak ada periode pembanding **dan** `trendStatus` = `no_comparison_data`, karena hanya saat itu baris tren di atasnya sudah menyebut ketiadaannya. Pada `period_in_progress`/`no_current_audit` bagian itu tetap tampil (temuan review thermo-nuclear).
- **Token** (`src/index.css`, `docs/design.md`): `--success` (terang #047857 / gelap #34d399) dan `--warning` (terang #b45309 / gelap #fbbf24) = nilai emerald-700/400 dan amber-700/400 yang sedang dipakai, dipetakan ke `--color-success`/`--color-warning`. Dipakai di `efek-report-ui.tsx` dan `efek-report-format.ts`.

## Tasklist

- [x] T1 RED: E2E di `tna-flow.spec.ts` dan `tna-efek.spec.ts` (fixture EFEK hanya ada di sana) — axe `/tna` terang 0 pelanggaran; target ≥44 px di 390 px pada `/tna/efek`, `/tna/efek/program/ketik`, `/tna/efek/sesi/baru`; dua dropdown filter pertama satu baris di 390 px; teks "Belum ada periode pembanding" tepat satu di detail parameter, juga saat periode berjalan; crumb pertama tidak menimpa tombol menu.
- [x] T2 GREEN: implementasi Design.
- [x] T3 Refactor: token `success`/`warning` + docs.
- [x] T4 Verifikasi: spec baru + spec TNA terkait, web typecheck, `git diff --check`, screenshot ulang, `thermo-nuclear`, audit Impeccable ulang.
