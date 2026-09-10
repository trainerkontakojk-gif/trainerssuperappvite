import type {
  KetikMonitoringReview,
  MonitoringReviewStatus,
  PdktMonitoringReview,
  TelefunMonitoringReview,
} from "./monitoring";
import type { SimulationSubjectSnapshot } from "./simulation-subject";

export const SIDAK_SIMULATION_MODULES = [
  "ketik",
  "pdkt",
  "telefun",
] as const;

export type SidakSimulationModule = (typeof SIDAK_SIMULATION_MODULES)[number];

export interface SidakSimulationCursor {
  occurredAt: string;
  module: SidakSimulationModule;
  historyId: string;
}

export interface SidakSimulationSummary {
  id: string;
  module: SidakSimulationModule;
  scenarioTitle: string;
  occurredAt: string;
  durationSeconds: number | null;
  score: number | null;
  scoreScale: 10 | 100;
  reviewStatus: MonitoringReviewStatus;
  simulationSubject: SimulationSubjectSnapshot;
  actor: {
    userId: string | null;
    email: string | null;
    role: string | null;
  };
}

export interface SidakSimulationPage {
  items: SidakSimulationSummary[];
  nextCursor: string | null;
}

export type SidakSimulationDetail =
  | KetikMonitoringReview
  | PdktMonitoringReview
  | TelefunMonitoringReview;

