// Shared by the sidak-dashboard-insights-*.spec.ts files.
import { type Page } from "@playwright/test";
import { type ApiMock } from "./hermeticShell";

export const YEAR = new Date().getFullYear();

export const PREVIOUS_LABEL = `Apr ${String(YEAR).slice(-2)}`;

export const LATEST_LABEL = `Mei ${String(YEAR).slice(-2)}`;

export const DASHBOARD_DATA = {
  periods: [
    { id: "period-apr", year: YEAR, month: 4 },
    { id: "period-may", year: YEAR, month: 5 },
  ],
  folders: [{ id: "team-call", name: "Tim Call" }],
  summary: {
    totalDefects: 108,
    totalTickets: 41,
    zeroErrorRate: 12.5,
    avgAgentScore: 92.4,
    complianceRate: 65,
    complianceCount: 13,
    totalAgents: 20,
  },
  serviceData: [
    { name: "Call", serviceType: "call", total: 108, severity: "High" },
  ],
  topAgents: [
    {
      agentId: "agent-priority",
      nama: "Ayu Larasati",
      batch: "Tim Call",
      tim: "Tim Call",
      jabatan: "Agent",
      defects: 12,
      score: 84.5,
      hasCritical: true,
    },
  ],
  paretoData: [
    {
      name: "Akurasi Informasi",
      fullName: "Akurasi Informasi",
      count: 24,
      cumulative: 50,
      category: "critical",
    },
  ],
  donutData: { critical: 35, nonCritical: 21, total: 56 },
  paramTrend: {
    labels: [PREVIOUS_LABEL, LATEST_LABEL],
    datasets: [
      { label: "Total Temuan", data: [60, 48], isTotal: true },
      { label: "Akurasi Informasi", data: [30, 24], isTotal: false },
    ],
  },
  periodMetrics: [],
  sparklines: {
    "total-defects": [
      { label: PREVIOUS_LABEL, value: 60 },
      { label: LATEST_LABEL, value: 48 },
    ],
  },
  availableYears: [YEAR],
  currentYear: YEAR,
  availableServices: ["call"],
};

export const LONG_PARAMETERS = [
  "Akurasi informasi produk dan ketentuan layanan pelanggan",
  "Verifikasi identitas dan perlindungan data pelanggan",
  "Ketepatan solusi dan dokumentasi tindak lanjut",
  "Empati dan kejelasan komunikasi selama interaksi",
];

export const DENSE_DATA = {
  ...DASHBOARD_DATA,
  topAgents: [
    "Ayu Larasati",
    "Muhammad Rizky Pratama",
    "Dewi Anggraini Putri",
    "Christina Natalia Wijaya",
    "Ahmad Fauzan Ramadhan",
  ].map((nama, index) => ({
    ...DASHBOARD_DATA.topAgents[0],
    agentId: index === 0 ? "agent-priority" : `agent-${index}`,
    nama,
    tim: "Tim Call Layanan Pelanggan dan Penyelesaian Keluhan",
    defects: 12 - index,
    score: 84.5 + index,
  })),
  paretoData: LONG_PARAMETERS.map((name, index) => ({
    name,
    fullName: name,
    count: 24 - index * 4,
    cumulative: 0,
    category: index < 2 ? "critical" : "non_critical",
  })),
  paramTrend: {
    ...DASHBOARD_DATA.paramTrend,
    datasets: [
      DASHBOARD_DATA.paramTrend.datasets[0],
      ...LONG_PARAMETERS.map((label, index) => ({
        label,
        data: [30 - index * 4, 24 - index * 3],
        isTotal: false,
      })),
    ],
  },
  sparklines: Object.fromEntries(
    ["total-defects", "total-tickets", "avg-score", "compliance"].map(
      (key, index) => [
        key,
        [
          { label: PREVIOUS_LABEL, value: [60, 45, 90, 60][index] },
          { label: LATEST_LABEL, value: [48, 41, 92.4, 65][index] },
        ],
      ],
    ),
  ),
};

