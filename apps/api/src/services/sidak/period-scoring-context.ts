import { supabaseAdmin } from "../../lib/supabase";
import { resolveEffectiveRuleVersionForPeriod } from "./rule-version-resolver";
import { isServiceType } from "../../lib/scoring";
import type {
  QAIndicator,
  ScoringMode,
  ServiceType,
  ServiceWeight,
} from "@trainers/types";

export type PeriodScoringRow = {
  indicator_id: string;
  rule_indicator_id?: string | null;
  nilai?: number | null;
  no_tiket?: string | null;
  created_at?: string;
  period_id: string;
};

export type PeriodScoringContext = {
  indicators: QAIndicator[];
  weight: ServiceWeight;
  scoreIdByAnyId: ReadonlyMap<string, string>;
};

type RuleIndicatorSnapshotRow = {
  id: string;
  indicator_id?: string | null;
  legacy_indicator_id?: string | null;
  service_type?: string | null;
  name: string;
  parameter_group?: string | null;
  category?: string | null;
  bobot: number | string;
  has_na?: boolean | null;
  sort_order?: number | null;
};

export type ServiceWeightOverride = {
  service_type?: string | null;
  critical_weight?: number | string | null;
  non_critical_weight?: number | string | null;
  scoring_mode?: ScoringMode | null;
};

export async function loadPeriodScoringContext(
  serviceType: ServiceType,
  periodId: string,
  fallbackIndicators: QAIndicator[],
  fallbackWeight: ServiceWeight,
): Promise<PeriodScoringContext> {
  const activeVersion = await resolveEffectiveRuleVersionForPeriod(
    serviceType,
    periodId,
  );

  if (activeVersion) {
    const { data: snapshotInds, error: snapshotError } = await supabaseAdmin
      .from("qa_service_rule_indicators")
      .select("*")
      .eq("rule_version_id", activeVersion.id);

    if (snapshotError) {
      throw new Error(
        `Gagal memuat snapshot indikator ${serviceType}:${periodId}: ${snapshotError.message}`,
      );
    }

    if (snapshotInds && snapshotInds.length > 0) {
      const indicators: QAIndicator[] = (
        snapshotInds as RuleIndicatorSnapshotRow[]
      ).map((ri) => ({
        id: ri.id,
        service_type: isServiceType(ri.service_type)
          ? ri.service_type
          : serviceType,
        name: ri.name,
        parameter_group: ri.parameter_group ?? null,
        category: (ri.category as QAIndicator["category"]) || "none",
        bobot: Number(ri.bobot),
        has_na: ri.has_na ?? false,
        sort_order: ri.sort_order ?? 0,
      }));

      const scoreIdByAnyId = new Map<string, string>();
      for (const snap of snapshotInds as RuleIndicatorSnapshotRow[]) {
        scoreIdByAnyId.set(snap.id, snap.id);
        if (snap.indicator_id) scoreIdByAnyId.set(snap.indicator_id, snap.id);
        if (snap.legacy_indicator_id)
          scoreIdByAnyId.set(snap.legacy_indicator_id, snap.id);
      }

      const weight: ServiceWeight = {
        service_type: serviceType,
        critical_weight: Number(activeVersion.critical_weight),
        non_critical_weight: Number(activeVersion.non_critical_weight),
        scoring_mode: activeVersion.scoring_mode,
      };

      return { indicators, weight, scoreIdByAnyId };
    }
  }

  const filtered = fallbackIndicators.filter(
    (i) => i.service_type === serviceType,
  );
  if (filtered.length === 0) {
    throw new Error(
      `Tidak ada indikator untuk layanan ${serviceType} pada periode ${periodId}`,
    );
  }

  const scoreIdByAnyId = new Map<string, string>();
  for (const ind of filtered) {
    scoreIdByAnyId.set(ind.id, ind.id);
  }

  return {
    indicators: filtered,
    weight: fallbackWeight,
    scoreIdByAnyId,
  };
}

export function normalizePeriodScoringRows(
  rows: PeriodScoringRow[],
  context: PeriodScoringContext,
): {
  indicator_id: string;
  nilai: number;
  no_tiket?: string | null;
  created_at?: string;
  period_id?: string;
}[] {
  return rows.flatMap((row) => {
    if (typeof row.nilai !== "number") return [];
    const rawId = row.rule_indicator_id || row.indicator_id;
    const indicatorId = context.scoreIdByAnyId.get(rawId) ?? rawId;
    return [
      {
        indicator_id: indicatorId,
        nilai: row.nilai,
        no_tiket: row.no_tiket ?? null,
        created_at: row.created_at,
        period_id: row.period_id,
      },
    ];
  });
}

export function mergeServiceWeights(
  defaults: Record<ServiceType, ServiceWeight>,
  overrides: ServiceWeightOverride[],
): Record<ServiceType, ServiceWeight> {
  const result: Record<ServiceType, ServiceWeight> = { ...defaults };
  for (const w of overrides) {
    if (!isServiceType(w.service_type)) continue;
    const current = result[w.service_type];
    result[w.service_type] = {
      service_type: w.service_type,
      critical_weight: Number(w.critical_weight ?? current.critical_weight),
      non_critical_weight: Number(
        w.non_critical_weight ?? current.non_critical_weight,
      ),
      scoring_mode: w.scoring_mode ?? current.scoring_mode,
    };
  }
  return result;
}
