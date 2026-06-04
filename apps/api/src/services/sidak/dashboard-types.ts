import type {
  ParetoData,
  QAIndicator,
  ServiceType,
  ServiceWeight,
} from "@trainers/types";
import {
  SERVICE_LABELS,
  isServiceType,
} from "../../lib/scoring";

export type DashboardTemuanRow = {
  id?: string;
  peserta_id: string;
  period_id: string;
  indicator_id: string;
  service_type?: ServiceType | string | null;
  tahun?: number | null;
  nilai?: number | null;
  no_tiket?: string | null;
  created_at?: string;
  is_phantom_padding?: boolean | null;
  profiler_peserta?: {
    id?: string;
    nama?: string | null;
    batch_name?: string | null;
    tim?: string | null;
    jabatan?: string | null;
  } | null;
};

export type DashboardAgentGroup = {
  id: string;
  nama: string;
  batch_name: string;
  tim: string;
  jabatan: string;
  rows: DashboardTemuanRow[];
};

export type DashboardWeightMap = Record<string, unknown>;

type DashboardRawWeightRow = ServiceWeight & {
  service_type: ServiceType;
};

type DashboardRuleIndicatorRow = {
  id: string;
  legacy_indicator_id?: string | null;
  service_type?: ServiceType | string | null;
  name: string;
  category?: string | null;
  bobot: number | string;
  has_na?: boolean | null;
};

type DashboardFolderRow = {
  id: string;
  name: string;
};

type DashboardServiceRow = {
  service_type?: string | null;
};

export type DashboardScoreRow = {
  indicator_id: string;
  nilai: number;
  no_tiket?: string | null;
  created_at?: string;
  period_id?: string;
};

export type DashboardAgentMetrics = {
  finalAgentScore: number;
  agentFindings: number;
  hasCritical: boolean;
};

export type DashboardAgentWithMetrics = DashboardAgentGroup & DashboardAgentMetrics;

export function withDashboardAgentMetrics(
  agent: DashboardAgentGroup,
  metrics: DashboardAgentMetrics,
): DashboardAgentWithMetrics {
  return { ...agent, ...metrics };
}

export function toDashboardScoreRows(rows: DashboardTemuanRow[]): DashboardScoreRow[] {
  return rows.flatMap((row) => {
    if (typeof row.nilai !== "number") return [];
    return [{
      indicator_id: row.indicator_id,
      nilai: row.nilai,
      no_tiket: row.no_tiket ?? null,
      created_at: row.created_at,
      period_id: row.period_id,
    }];
  });
}

export function toDashboardTemuanRows(rows: DashboardTemuanRow[] | null | undefined): DashboardTemuanRow[] {
  return rows ?? [];
}

export function toDashboardWeightMap(rows: DashboardRawWeightRow[] | null | undefined): Record<string, ServiceWeight> {
  return (rows ?? []).reduce<Record<string, ServiceWeight>>((acc, row) => {
    acc[row.service_type] = row;
    return acc;
  }, {});
}

export function toDashboardRuleIndicators(rows: DashboardRuleIndicatorRow[] | null | undefined): QAIndicator[] {
  return (rows ?? []).map((row) => ({
    id: row.legacy_indicator_id || row.id,
    service_type: isServiceType(row.service_type) ? row.service_type : "call",
    name: row.name,
    category: toParetoCategory(row.category),
    bobot: Number(row.bobot),
    has_na: row.has_na ?? false,
  }));
}

export function toDashboardFolderRows(rows: DashboardFolderRow[] | null | undefined): DashboardFolderRow[] {
  return rows ?? [];
}

export function toDashboardServiceSet(rows: DashboardServiceRow[] | null | undefined): Set<string> {
  return new Set(
    (rows ?? [])
      .map((row) => row.service_type)
      .filter((serviceType): serviceType is string => typeof serviceType === "string" && serviceType.length > 0),
  );
}

export function toParetoCategory(category: string | null | undefined): ParetoData["category"] {
  return category === "critical" ? "critical" : "non_critical";
}

export function getDashboardServiceLabel(serviceType: string): string {
  return isServiceType(serviceType) ? SERVICE_LABELS[serviceType] : serviceType;
}
