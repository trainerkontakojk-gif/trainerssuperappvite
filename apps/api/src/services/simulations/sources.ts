import type {
  MonitoringReviewStatus,
  SidakSimulationModule,
} from "@trainers/types";
import { normalizeReviewStatus } from "../monitoring-history-service";

// Shared reading rules for KETIK/PDKT/Telefun history rows: which table and
// time column each module uses, its native score, and when a session counts
// as reviewed. Lifted unchanged from services/sidak/agent-simulations.ts so
// SIDAK agent detail and TNA practice progress apply the same definitions.

export type SimulationModule = SidakSimulationModule;

export type RawSimulationRow = {
  id?: unknown;
  user_id?: unknown;
  date?: unknown;
  timestamp?: unknown;
  created_at?: unknown;
  scenario_title?: unknown;
  first_message_at?: unknown;
  last_message_at?: unknown;
  time_taken?: unknown;
  duration_seconds?: unknown;
  final_score?: unknown;
  score?: unknown;
  review_status?: unknown;
  evaluation_status?: unknown;
  status?: unknown;
  scoring_status?: unknown;
  config?: unknown;
  scenarios?: unknown;
  evaluation?: unknown;
  evaluation_score?: unknown;
  simulation_subject_type?: unknown;
  simulation_subject_peserta_id?: unknown;
  simulation_subject_name?: unknown;
  simulation_subject_batch_name?: unknown;
  simulation_subject_team?: unknown;
};

export const SIMULATION_SOURCES: Record<
  SimulationModule,
  { table: string; timeColumn: "date" | "timestamp" | "created_at" }
> = {
  ketik: { table: "ketik_history", timeColumn: "date" },
  pdkt: { table: "pdkt_history", timeColumn: "timestamp" },
  telefun: { table: "telefun_history", timeColumn: "created_at" },
};

/** Columns getScore/getReviewStatus/occurredAt read, per module. */
export const SIMULATION_STATUS_COLUMNS: Record<SimulationModule, string> = {
  ketik: "date, final_score, review_status",
  pdkt: "timestamp, created_at, evaluation_score:evaluation->score, evaluation_status",
  telefun: "created_at, score, status, scoring_status",
};

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function occurredAt(
  row: RawSimulationRow,
  module: SimulationModule,
): string {
  const value =
    module === "ketik"
      ? row.date
      : module === "pdkt"
        ? (row.timestamp ?? row.created_at)
        : row.created_at;
  return asString(value) ?? "";
}

export function getScore(
  row: RawSimulationRow,
  module: SimulationModule,
): number | null {
  if (module === "ketik") return asNumber(row.final_score);
  if (module === "telefun") return asNumber(row.score);
  return asNumber(row.evaluation_score ?? asObject(row.evaluation).score);
}

export function getReviewStatus(
  row: RawSimulationRow,
  module: SimulationModule,
): MonitoringReviewStatus {
  if (module === "ketik") return normalizeReviewStatus(row.review_status);
  if (module === "pdkt") return normalizeReviewStatus(row.evaluation_status);

  const scoringStatus = normalizeReviewStatus(row.scoring_status);
  if (row.scoring_status !== null && row.scoring_status !== undefined) {
    return scoringStatus;
  }

  if (row.status === "pending") return "pending";
  if (row.status === "active") return "processing";
  if (row.status === "failed") return "failed";
  return getScore(row, module) === null ? "not_started" : "completed";
}
