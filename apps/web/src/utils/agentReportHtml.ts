import type { AgentDetailData } from "@trainers/types";

export type AgentHtmlVariant = "interactive" | "static";

interface TrendSeries {
  key: string;
  label: string;
  data: Array<number | null>;
  isTotal: boolean;
  isSummary: boolean;
  color: string;
}

interface TrendFilterControl {
  key: string;
  label: string;
  color?: string;
  isButton: boolean;
  isPressed: boolean;
}

const TREND_COLORS = [
  "#111827",
  "#0f766e",
  "#d97706",
  "#be123c",
  "#4338ca",
  "#0891b2",
  "#7c3aed",
];

function escHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function finiteValue(value: unknown, fallback = 0, min = -Infinity, max = Infinity): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function finiteText(value: unknown): string {
  return String(finiteValue(value));
}

function normalizeTrend(data: AgentDetailData): {
  labels: string[];
  series: TrendSeries[];
} {
  const labels = data.personalTrend?.labels ?? [];
  const source = data.personalTrend?.datasets ?? [];
  const rankedParameters = source
    .map((dataset, index) => ({ dataset, index }))
    .filter(({ dataset }) => !dataset.isTotal)
    .map(({ dataset, index }) => ({
      index,
      total: dataset.data.reduce(
        (sum, value) => sum + finiteValue(value),
        0,
      ),
    }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5)
    .map(({ index }) => index);
  const summaryIndexes = new Set(rankedParameters);

  return {
    labels,
    series: source.map((dataset, index) => ({
      key: "series-" + index,
      label: dataset.label,
      data: labels.map((_, valueIndex) =>
        typeof dataset.data[valueIndex] === "number" && Number.isFinite(dataset.data[valueIndex])
          ? dataset.data[valueIndex]
          : null,
      ),
      isTotal: dataset.isTotal,
      isSummary: dataset.isTotal || summaryIndexes.has(index),
      color: dataset.isTotal
        ? TREND_COLORS[0]
        : TREND_COLORS[(index % (TREND_COLORS.length - 1)) + 1],
    })),
  };
}

function buildPath(
  values: Array<number | null>,
  xFor: (index: number) => number,
  yFor: (value: number) => number,
): string {
  const commands: string[] = [];
  let segment: Array<{ x: number; y: number }> = [];
  const flush = () => {
    if (!segment.length) return;
    commands.push(`M${segment[0].x.toFixed(2)} ${segment[0].y.toFixed(2)}`);
    for (let index = 1; index < segment.length; index += 1) {
      const previous = segment[index - 1];
      const current = segment[index];
      const midpoint = (previous.x + current.x) / 2;
      commands.push(`Q${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midpoint.toFixed(2)} ${((previous.y + current.y) / 2).toFixed(2)}`);
      commands.push(`T${current.x.toFixed(2)} ${current.y.toFixed(2)}`);
    }
    segment = [];
  };
  values.forEach((value, index) => {
    if (value === null) { flush(); return; }
    segment.push({ x: xFor(index), y: yFor(value) });
  });
  flush();
  return commands.join(" ");
}

export function buildAreaPath(
  values: Array<number | null>,
  xFor: (index: number) => number,
  yFor: (value: number) => number,
  baseline: number,
): string {
  const segments: string[] = [];
  let segment: Array<{ x: number; y: number }> = [];
  const flush = () => {
    if (segment.length >= 2) {
      const first = segment[0];
      const last = segment[segment.length - 1];
      const commands = [`M${first.x.toFixed(2)} ${first.y.toFixed(2)}`];
      for (let index = 1; index < segment.length; index += 1) {
        const previous = segment[index - 1];
        const current = segment[index];
        const midpoint = (previous.x + current.x) / 2;
        commands.push(`Q${previous.x.toFixed(2)} ${previous.y.toFixed(2)} ${midpoint.toFixed(2)} ${((previous.y + current.y) / 2).toFixed(2)}`);
        commands.push(`T${current.x.toFixed(2)} ${current.y.toFixed(2)}`);
      }
      const line = commands.join(" ");
      segments.push(`${line} L${last.x.toFixed(2)} ${baseline.toFixed(2)} L${first.x.toFixed(2)} ${baseline.toFixed(2)} Z`);
    }
    segment = [];
  };
  values.forEach((value, index) => {
    if (value === null) { flush(); return; }
    segment.push({ x: xFor(index), y: yFor(value) });
  });
  flush();
  return segments.join(" ");
}

function buildFilterControls(series: TrendSeries[], variant: AgentHtmlVariant): string {
  const parameterSeries = series.filter((item) => !item.isTotal);
  const controls: TrendFilterControl[] = [
    { key: "summary", label: "Ringkasan", isButton: variant === "interactive", isPressed: true },
    { key: "total", label: "Total Temuan", isButton: variant === "interactive", isPressed: false },
    ...parameterSeries.map((item) => ({
      key: item.key,
      label: item.label,
      color: item.color,
      isButton: variant === "interactive",
      isPressed: false,
    })),
  ];

  const renderedControls = controls.map((control) => {
    if (control.isButton) {
      const button = '<button type="button" class="trend-filter" data-trend-filter="' + control.key + '" aria-pressed="' + (control.isPressed ? 'true' : 'false') + '">';
      if (control.key === "summary" || control.key === "total") {
        return button + control.label + '</button>';
      }
      return button + '<span class="legend-dot" style="background:' + escHtml(control.color) + '"></span>' + escHtml(control.label) + '</button>';
    }
    if (control.key === "summary" || control.key === "total") {
      return '<span class="trend-filter" data-trend-filter="' + control.key + '" aria-current="' + (control.key === "summary" ? 'true' : 'false') + '">' + control.label + '</span>';
    }
    return '<span class="trend-filter"><span class="legend-dot" style="background:' + escHtml(control.color) + '"></span>' + escHtml(control.label) + '</span>';
  });

  return variant === "interactive"
    ? '<div class="trend-filters" aria-label="Filter seri grafik">' + renderedControls.join('') + '</div>'
    : '<div class="trend-filters" aria-label="Filter seri grafik" aria-description="Snapshot statis; filter tidak interaktif">' + renderedControls.join('') + '</div>';
}

export function buildTrendReportHtml(
  data: AgentDetailData,
  variant: AgentHtmlVariant,
  selectedYear: number,
): string {
  const { labels, series } = normalizeTrend(data);
  const trendRangeLabel = labels.length > 0
    ? labels[0] + " - " + labels[labels.length - 1]
    : "";
  if (labels.length === 0 || series.length === 0) {
    return [
      '<section class="report-section">',
      '<div class="report-section-heading">',
      '<span class="section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 3v18h18M7 16l4-5 4 3 5-7"/></svg></span>',
      '<div><h2>Perkembangan Skor</h2><p>Skor per periode penilaian</p></div>',
      "</div>",
      '<div class="card"><p class="empty-state">Data tren belum tersedia untuk konteks ini.</p></div>',
      "</section>",
    ].join("");
  }

  const width = 960;
  const height = 420;
  const plotLeft = 58;
  const plotRight = 24;
  const plotTop = 24;
  const plotBottom = 54;
  const plotWidth = width - plotLeft - plotRight;
  const plotHeight = height - plotTop - plotBottom;
  const finiteValues = series.flatMap((item) =>
    item.data.filter((value): value is number => value !== null),
  );
  const maxValue = Math.max(1, ...finiteValues);
  const tickMax = Math.max(1, Math.ceil(maxValue / 5) * 5);
  const xFor = (index: number) =>
    labels.length === 1
      ? plotLeft + plotWidth / 2
      : plotLeft + (index / (labels.length - 1)) * plotWidth;
  const yFor = (value: number) =>
    plotTop + plotHeight - (value / tickMax) * plotHeight;

  const grid = Array.from({ length: 6 }, (_, index) => {
    const value = (tickMax / 5) * index;
    const y = yFor(value);
    return [
      '<line x1="' + plotLeft + '" y1="' + y.toFixed(2) + '" x2="' +
        (width - plotRight) + '" y2="' + y.toFixed(2) +
        '" class="chart-grid"/>',
      '<text x="' + (plotLeft - 12) + '" y="' + (y + 4).toFixed(2) +
        '" class="chart-axis-label" text-anchor="end">' +
        value.toLocaleString("id-ID", { maximumFractionDigits: 1 }) +
        "</text>",
    ].join("");
  }).join("");

  const xLabels = labels
    .map(
      (label, index) =>
        '<text x="' + xFor(index).toFixed(2) + '" y="' +
        (height - 20) +
        '" class="chart-axis-label" text-anchor="middle">' +
        escHtml(label) +
        "</text>",
    )
    .join("");

  const visibleSeries = series;
  const seriesMarkup = visibleSeries
    .map((item) => {
      const path = buildPath(item.data, xFor, yFor);
      const hidden = "";
      const points = item.data
        .map((value, index) => {
          if (value === null) return "";
          return [
            '<circle cx="' + xFor(index).toFixed(2) + '" cy="' +
              yFor(value).toFixed(2) + '" r="4" fill="#ffffff" stroke="' +
              item.color + '" stroke-width="2">',
            "<title>" + escHtml(item.label) + " · " +
              escHtml(labels[index]) + ": " + value + "</title>",
            "</circle>",
          ].join("");
        })
        .join("");
      const areaPath = buildAreaPath(item.data, xFor, yFor, height - plotBottom);
      return [
        '<g data-chart-series data-series="' + escHtml(item.label) +
          '" data-series-key="' + escHtml(item.key) +
          '" data-series-total="' + item.isTotal +
          '" data-series-summary="' + item.isSummary + '"' + hidden + ">",
        areaPath
          ? '<path d="' + areaPath + '" fill="' + item.color + '" fill-opacity="' + (item.isTotal ? '0.08' : '0.05') + '" stroke="none"/>'
          : "",
        path
          ? '<path d="' + path + '" fill="none" stroke="' + item.color +
              '" stroke-width="' + (item.isTotal ? 3 : 2) +
              '" stroke-linecap="round" stroke-linejoin="round"/>'
          : "",
        points,
        "</g>",
      ].join("");
    })
    .join("");

  const legend = visibleSeries
    .map((item) => {
      const hidden = "";
      return [
        '<span class="chart-legend-item" data-chart-series data-series="' +
          escHtml(item.label) + '" data-series-key="' + escHtml(item.key) +
          '" data-series-total="' + item.isTotal +
          '" data-series-summary="' + item.isSummary + '"' + hidden + ">",
        '<span class="legend-dot" style="background:' + item.color + '"></span>',
        escHtml(item.label),
        "</span>",
      ].join("");
    })
    .join("");

  // Static keeps the same first paint; its controls are intentionally inert without JS.
  const controls = buildFilterControls(series, variant);

  return [
    '<section class="report-section" data-report-section="trend">',
    '<div class="report-section-heading">',
    '<span class="section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 3v18h18M7 16l4-5 4 3 5-7"/></svg></span>',
    '<div><h2>Perkembangan Skor</h2><p>Periode: ' +
      escHtml(trendRangeLabel) + " " + escHtml(selectedYear) + "</p></div>",
    "</div>",
    '<div class="card trend-card">',
    '<div class="trend-intro">',
    '<p class="trend-kicker">Tren Kinerja' +
      (trendRangeLabel ? " &bull; " + escHtml(trendRangeLabel) : "") + "</p>",
    '<h3 id="trend-title">Pergerakan skor per periode audit</h3>',
    '<p>Pantau tren temuan agen setiap periode penilaian pada tahun yang dipilih.</p>',
    "</div>",
    controls,
    '<figure class="trend-figure trend-chart-shell" aria-labelledby="trend-title">',
    '<svg class="trend-chart" viewBox="0 0 960 420" role="img" aria-describedby="trend-summary">',
    '<title>Grafik tren performa agent</title>',
    grid,
    xLabels,
    seriesMarkup,
    "</svg>",
    '<figcaption id="trend-summary" class="sr-only">Grafik menampilkan ' +
      labels.length + " periode dan " + series.length + " seri data.</figcaption>",
    "</figure>",
    '<div class="chart-legend">' + legend + "</div>",
    '<table class="trend-data-table sr-only"><caption>Data tren lengkap untuk konteks tahun ' + escHtml(selectedYear) + '</caption><thead><tr><th>Periode</th>' + series.map((item) => '<th>' + escHtml(item.label) + '</th>').join('') + '</tr></thead><tbody>' + labels.map((label, index) => '<tr><th>' + escHtml(label) + '</th>' + series.map((item) => '<td>' + (item.data[index] === null ? '—' : finiteText(item.data[index])) + '</td>').join('') + '</tr>').join('') + '</tbody></table>',
    '<div class="trend-stats">',
    '<div class="trend-stat"><span>Total Periode</span><strong>' +
      labels.length + '</strong><small>periode aktif</small></div>',
    '<div class="trend-insight"><span>Ringkasan Tren</span><p>Gunakan pola naik-turun setiap parameter untuk menentukan fokus coaching pada periode berikutnya.</p></div>',
    "</div>",
    "</div>",
    "</section>",
  ].join("");
}

export function buildInteractiveReportScript(
  variant: AgentHtmlVariant,
): string {
  if (variant !== "interactive") return "";

  return `<script>
(() => {
  const report = document.querySelector('[data-report-variant="interactive"]');
  if (!report) return;
  const buttons = Array.from(report.querySelectorAll('[data-trend-filter]'));
  const series = Array.from(report.querySelectorAll('[data-chart-series]'));
  const applyFilter = (filter) => {
    series.forEach((node) => {
      const isTotal = node.getAttribute('data-series-total') === 'true';
      const visible = filter === null
        ? true
        : filter === 'total'
          ? isTotal
          : node.getAttribute('data-series-key') === filter;
      node.toggleAttribute('hidden', !visible);
    });
    buttons.forEach((button) => {
      const buttonFilter = button.getAttribute('data-trend-filter');
      button.setAttribute(
        'aria-pressed',
        String(filter === null ? buttonFilter === 'summary' : buttonFilter === filter),
      );
    });
  };
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.getAttribute('data-trend-filter') || 'summary';
      const current = button.getAttribute('aria-pressed') === 'true';
      applyFilter(current || filter === 'summary' ? null : filter);
    });
  });
  applyFilter(null);
})();
</script>`;
}