export const HEATMAP_DATA = {
  mode: "agent" as const,
  year: YEAR,
  serviceType: "call" as const,
  dateBasis: "tanggal_layanan" as const,
  countBy: "parameter" as const,
  agentId: null,
  days: [
    { date: `${YEAR}-05-02`, count: 8 },
    { date: `${YEAR}-05-03`, count: 4 },
    { date: `${YEAR}-05-06`, count: 3 },
  ],
  totalFindings: 15,
  missingDateFindingsAllPeriods: 2,
};

export const FORECAST_SNAPSHOT = {
  series: {
    total: {
      scope: { type: "total" as const, label: "Total Temuan" },
      historical: [
        {
          periodId: "period-apr",
          label: PREVIOUS_LABEL,
          date: `${YEAR}-04-30`,
          value: 60,
        },
        {
          periodId: "period-may",
          label: LATEST_LABEL,
          date: `${YEAR}-05-31`,
          value: 48,
        },
      ],
      forecast: [
        { label: "Jun", date: `${YEAR}-06-30`, value: 52 },
        { label: "Jul", date: `${YEAR}-07-31`, value: 56 },
        { label: "Agu", date: `${YEAR}-08-31`, value: 60 },
      ],
      summary: {
        direction: "up" as const,
        projectedChange: 12,
        projectedChangePercent: 25,
        confidence: "medium" as const,
        method: "linear-regression" as const,
        sourcePointCount: 2,
      },
      status: "ready" as const,
    },
    parameters: {},
  },
  insight: {
    status: "generated" as const,
    text: "### Ringkasan Eksekutif\nProyeksi total temuan mengarah meningkat.\n\n### Tindakan dan Rekomendasi\n1. **Validasi temuan kritikal**: Periksa bukti dan pola temuan sebelum coaching.",
  },
  cache: {
    status: "hit" as const,
    filterKey: "fixture",
    dataFingerprint: "fixture",
  },
  generatedAt: `${YEAR}-06-01T00:00:00.000Z`,
};

export const ZERO_BASELINE_DATA = {
  ...DASHBOARD_DATA,
  summary: { ...DASHBOARD_DATA.summary, totalDefects: 48 },
  paramTrend: {
    ...DASHBOARD_DATA.paramTrend,
    datasets: DASHBOARD_DATA.paramTrend.datasets.map((dataset) =>
      dataset.isTotal ? { ...dataset, data: [0, 48] } : dataset,
    ),
  },
  sparklines: {
    "total-defects": [
      { label: PREVIOUS_LABEL, value: 0 },
      { label: LATEST_LABEL, value: 48 },
    ],
  },
};

export const DASHBOARD_MOCKS: readonly ApiMock[] = [
  {
    method: "GET",
    path: "/api/v1/me/access-status",
    body: { success: true, data: {} },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/dashboard",
    body: { success: true, data: DASHBOARD_DATA },
  },
  {
    method: "POST",
    path: "/api/v1/sidak/dashboard/forecast",
    body: {
      success: true,
      data: { status: "missing", snapshot: null },
    },
  },
  {
    method: "GET",
    path: "/api/v1/sidak/heatmap",
    body: { success: true, data: HEATMAP_DATA },
  },
];

export const withHeatmapResponse = (body: unknown, status = 200): ApiMock[] =>
  DASHBOARD_MOCKS.map((mock) =>
    mock.method === "GET" && mock.path === "/api/v1/sidak/heatmap"
      ? { ...mock, status, body }
      : mock,
  );

export const DASHBOARD_READY_MOCKS = DASHBOARD_MOCKS.map((mock) =>
  mock.method === "POST" && mock.path === "/api/v1/sidak/dashboard/forecast"
    ? {
        ...mock,
        body: {
          success: true,
          data: { status: "fresh", snapshot: FORECAST_SNAPSHOT },
        },
      }
    : mock,
);

export const FUTURE_MONTHS = ["Jun", "Jul", "Agu"] as const;

