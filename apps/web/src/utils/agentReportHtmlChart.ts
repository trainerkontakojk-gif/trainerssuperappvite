/**
 * Escaping and inline SVG line charts for the SIDAK agent HTML report.
 */

import { formatNumber, type TrendSeries } from "./agentReportModel";

/** Escapes text for HTML content and attribute values. */
export function escHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

interface ChartGeometry {
  width: number;
  height: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export const MINI_CHART: ChartGeometry = {
  width: 320,
  height: 210,
  left: 40,
  right: 14,
  top: 28,
  bottom: 28,
};

export const WIDE_CHART: ChartGeometry = {
  width: 960,
  height: 280,
  left: 56,
  right: 24,
  top: 32,
  bottom: 36,
};

interface ChartSpec {
  title: string;
  accessibleName: string;
  unit: string;
  figure: string;
  labels: string[];
  series: TrendSeries;
  axis: { min: number; max: number; step: number };
  target?: number;
  geometry: ChartGeometry;
  wide?: boolean;
}

/**
 * Satu grafik garis satu seri: kisi + angka sumbu, label periode, nilai di atas
 * tiap titik, dan (untuk skor) garis target putus-putus. Semua angka tetap
 * `<text>`, jadi bisa dicari di dokumen.
 */
function buildChartSvg(spec: ChartSpec): string {
  const g = spec.geometry;
  const plotWidth = g.width - g.left - g.right;
  const plotHeight = g.height - g.top - g.bottom;
  const { min, max, step } = spec.axis;
  const span = Math.max(1, max - min);
  // Titik pertama/terakhir diberi jarak dari tepi plot supaya label nilainya
  // tidak menabrak angka sumbu Y.
  const inset = 16;
  const xFor = (index: number) =>
    spec.labels.length === 1
      ? g.left + plotWidth / 2
      : g.left +
        inset +
        (index / (spec.labels.length - 1)) * (plotWidth - inset * 2);
  const yFor = (value: number) =>
    g.top +
    plotHeight -
    ((Math.min(max, Math.max(min, value)) - min) / span) * plotHeight;

  const ticks: string[] = [];
  for (let value = min; value <= max + 0.0001; value += step) {
    const y = yFor(value).toFixed(2);
    ticks.push(
      `<line x1="${g.left}" y1="${y}" x2="${g.width - g.right}" y2="${y}" class="chart-grid" />` +
        `<text x="${g.left - 8}" y="${(Number(y) + 4).toFixed(2)}" class="chart-axis-label" text-anchor="end">${escHtml(formatNumber(value))}</text>`,
    );
  }

  // Label periode berselang bila terlalu rapat; ujung kanan selalu dicetak.
  const labelSpacing =
    spec.labels.length > 1
      ? (plotWidth - inset * 2) / (spec.labels.length - 1)
      : plotWidth;
  const labelStride = labelSpacing < 30 ? 2 : 1;
  const xLabels = spec.labels
    .map((label, index) => {
      const last = spec.labels.length - 1;
      const onStride = index % labelStride === 0 && last - index >= labelStride;
      if (index !== last && index !== 0 && !onStride) return "";
      return `<text x="${xFor(index).toFixed(2)}" y="${g.height - 8}" class="chart-axis-label" text-anchor="middle">${escHtml(label)}</text>`;
    })
    .join("");

  const target =
    spec.target === undefined
      ? ""
      : (() => {
          const y = yFor(spec.target).toFixed(2);
          // Keterangan target di pojok kanan atas, DI LUAR area plot, supaya
          // tidak pernah menimpa titik data yang dekat dengan target.
          const legendRight = g.width - g.right;
          return (
            `<g data-target-line="${spec.target}">` +
            `<line x1="${g.left}" y1="${y}" x2="${legendRight}" y2="${y}" class="chart-target" />` +
            `<line x1="${legendRight - 86}" y1="10" x2="${legendRight - 64}" y2="10" class="chart-target" />` +
            `<text x="${legendRight}" y="14" class="chart-target-label" text-anchor="end">Target ${spec.target}</text>` +
            "</g>"
          );
        })();

  // Garis lurus antar titik, terputus pada periode tanpa data.
  const segments: string[] = [];
  let current: string[] = [];
  spec.series.data.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
      return;
    }
    current.push(
      `${current.length === 0 ? "M" : "L"}${xFor(index).toFixed(2)} ${yFor(value).toFixed(2)}`,
    );
  });
  if (current.length > 1) segments.push(current.join(" "));

  const spacing = labelSpacing;
  const showValues = spacing >= 26;
  const points = spec.series.data
    .map((value, index) => {
      if (value === null) return "";
      const x = xFor(index).toFixed(2);
      const y = yFor(value);
      const labelY = y <= g.top + 14 ? y + 18 : y - 9;
      return (
        `<circle cx="${x}" cy="${y.toFixed(2)}" r="4" fill="#ffffff" stroke="#0f172a" stroke-width="2"><title>${escHtml(spec.series.label)} · ${escHtml(spec.labels[index])}: ${escHtml(formatNumber(value))}</title></circle>` +
        (showValues
          ? `<text x="${x}" y="${labelY.toFixed(2)}" class="chart-value" text-anchor="middle">${escHtml(formatNumber(value))}</text>`
          : "")
      );
    })
    .join("");

  return [
    `<svg class="trend-chart${spec.wide ? " trend-chart--wide" : ""}" viewBox="0 0 ${g.width} ${g.height}" role="img" aria-label="${escHtml(spec.accessibleName)}">`,
    `<title>${escHtml(spec.title)}</title>`,
    `<text x="0" y="14" class="chart-unit">${escHtml(spec.unit)}</text>`,
    ticks.join(""),
    target,
    xLabels,
    segments.length > 0
      ? `<path d="${segments.join(" ")}" fill="none" stroke="#0f172a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />`
      : "",
    points,
    "</svg>",
  ].join("");
}

export function buildChartFigure(spec: ChartSpec): string {
  return [
    `<figure class="chart-figure" data-chart-figure="${escHtml(spec.figure)}">`,
    `<h4 class="chart-title">${escHtml(spec.title)}</h4>`,
    buildChartSvg(spec),
    "</figure>",
  ].join("");
}
