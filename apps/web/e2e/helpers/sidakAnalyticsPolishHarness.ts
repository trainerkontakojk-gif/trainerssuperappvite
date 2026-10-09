/**
 * Harness hermetic untuk spec perapian analitik SIDAK (Ranking, Heatmap,
 * Laporan Data). Semua `/api` dimock lewat `hermeticShell` (fail-closed).
 */

import { type Page } from "@playwright/test";
import {
  openHermeticShell,
  waitForMockedApi,
  type ApiMock,
  type ShellAudit,
} from "./hermeticShell";

export const YEAR = new Date().getFullYear();

export type RankingRow = {
  agentId: string;
  nama: string;
  batch: string;
  defects: number;
  score: number;
  hasCritical: boolean;
  rankChange?: number | null;
};

/** Skor 90 (mendekati target) dan 96 (memenuhi target 95). */
export const SCORE_ROWS: RankingRow[] = [
  { agentId: "a-90", nama: "Agent Sembilan Puluh", batch: "Batch A", defects: 5, score: 90, hasCritical: false, rankChange: 1 },
  { agentId: "a-96", nama: "Agent Sembilan Enam", batch: "Batch A", defects: 3, score: 96, hasCritical: false, rankChange: -1 },
  { agentId: "a-70", nama: "Agent Tujuh Puluh", batch: "Batch A", defects: 2, score: 70, hasCritical: false, rankChange: 0 },
  { agentId: "a-new", nama: "Agent Baru", batch: "Batch A", defects: 1, score: 99, hasCritical: false, rankChange: null },
];

const ACCESS_MOCK: ApiMock = {
  method: "GET",
  path: "/api/v1/me/access-status",
  body: { success: true, data: {} },
};

export function rankingMocks(rankings: RankingRow[]): ApiMock[] {
  return [
    ACCESS_MOCK,
    {
      method: "GET",
      path: "/api/v1/sidak/ranking",
      body: {
        success: true,
        data: {
          rankings,
          periods: [{ id: "period-1", month: 5, year: YEAR, label: `05/${YEAR}` }],
          folders: [],
          availableYears: [YEAR - 1, YEAR],
        },
      },
    },
  ];
}

export async function openRankingPage(
  page: Page,
  rankings: RankingRow[] = SCORE_ROWS,
): Promise<ShellAudit> {
  const audit = await openHermeticShell(page, {
    path: "/sidak/ranking",
    apiMocks: rankingMocks(rankings),
    waitForUrl: /\/sidak\/ranking(\?|$)/,
  });
  await waitForMockedApi(audit, ["/sidak/ranking?"]);
  return audit;
}

function heatmapBody() {
  const days: Array<{ date: string; count: number }> = [];
  for (let month = 1; month <= 12; month++) {
    const perMonth = new Date(Date.UTC(2026, month, 0)).getUTCDate();
    for (let day = 1; day <= perMonth; day++) {
      const iso = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      days.push({ date: iso, count: iso === "2026-01-05" ? 3 : 0 });
    }
  }
  return {
    success: true,
    data: {
      days,
      totalFindings: 3,
      missingDateFindingsAllPeriods: 0,
      mode: "agent",
      year: 2026,
      serviceType: null,
      dateBasis: "tanggal_layanan",
    },
  };
}

export async function openHeatmapPage(
  page: Page,
  options: { fail?: boolean } = {},
): Promise<ShellAudit> {
  const audit = await openHermeticShell(page, {
    path: "/sidak/heatmap",
    apiMocks: [
      ACCESS_MOCK,
      options.fail
        ? {
            method: "GET",
            path: "/api/v1/sidak/heatmap",
            status: 500,
            body: {
              success: false,
              error: { code: "HEATMAP_ERROR", message: "Gagal memuat data heatmap." },
            },
          }
        : { method: "GET", path: "/api/v1/sidak/heatmap", body: heatmapBody() },
    ],
  });
  await waitForMockedApi(audit, ["/sidak/heatmap?"]);
  return audit;
}

const AGENTS_BODY = {
  success: true,
  data: {
    agents: [
      {
        id: "agent-1", nama: "Alya Pranoto", tim: "Tim Call", batch: "Batch 7",
        batch_name: "Batch 7", jabatan: "Agent", foto_url: null, avgScore: 82,
        trend: "up", trendValue: 3, atRisk: false,
      },
    ],
    batches: ["Batch 7"],
  },
};

export async function openReportsDataPage(page: Page): Promise<ShellAudit> {
  const audit = await openHermeticShell(page, {
    path: "/sidak/reports-data",
    apiMocks: [
      ACCESS_MOCK,
      {
        method: "GET",
        path: "/api/v1/sidak/periods",
        body: {
          success: true,
          data: [{ id: "period-2026-01", month: 1, year: 2026, label: "01/2026" }],
        },
      },
      { method: "GET", path: "/api/v1/sidak/agents", body: AGENTS_BODY },
      { method: "GET", path: "/api/v1/sidak/indicators", body: { success: true, data: [] } },
    ],
  });
  await waitForMockedApi(audit, ["/sidak/periods", "/sidak/agents?", "/sidak/indicators"]);
  return audit;
}