export const parameterForecast = (label: string, values: number[]) => ({
  scope: { type: "parameter" as const, parameterId: label, label },
  historical: [],
  forecast: FUTURE_MONTHS.map((month, index) => ({
    label: month,
    date: `${YEAR}-0${6 + index}-28`,
    value: values[index],
  })),
  summary: FORECAST_SNAPSHOT.series.total.summary,
  status: "ready" as const,
});

export const TWO_PARAMETER_MOCKS = DASHBOARD_READY_MOCKS.map((mock) => {
  if (mock.method === "GET" && mock.path === "/api/v1/sidak/dashboard") {
    return {
      ...mock,
      body: {
        success: true,
        data: {
          ...DASHBOARD_DATA,
          paramTrend: {
            ...DASHBOARD_DATA.paramTrend,
            datasets: [
              ...DASHBOARD_DATA.paramTrend.datasets,
              { label: "Salam Pembuka", data: [10, 8], isTotal: false },
            ],
          },
        },
      },
    };
  }
  if (
    mock.method === "POST" &&
    mock.path === "/api/v1/sidak/dashboard/forecast"
  ) {
    return {
      ...mock,
      body: {
        success: true,
        data: {
          status: "fresh",
          snapshot: {
            ...FORECAST_SNAPSHOT,
            series: {
              ...FORECAST_SNAPSHOT.series,
              parameters: {
                "Akurasi Informasi": parameterForecast(
                  "Akurasi Informasi",
                  [20, 18, 16],
                ),
                "Salam Pembuka": parameterForecast("Salam Pembuka", [6, 5, 4]),
              },
            },
          },
        },
      },
    };
  }
  return mock;
});

export const PANEL_TITLES = [
  "Ringkasan temuan",
  "Tren temuan",
  "Agen dengan temuan terbanyak",
  "Parameter teratas",
  "Pola temuan mingguan",
];

export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "Mei",
  "Jun",
  "Jul",
  "Agu",
  "Sep",
  "Okt",
  "Nov",
  "Des",
];

export const SCOPE_LINE = `Call · Tim Call · Jan–${MONTH_SHORT[new Date().getMonth()]} ${YEAR}`;

export async function measureLayout(page: Page) {
  return page
    .getByRole("region", { name: "Konten halaman" })
    .evaluate((workspace, titles) => {
      const rect = (element: Element) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x,
          y: box.y + workspace.scrollTop,
          width: box.width,
          height: box.height,
          bottom: box.bottom + workspace.scrollTop,
          right: box.right,
        };
      };
      const panels = titles.map((title) => {
        const heading = [...workspace.querySelectorAll("h2,h3")].find(
          (item) => item.textContent?.trim() === title,
        )!;
        const panel = heading.closest("[data-dashboard-panel]")!;
        const bounds = rect(panel);
        const children = [
          ...panel.querySelectorAll("button,a,svg.recharts-surface"),
        ]
          .filter((item) => item.getBoundingClientRect().width > 0)
          .map((item) => ({
            label:
              item.getAttribute("aria-label") ||
              item.textContent?.trim().slice(0, 90) ||
              item.tagName,
            ...rect(item),
          }));
        return {
          title,
          ...bounds,
          overflow: panel.scrollWidth - panel.clientWidth,
          children,
        };
      });
      const gaps = panels.flatMap((panel) => {
        const next = panels
          .filter(
            (other) =>
              other.y >= panel.bottom - 1 &&
              Math.abs(other.right - panel.right) < 2,
          )
          .sort((a, b) => a.y - b.y)[0];
        return next
          ? [
              {
                from: panel.title,
                to: next.title,
                pixels: next.y - panel.bottom,
              },
            ]
          : [];
      });
      return {
        workspaceWidth: workspace.clientWidth,
        workspaceOverflow: workspace.scrollWidth - workspace.clientWidth,
        panels,
        gaps,
        headingOrder: [...workspace.querySelectorAll("h2,h3")].map((item) =>
          item.textContent?.trim(),
        ),
      };
    }, PANEL_TITLES);
}
