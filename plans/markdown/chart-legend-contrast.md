# Chart Legend Contrast

## Requirement

Lanjutan `chart-axis-contrast.md`: teks legenda grafik >= 4.5:1 di tema terang dan gelap. Legenda default Recharts mewarnai teks item dengan warna seri, sehingga warna irisan pie yang terang gagal sebagai teks.

## Design

- `ProfilerStatsPanel`: kedua `<Legend>` (pie tim dan gender) memakai `formatter` yang membungkus teks dengan `<span style={{ color: "var(--muted-foreground)" }}>`. Ikon tetap berwarna seri.
- `VoiceRadarChartInner`: `text-slate-600 dark:text-white/70` diganti `text-muted-foreground`. Ini hanya konsistensi token; tidak ada RED.
- `FatalDonutChart` tidak diubah: tidak diimpor route mana pun (hanya di-mock oleh tes jsdom lama), jadi kode mati, sama seperti `ServiceBarChart`.
- `findLowContrastText` mendapat opsi `leafOnly` (lewati elemen yang masih punya elemen anak), karena span item legenda Recharts yang berwarna seri membungkus span berwarna token.
- Scan legenda (`.recharts-legend-wrapper span`, `leafOnly`) ditambahkan ke tes kontras Profiler dan radar Telefun, dengan assertion bahwa legenda terlihat.

## Hasil

- RED (Profiler, terang): 2.57:1 "Tim Call" dan "Perempuan", 3.37:1 "Laki-laki". Gelap lolos.
- Legenda radar Telefun lolos di kedua tema pada kode lama (tanpa RED).
- GREEN: `profiler-workspace.spec.ts` dan `telefun-history.spec.ts` 34/34 lulus.
