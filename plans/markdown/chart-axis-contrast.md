# Chart Axis Contrast

## Requirement

`docs/design.md`: warna teks berasal dari token; `fg3` / `--muted-foreground` untuk meta non-kritis dan lolos 4.5:1 di kedua tema. Kenyataannya teks sumbu grafik Recharts diredupkan dengan `opacity` atau warna abu-abu keras, sehingga gagal WCAG 4.5:1 untuk teks kecil:

- `DashboardTrendPanel`: tick sumbu X/Y `fill: currentColor` + `opacity: 0.4`.
- `ParamTrendChart`: tick sumbu X/Y `fill: currentColor` + `opacity: 0.75`.
- `ServiceBarChart`: tick sumbu Y `fill: currentColor` + `opacity={0.6}` pada sumbu.
- `VoiceRadarChartInner`: label sudut `#64748b`, tick radius `#94a3b8` (slate-400).

Acceptance: semua teks sumbu grafik di atas >= 4.5:1 pada tema terang dan gelap, diukur di browser dengan opasitas leluhur ikut dihitung.

Di luar scope: data, warna seri, layout, dan ukuran font grafik.

## Design

- Teks tick memakai `fill: "var(--muted-foreground)"` tanpa `opacity` (terang `--fg3` #707070, gelap `--fg2` #a3a3a3). Ukuran font tidak diubah (>= 11px).
- `ServiceBarChart`: `opacity` pada `<YAxis>` dihapus. Garis sumbu sudah `axisLine={false}`/`tickLine={false}`, jadi tidak ada garis yang perlu diredupkan.
- Helper E2E baru `e2e/helpers/textContrast.ts` (`findLowContrastText`, `setDocumentTheme`): menghitung warna teks efektif (fill/color x alfa x opacity seluruh leluhur), dicampur di atas latar `background-color` terdekat, lalu rasio WCAG. `setDocumentTheme` menunggu transisi CSS selesai supaya warna tidak dibaca di tengah transisi.

## Tasklist

- [x] RED: tiga tes hermetic memindai grafik pada tema terang dan gelap.
- [x] GREEN: token `--muted-foreground` di empat komponen grafik.
- [x] Typecheck, lint, build, `git diff --check`, `impeccable detect`.

## Hasil

- Dashboard trend (`dashboard-trend-forecast.spec.ts`): RED terang 2.68:1 dan gelap 3.72:1 pada seluruh tick X ("Jan 26", "Feb 26", "Mar 26") dan Y (0-20).
- Radar Telefun (`telefun-history.spec.ts`, tab Penilaian): RED terang 2.56:1 pada tick radius (0-100); gelap 3.75:1 pada label sudut (Speaking Rate, Intonation, Articulation, Fillers, Tone).
- SIDAK `ParamTrendChart` (`sidak-dashboard-insights.spec.ts`): tidak gagal pada kode lama. `opacity: 0.75` masih >= 4.5:1 di kedua tema (hanya terlihat 2.87:1 saat transisi tema belum selesai, yang sudah ditangani di helper). Diganti ke token demi konsistensi.
- `ServiceBarChart` tidak dirender di halaman mana pun (tidak ada import di luar file-nya), jadi tidak ada flow E2E yang bisa memindainya. Perbaikannya sama dan tidak terverifikasi E2E.
- GREEN: ketiga tes baru lulus; `dashboard-trend-forecast`, `sidak-dashboard-insights`, `telefun-history` 31/31 lulus.

## Lanjutan: Profiler (panel Statistik)

Requirement: teks sumbu dan label irisan pie di `ProfilerStatsPanel` (`/profiler?batch=...&view=statistik`) >= 4.5:1 di kedua tema.

Design:

- Empat sumbu bar chart (jabatan X/Y, pendidikan X/Y) memakai `tick.fill = var(--muted-foreground)`; ukuran font tidak diubah. Sebelumnya tick memakai default Recharts `#666`.
- Label irisan pie gender berupa fungsi yang merender `<text>` dengan `fill: var(--muted-foreground)`. Sebelumnya fill label mengikuti warna irisan. Warna irisan dan garis label tidak diubah.
- Teks legenda (HTML) tidak diubah. Perhatian: warnanya bisa mengikuti warna seri, jadi berisiko sama dengan label pie lama; belum dipindai.
- Tes baru di `profiler-workspace.spec.ts` dengan fixture `PESERTA_STATISTIK` (turunan `PESERTA_LENGKAP` plus gender, pendidikan, dua jabatan).

Hasil:

- RED: terang 2.57:1 "Perempuan 50%" dan 3.37:1 "Laki-laki 50%" (label pie); gelap 3.12:1 pada seluruh tick sumbu (angka 0-4, "agent", "leader", "S1", "D3"). Tick sumbu terang lolos pada `#666`.
- GREEN: `profiler-workspace.spec.ts` 20/20 lulus.
