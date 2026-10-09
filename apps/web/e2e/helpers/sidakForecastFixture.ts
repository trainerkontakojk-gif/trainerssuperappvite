/**
 * Fixture hermetic untuk `/sidak/forecast`: respons dashboard, forecast layanan,
 * dan forecast agen. Dipakai `sidak-forecast.spec.ts`.
 *
 * Nama agen sengaja tidak memuat kata "agent" supaya pemeriksaan istilah UI
 * tidak tertipu data.
 */

import type { ApiMock } from "./hermeticShell";

const YEAR = new Date().getFullYear();

export const DASHBOARD_PATH = /^\/api\/v1\/sidak\/dashboard\?/;
export const SERVICE_FORECAST_PATH = "/api/v1/sidak/dashboard/forecast";
export const AGENT_FORECAST_PATH = "/api/v1/sidak/forecast/agents";

const PERIODS = [
  { id: "p1", month: 1, year: YEAR, label: "Jan 26" },
  { id: "p2", month: 2, year: YEAR, label: "Feb 26" },
  { id: "p3", month: 3, year: YEAR, label: "Mar 26" },
].map((period) => ({
  ...period,
  created_at: `${YEAR}-0${period.month}-01T00:00:00.000Z`,
}));

export function dashboardData(overrides: Record<string, unknown> = {}) {
  return {
    periods: PERIODS,
    folders: [
      { id: "folder-call", name: "Tim Call", parent_id: null },
      { id: "folder-call-qa", name: "Tim Call - QA", parent_id: "folder-call" },
      { id: "folder-chat", name: "Tim Whatsapp", parent_id: null },
    ],
    summary: null,
    serviceData: [],
    topAgents: [],
    paretoData: [],
    donutData: null,
    paramTrend: {
      labels: ["Jan 26", "Feb 26", "Mar 26"],
      datasets: [
        { label: "Total Temuan", data: [12, 10, 8], isTotal: true },
        { label: "Greeting", data: [4, 4, 3] },
        { label: "Critical", data: [2, 1, 1] },
        { label: "Empati", data: [6, 5, 4] },
      ],
    },
    periodMetrics: [],
    sparklines: {},
    availableYears: [YEAR],
    currentYear: YEAR,
    availableServices: ["call", "chat"],
    ...overrides,
  };
}

const series = (label: string, parameterId: string | null, values: number[]) => ({
  scope: parameterId
    ? { type: "parameter", parameterId, label }
    : { type: "total", label },
  historical: values.map((value, index) => ({
    periodId: `p${index + 1}`,
    label: PERIODS[index].label,
    date: PERIODS[index].created_at,
    value,
  })),
  forecast: [
    { label: "Apr 26", date: `${YEAR}-04-01T00:00:00.000Z`, value: 7 },
    { label: "Mei 26", date: `${YEAR}-05-01T00:00:00.000Z`, value: 6 },
    { label: "Jun 26", date: `${YEAR}-06-01T00:00:00.000Z`, value: 5 },
  ],
  summary: {
    direction: "down",
    projectedChange: -3,
    projectedChangePercent: -37.5,
    confidence: "high",
    method: "linear-regression",
    sourcePointCount: 3,
  },
  status: "ready",
});

export const SERVICE_FORECAST = {
  status: "fresh",
  snapshot: {
    series: {
      total: series("Total Temuan", null, [12, 10, 8]),
      parameters: {
        Greeting: series("Greeting", "Greeting", [4, 4, 3]),
        Critical: series("Critical", "Critical", [2, 1, 1]),
        Empati: series("Empati", "Empati", [6, 5, 4]),
      },
    },
    insight: { text: "Insight snapshot.", status: "generated" },
    cache: { status: "hit", filterKey: "filter", dataFingerprint: "fp" },
    generatedAt: `${YEAR}-03-14T00:00:00.000Z`,
  },
};

type AgentStatus = "improving" | "declining" | "stable" | "insufficient_data";

export function agentEntry(
  id: string,
  nama: string,
  forecastStatus: AgentStatus,
  confidence: "low" | "medium" | "high" = "medium",
) {
  const slope =
    forecastStatus === "improving" ? -0.8 : forecastStatus === "declining" ? 0.8 : 0;
  return {
    agentId: id,
    nama,
    tim: "Tim Call",
    batchName: "Tim Call",
    jabatan: "agent",
    foto_url: null,
    latestPeriodLabel: "Mar 26",
    latestScore: 88,
    latestFindingsCount: 3,
    latestCriticalFindingsCount: 0,
    projectedScore: 89.5,
    projectedScoreChange: 1.5,
    projectedFindings: 2,
    projectedFindingsChange: -1,
    findingsSlope: slope,
    projectedCriticalFindings: 0,
    projectedCriticalFindingsChange: 0,
    sourcePointCount: forecastStatus === "insufficient_data" ? 1 : 3,
    forecastStatus,
    confidence,
    historical: [],
  };
}

export function agentForecast(
  lanes: Partial<{
    improving: number;
    declining: number;
    stable: number;
    watchlist: number;
  }> = {},
) {
  const { improving = 2, declining = 1, stable = 3, watchlist = 1 } = lanes;
  const make = (count: number, status: AgentStatus, prefix: string) =>
    Array.from({ length: count }, (_, index) =>
      agentEntry(`${prefix}-${index}`, `${prefix} Nama ${index + 1}`, status),
    );
  return {
    improvingAgents: make(improving, "improving", "Rina"),
    decliningAgents: make(declining, "declining", "Budi"),
    stableAgents: make(stable, "stable", "Sari"),
    watchlistAgents: make(watchlist, "insufficient_data", "Dewi"),
    summary: {
      totalEligible: improving + declining + stable + watchlist,
      improvingCount: improving,
      decliningCount: declining,
      stableCount: stable,
      watchlistCount: watchlist,
      latestPeriodLabel: "Mar 26",
    },
  };
}

export function forecastMocks(
  options: {
    dashboard?: unknown;
    dashboardStatus?: number;
    dashboardBody?: unknown;
    agents?: unknown;
    service?: unknown;
  } = {},
): ApiMock[] {
  return [
    {
      method: "GET",
      path: DASHBOARD_PATH,
      status: options.dashboardStatus,
      body: options.dashboardBody ?? {
        success: true,
        data: options.dashboard ?? dashboardData(),
      },
    },
    {
      method: "POST",
      path: SERVICE_FORECAST_PATH,
      body: { success: true, data: options.service ?? SERVICE_FORECAST },
    },
    {
      method: "POST",
      path: AGENT_FORECAST_PATH,
      body: { success: true, data: options.agents ?? agentForecast() },
    },
  ];
}
