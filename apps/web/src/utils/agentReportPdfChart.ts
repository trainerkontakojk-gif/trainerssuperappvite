/** Grafik garis vektor untuk PDF laporan agen. Dipecah dari `agentReportPdf.ts`. */

import { formatNumber, type TrendSeries } from "./agentReportModel";
import {
  FONT,
  INK,
  INK_MUTE,
  LINE,
  TONE_WARN,
  line,
} from "./agentReportPdfTheme";
import { pdfSafeText } from "./agentReportPdfText";
import { PdfDocument } from "./agentReportPdfLayout";

// ---------------------------------------------------------------------------
// Grafik
// ---------------------------------------------------------------------------

export interface PdfChart {
  x: number;
  width: number;
  title: string;
  unit?: string;
  labels: string[];
  series: TrendSeries;
  axis: { min: number; max: number; step: number };
  target?: number;
  plotHeight: number;
}

export function chartHeight(chart: PdfChart): number {
  return (
    line(9) + (chart.unit ? line(6.5) : 0) + chart.plotHeight + line(6.5) + 2
  );
}

/**
 * Grafik garis satu seri di kolom `x`/`width`: judul, angka sumbu, garis target
 * putus-putus (skor), label periode yang tidak saling menimpa, dan nilai di
 * atas titik bila jaraknya cukup. Mengembalikan tepi bawahnya.
 */
export function drawChart(
  pdf: PdfDocument,
  chart: PdfChart,
  top: number,
): number {
  const { labels, series, axis } = chart;
  const doc = pdf.doc;
  doc.setFont(FONT, "bold");
  doc.setFontSize(9);
  doc.setTextColor(INK[0], INK[1], INK[2]);
  doc.text(pdfSafeText(chart.title), chart.x, top, { baseline: "top" });
  let cursor = top + line(9);
  if (chart.unit) {
    doc.setFontSize(6.5);
    doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
    doc.text(pdfSafeText(chart.unit), chart.x, cursor, { baseline: "top" });
    cursor += line(6.5);
  }

  const axisWidth = 8;
  const plotLeft = chart.x + axisWidth;
  const plotWidth = chart.width - axisWidth - 3;
  const plotTop = cursor + 1.5;
  const span = Math.max(1, axis.max - axis.min);
  const yFor = (value: number) =>
    plotTop +
    chart.plotHeight -
    ((Math.min(axis.max, Math.max(axis.min, value)) - axis.min) / span) *
      chart.plotHeight;
  // Titik ujung diberi jarak dari tepi plot supaya label nilainya tidak
  // menabrak angka sumbu Y.
  const inset = Math.min(4, plotWidth / 10);
  const xFor = (index: number) =>
    labels.length === 1
      ? plotLeft + plotWidth / 2
      : plotLeft +
        inset +
        (index / (labels.length - 1)) * (plotWidth - inset * 2);

  for (let value = axis.min; value <= axis.max + 0.0001; value += axis.step) {
    const y = yFor(value);
    doc.setDrawColor(LINE[0], LINE[1], LINE[2]);
    doc.setLineWidth(0.15);
    doc.line(plotLeft, y, plotLeft + plotWidth, y);
    doc.setFont(FONT, "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
    doc.text(formatNumber(value), plotLeft - 1.5, y, {
      align: "right",
      baseline: "middle",
    });
  }

  if (chart.target !== undefined) {
    const y = yFor(chart.target);
    doc.setDrawColor(TONE_WARN[0], TONE_WARN[1], TONE_WARN[2]);
    doc.setLineWidth(0.35);
    doc.setLineDashPattern([1.5, 1], 0);
    doc.line(plotLeft, y, plotLeft + plotWidth, y);
    // Keterangan target sejajar judul, di luar area plot: tidak pernah
    // menimpa titik data yang dekat dengan target.
    const legendRight = chart.x + chart.width;
    doc.line(legendRight - 17, top + 1.6, legendRight - 12, top + 1.6);
    doc.setLineDashPattern([], 0);
    doc.setFont(FONT, "bold");
    doc.setFontSize(6);
    doc.setTextColor(TONE_WARN[0], TONE_WARN[1], TONE_WARN[2]);
    doc.text(`Target ${chart.target}`, legendRight, top + 0.3, {
      align: "right",
      baseline: "top",
    });
  }

  // Label periode: hanya yang tidak akan saling menimpa; ujung selalu dicetak.
  const widths = labels.map((item) =>
    pdf.measure(pdfSafeText(item), "normal", 6.5),
  );
  const spacing =
    labels.length > 1
      ? (plotWidth - inset * 2) / (labels.length - 1)
      : plotWidth;
  const stride = Math.max(
    1,
    Math.ceil((Math.max(0, ...widths) + 2) / Math.max(spacing, 0.01)),
  );
  const lastIndex = labels.length - 1;
  labels.forEach((item, index) => {
    const isEdge = index === 0 || index === lastIndex;
    if (!isEdge && index % stride !== 0) return;
    if (!isEdge && lastIndex - index < stride * 0.7) return;
    // Ujung kiri/kanan rata ke tepi plot supaya tidak keluar dari kolomnya.
    const align =
      labels.length === 1
        ? "center"
        : index === 0 && inset < 3
          ? "left"
          : index === lastIndex && inset < 3
            ? "right"
            : "center";
    doc.setFont(FONT, "normal");
    doc.setFontSize(6.5);
    doc.setTextColor(INK_MUTE[0], INK_MUTE[1], INK_MUTE[2]);
    doc.text(pdfSafeText(item), xFor(index), plotTop + chart.plotHeight + 1.5, {
      align,
      baseline: "top",
    });
  });

  doc.setDrawColor(INK[0], INK[1], INK[2]);
  doc.setLineWidth(0.5);
  for (let position = 1; position < labels.length; position += 1) {
    const previous = series.data[position - 1];
    const value = series.data[position];
    if (previous == null || value == null) continue;
    doc.line(xFor(position - 1), yFor(previous), xFor(position), yFor(value));
  }
  const showValues = spacing >= 7;
  series.data.forEach((value, position) => {
    if (value == null) return;
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(0.25);
    doc.circle(xFor(position), yFor(value), 0.8, "FD");
    if (!showValues) return;
    const nearTop = yFor(value) <= plotTop + 2.5;
    doc.setFont(FONT, "bold");
    doc.setFontSize(6.5);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(
      formatNumber(value),
      xFor(position),
      yFor(value) + (nearTop ? 1.3 : -1.3),
      { align: "center", baseline: nearTop ? "top" : "bottom" },
    );
  });
  return plotTop + chart.plotHeight + line(6.5) + 2;
}
