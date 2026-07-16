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

const TREND_COLORS = [
  "#2563eb",
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

function finiteValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
        (sum, value) => sum + (finiteValue(value) ?? 0),
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
        finiteValue(dataset.data[valueIndex]),
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
  let drawing = false;
  const commands: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      drawing = false;
      return;
    }
    commands.push(
      (drawing ? "L" : "M") +
        xFor(index).toFixed(2) +
        " " +
        yFor(value).toFixed(2),
    );
    drawing = true;
  });
  return commands.join(" ");
}

function buildRawTrendTable(labels: string[], series: TrendSeries[]): string {
  const headings = series
    .map((item) => '<th class="num">' + escHtml(item.label) + "</th>")
    .join("");
  const rows = labels
    .map((label, labelIndex) => {
      const cells = series
        .map((item) => {
          const value = item.data[labelIndex];
          return '<td class="num">' + (value === null ? "-" : value) + "</td>";
        })
        .join("");
      return "<tr><td>" + escHtml(label) + "</td>" + cells + "</tr>";
    })
    .join("");

  return [
    '<div class="table-scroll">',
    '<table class="trend-table">',
    "<thead><tr><th>Periode</th>" + headings + "</tr></thead>",
    "<tbody>" + rows + "</tbody>",
    "</table>",
    "</div>",
  ].join("");
}

function buildFilterControls(series: TrendSeries[]): string {
  const parameterButtons = series
    .filter((item) => !item.isTotal)
    .map(
      (item) =>
        '<button type="button" class="trend-filter" data-trend-filter="' +
        escHtml(item.key) +
        '" aria-pressed="false"><span class="legend-dot" style="background:' +
        item.color +
        '"></span>' +
        escHtml(item.label) +
        "</button>",
    )
    .join("");

  return [
    '<div class="trend-filters" aria-label="Filter seri grafik">',
    '<button type="button" class="trend-filter" data-trend-filter="summary" aria-pressed="true">Ringkasan</button>',
    '<button type="button" class="trend-filter" data-trend-filter="total" aria-pressed="false">Total Temuan</button>',
    parameterButtons,
    "</div>",
  ].join("");
}

export function buildTrendReportHtml(
  data: AgentDetailData,
  variant: AgentHtmlVariant,
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
      '<div><h2>Tren Pergerakan Skor</h2><p>Data Tren &bull; Performa per periode audit</p></div>',
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

  const visibleSeries = variant === "static"
    ? series.filter((item) => item.isSummary)
    : series;
  const seriesMarkup = visibleSeries
    .map((item) => {
      const path = buildPath(item.data, xFor, yFor);
      const hidden =
        variant === "interactive" && !item.isSummary ? " hidden" : "";
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
      return [
        '<g data-chart-series data-series="' + escHtml(item.label) +
          '" data-series-key="' + escHtml(item.key) +
          '" data-series-total="' + item.isTotal +
          '" data-series-summary="' + item.isSummary + '"' + hidden + ">",
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
      const hidden =
        variant === "interactive" && !item.isSummary ? " hidden" : "";
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

  const controls = variant === "interactive"
    ? buildFilterControls(series)
    : "";
  const rawTable = buildRawTrendTable(labels, series);

  return [
    '<section class="report-section" data-report-section="trend">',
    '<div class="report-section-heading">',
    '<span class="section-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 3v18h18M7 16l4-5 4 3 5-7"/></svg></span>',
    '<div><h2>Tren Pergerakan Skor</h2><p>Data Tren &bull; Rentang Statistik: ' +
      escHtml(trendRangeLabel) + " " + escHtml(data.initialYear) + "</p></div>",
    "</div>",
    '<div class="card trend-card">',
    '<div class="trend-intro">',
    '<p class="trend-kicker">Tren Kinerja' +
      (trendRangeLabel ? " &bull; " + escHtml(trendRangeLabel) : "") + "</p>",
    '<h3 id="trend-title">Pergerakan skor per periode audit</h3>',
    '<p>Pantau tren temuan agent pada setiap periode evaluasi di tahun aktif.</p>',
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
    '<div class="trend-stats">',
    '<div class="trend-stat"><span>Volume Periode</span><strong>' +
      labels.length + '</strong><small>Periode Aktif</small></div>',
    '<div class="trend-insight"><span>Insight Tren</span><p>Gunakan pola naik-turun per parameter untuk menentukan fokus coaching pada periode berikutnya.</p></div>',
    "</div>",
    variant === "interactive"
      ? '<details class="trend-data"><summary>Lihat data tren lengkap</summary>' +
          rawTable + "</details>"
      : rawTable,
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
      const visible = filter === 'summary'
        ? node.getAttribute('data-series-summary') === 'true'
        : filter === 'total'
          ? isTotal
          : isTotal || node.getAttribute('data-series-key') === filter;
      node.toggleAttribute('hidden', !visible);
    });
    buttons.forEach((button) => {
      button.setAttribute(
        'aria-pressed',
        String(button.getAttribute('data-trend-filter') === filter),
      );
    });
  };
  buttons.forEach((button) => {
    button.addEventListener('click', () => {
      const filter = button.getAttribute('data-trend-filter') || 'summary';
      const nextFilter = filter !== 'summary' && button.getAttribute('aria-pressed') === 'true'
        ? 'summary'
        : filter;
      applyFilter(nextFilter);
    });
  });
  applyFilter('summary');
})();
</script>`;
}
