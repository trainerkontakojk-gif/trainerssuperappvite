/**
 * Fixture hermetic untuk beranda SIDAK (`/sidak`).
 *
 * Beranda membaca tiga endpoint yang sudah ada: status akses (gate leader),
 * `GET /sidak/dashboard` (kondisi periode + Pareto), dan `GET /sidak/agents`
 * (agen di bawah target). Spec shell yang hanya membuka `/sidak` juga memakai
 * `SIDAK_HOME_MOCKS` supaya tetap hermetic.
 */

import type { ApiMock } from "./hermeticShell";

export const HOME_YEAR = new Date().getFullYear();

export const HOME_PERIOD_METRICS = [
  {
    periodId: "period-prev",
    label: "Sep 26",
    total: 40,
    totalTickets: 30,
    zero: 0,
    compliance: 10,
    complianceRate: 50,
    avgAgentScore: 88.4,
    totalAudited: 42,
  },
  {
    periodId: "period-latest",
    label: "Okt 26",
    total: 36,
    totalTickets: 27,
    zero: 0,
    compliance: 12,
    complianceRate: 55,
    avgAgentScore: 90.1,
    totalAudited: 44,
  },
];

export const HOME_PARETO = [
  {
    name: "Verifikasi data",
    fullName: "Verifikasi data konsumen",
    count: 14,
    cumulative: 38.9,
    category: "critical",
  },
  {
    name: "Informasi tidak lengkap",
    fullName: "Informasi tidak lengkap ke konsumen",
    count: 9,
    cumulative: 63.9,
    category: "non_critical",
  },
  {
    name: "Hold tanpa izin",
    fullName: "Hold tanpa izin",
    count: 7,
    cumulative: 83.3,
    category: "non_critical",
  },
  {
    name: "Salam penutup",
    fullName: "Salam penutup",
    count: 6,
    cumulative: 100,
    category: "non_critical",
  },
] as const;

export function homeDashboardData(
  overrides: Partial<Record<string, unknown>> = {},
) {
  return {
    periods: [
      { id: "period-prev", year: HOME_YEAR, month: 9 },
      { id: "period-latest", year: HOME_YEAR, month: 10 },
    ],
    folders: [{ id: "team-call", name: "Tim Call" }],
    summary: {
      totalDefects: 76,
      totalTickets: 57,
      zeroErrorRate: 0,
      avgAgentScore: 89.3,
      complianceRate: 52,
      complianceCount: 11,
      totalAgents: 44,
    },
    serviceData: [],
    topAgents: [],
    paretoData: HOME_PARETO,
    donutData: null,
    paramTrend: { labels: ["Sep 26", "Okt 26"], datasets: [] },
    periodMetrics: HOME_PERIOD_METRICS,
    sparklines: {},
    availableYears: [HOME_YEAR],
    currentYear: HOME_YEAR,
    availableServices: ["call", "chat"],
    ...overrides,
  };
}

function agent(
  id: string,
  nama: string,
  avgScore: number | null,
  trendValue: number | null,
) {
  return {
    id,
    nama,
    tim: "Tim Call",
    batch: "Batch 7",
    batch_name: "Batch 7",
    jabatan: "Agent",
    foto_url: null,
    avgScore,
    trend:
      trendValue === null
        ? "none"
        : trendValue > 0
          ? "up"
          : trendValue < 0
            ? "down"
            : "same",
    trendValue,
    atRisk: avgScore !== null && avgScore < 95,
    periodMonth: 10,
  };
}

export const HOME_AGENTS = [
  agent("a-bima", "Bima Saputra", 88, 1.5),
  agent("a-citra", "Citra Lestari", 96, 0.4),
  agent("a-rina", "Rina Marlina", 81.5, -6.3),
  agent("a-dodi", "Dodi Pratama", 92.4, null),
  agent("a-eko", "Eko Wibowo", null, null),
];

export const ACCESS_MOCK: ApiMock = {
  method: "GET",
  path: "/api/v1/me/access-status",
  body: { success: true, data: {} },
};

export const LEADER_ACCESS_MOCK: ApiMock = {
  method: "GET",
  path: "/api/v1/me/access-status",
  body: {
    success: true,
    data: {
      sidak: {
        status: "approved",
        module: "sidak",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    },
  },
};

export function homeMocks(
  options: {
    access?: ApiMock;
    dashboard?: { status?: number; body?: unknown };
    agents?: { status?: number; body?: unknown };
  } = {},
): ApiMock[] {
  return [
    options.access ?? ACCESS_MOCK,
    {
      method: "GET",
      path: "/api/v1/sidak/dashboard",
      status: options.dashboard?.status ?? 200,
      body: options.dashboard?.body ?? {
        success: true,
        data: homeDashboardData(),
      },
    },
    {
      method: "GET",
      path: "/api/v1/sidak/agents",
      status: options.agents?.status ?? 200,
      body: options.agents?.body ?? {
        success: true,
        data: { agents: HOME_AGENTS, batches: ["Batch 7"] },
      },
    },
  ];
}

/** Mock minimal untuk spec shell yang hanya perlu membuka `/sidak`. */
export const SIDAK_HOME_MOCKS: readonly ApiMock[] = homeMocks();
export const SIDAK_HOME_LEADER_MOCKS: readonly ApiMock[] = homeMocks({
  access: LEADER_ACCESS_MOCK,
});
