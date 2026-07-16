import { useMemo } from "react";
import type { QAIndicator } from "@trainers/types";

export interface SidakRuleIndicatorRow {
  ruleIndicatorId: string;
  legacyIndicatorId?: string;
  name: string;
  parameter_group?: string | null;
  category: QAIndicator["category"];
  bobot: number;
  has_na: boolean;
  sort_order?: number;
}

export interface SidakInputRuleModel {
  activeIndicators: QAIndicator[];
  unlinkedIndicatorIds: Set<string>;
}

export function buildSidakInputRuleModel(params: {
  ruleIndicatorsRaw: SidakRuleIndicatorRow[];
  globalIndicators: QAIndicator[];
  selectedService: QAIndicator["service_type"];
}): SidakInputRuleModel {
  if (params.ruleIndicatorsRaw.length === 0) {
    return {
      activeIndicators: params.globalIndicators,
      unlinkedIndicatorIds: new Set<string>(),
    };
  }

  const activeIndicators: QAIndicator[] = params.ruleIndicatorsRaw.map(
    (ri) => ({
      id: ri.legacyIndicatorId || ri.ruleIndicatorId,
      service_type: params.selectedService,
      name: ri.name,
      parameter_group: ri.parameter_group ?? null,
      category: ri.category,
      bobot: ri.bobot,
      has_na: ri.has_na,
      ruleIndicatorId: ri.ruleIndicatorId,
      legacyIndicatorId: ri.legacyIndicatorId,
      sort_order: ri.sort_order ?? 0,
    }),
  );

  const unlinkedIndicatorIds = new Set(
    params.ruleIndicatorsRaw
      .filter((ri) => !ri.legacyIndicatorId)
      .map((ri) => ri.ruleIndicatorId),
  );

  return { activeIndicators, unlinkedIndicatorIds };
}

export function useSidakInputRuleModel({
  ruleIndicatorsRaw,
  globalIndicators,
  selectedService,
}: {
  ruleIndicatorsRaw: SidakRuleIndicatorRow[];
  globalIndicators: QAIndicator[];
  selectedService: QAIndicator["service_type"];
}): SidakInputRuleModel {
  return useMemo(
    () =>
      buildSidakInputRuleModel({
        ruleIndicatorsRaw,
        globalIndicators,
        selectedService,
      }),
    [ruleIndicatorsRaw, globalIndicators, selectedService],
  );
}
