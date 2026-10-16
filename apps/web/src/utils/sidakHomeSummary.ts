/**
 * Turunan angka untuk Ringkasan SIDAK (`/sidak`). Murni: tidak ada fetch, jadi
 * setiap angka di beranda bisa ditelusuri ke respons endpoint yang sudah ada
 * (`GET /sidak/dashboard`, `GET /sidak/agents`).
 */

import type {
  AgentDirectoryEntry,
  DashboardData,
  ParetoData,
} from "@trainers/types";
import { SIDAK_QA_TARGET } from "./sidakScoreStatus";

type PeriodMetric = DashboardData["periodMetrics"][number];

export interface SidakHomeMetric {
  id: "score" | "audited" | "findings" | "tickets";
  label: string;
  value: string;
  /** Kalimat perubahan dibanding periode sebelumnya; null bila tidak ada. */
  change: string | null;
  /** Arah perubahan dari sudut kualitas, untuk warna teks perubahan. */
  tone: "better" | "worse" | "neutral";
}

export interface SidakHomePeriod {
  label: string;
  previousLabel: string | null;
  metrics: SidakHomeMetric[];
}

function countChange(
  current: number,
  previous: number | undefined,
  previousLabel: string | null,
  lowerIsBetter: boolean,
): Pick<SidakHomeMetric, "change" | "tone"> {
  if (previous === undefined || previousLabel === null) {
    return { change: null, tone: "neutral" };
  }
  const delta = current - previous;
  if (delta === 0) {
    return { change: `Sama dengan ${previousLabel}`, tone: "neutral" };
  }
  const better = lowerIsBetter ? delta < 0 : delta > 0;
  return {
    change: `${delta > 0 ? "Naik" : "Turun"} ${Math.abs(delta)} dari ${previousLabel}`,
    tone: better ? "better" : "worse",
  };
}

/**
 * Kondisi periode QA terbaru dari `periodMetrics` (urut waktu dari backend):
 * periode terakhir dibanding satu periode sebelumnya.
 */
export function buildHomePeriod(
  periodMetrics: readonly PeriodMetric[] | null | undefined,
): SidakHomePeriod | null {
  const metrics = periodMetrics ?? [];
  const latest = metrics[metrics.length - 1];
  if (!latest) return null;
  const previous = metrics[metrics.length - 2];
  const previousLabel = previous?.label ?? null;

  const scoreDelta = previous
    ? Math.round((latest.avgAgentScore - previous.avgAgentScore) * 10) / 10
    : null;
  const score: SidakHomeMetric = {
    id: "score",
    label: "Rata-rata skor agen",
    value: latest.avgAgentScore.toFixed(1),
    change:
      scoreDelta === null || previousLabel === null
        ? null
        : scoreDelta === 0
          ? `Sama dengan ${previousLabel}`
          : `${scoreDelta > 0 ? "Naik" : "Turun"} ${Math.abs(scoreDelta).toFixed(1)} poin dari ${previousLabel}`,
    tone:
      scoreDelta === null || scoreDelta === 0
        ? "neutral"
        : scoreDelta > 0
          ? "better"
          : "worse",
  };

  return {
    label: latest.label,
    previousLabel,
    metrics: [
      score,
      {
        id: "audited",
        label: "Agen diaudit",
        value: String(latest.totalAudited),
        ...countChange(
          latest.totalAudited,
          previous?.totalAudited,
          previousLabel,
          false,
        ),
        // Jumlah agen diaudit adalah cakupan, bukan kualitas.
        tone: "neutral",
      },
      {
        id: "findings",
        label: "Temuan",
        value: String(latest.total),
        ...countChange(latest.total, previous?.total, previousLabel, true),
      },
      {
        id: "tickets",
        label: "Tiket bertemuan",
        value: String(latest.totalTickets),
        ...countChange(
          latest.totalTickets,
          previous?.totalTickets,
          previousLabel,
          true,
        ),
      },
    ],
  };
}

/**
 * Agen di bawah target dengan definisi yang sama dengan `agents_below_target`
 * di Beranda: `atRisk` dari `GET /sidak/agents`. Skor terendah lebih dulu.
 */
export function buildFollowUpAgents(
  agents: readonly AgentDirectoryEntry[] | null | undefined,
): AgentDirectoryEntry[] {
  return (agents ?? [])
    .filter((agent) => agent.atRisk && agent.avgScore !== null)
    .sort(
      (a, b) =>
        (a.avgScore ?? SIDAK_QA_TARGET) - (b.avgScore ?? SIDAK_QA_TARGET) ||
        a.nama.localeCompare(b.nama, "id"),
    );
}

export interface SidakHomeParameter {
  name: string;
  count: number;
  /** Porsi dari semua temuan Pareto, dibulatkan ke persen terdekat. */
  share: number;
  critical: boolean;
}

/** Tiga parameter teratas dari Pareto beserta porsinya. */
export function buildTopParameters(
  pareto: readonly ParetoData[] | null | undefined,
  limit = 3,
): SidakHomeParameter[] {
  const rows = [...(pareto ?? [])].sort((a, b) => b.count - a.count);
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  if (total === 0) return [];
  return rows.slice(0, limit).map((row) => ({
    name: row.fullName || row.name,
    count: row.count,
    share: Math.round((row.count / total) * 100),
    critical: row.category === "critical",
  }));
}
