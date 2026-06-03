import { supabaseAdmin } from "../../lib/supabase";
import type { QAPeriod, QAIndicator, ServiceType, ResolvedSidakInputConfig } from "@trainers/types";
import { resolveEffectiveRuleVersionForPeriod } from "./rule-version-resolver";
import { DEFAULT_SERVICE_WEIGHTS } from "../../lib/scoring";

export async function getPeriods(): Promise<QAPeriod[]> {
  const { data } = await supabaseAdmin
    .from("qa_periods")
    .select("*")
    .order("year", { ascending: false })
    .order("month", { ascending: false });
  return data ?? [];
}

export async function createPeriod(
  month: number,
  year: number,
): Promise<QAPeriod> {
  const label = `${String(month).padStart(2, "0")}/${year}`;
  const { data, error } = await supabaseAdmin
    .from("qa_periods")
    .insert({ month, year })
    .select()
    .single();
  if (error) throw new Error(`Failed to create period: ${error.message}`);
  return { ...data, label };
}

export async function deletePeriod(id: string): Promise<{ success: boolean }> {
  const [
    { count: temuanCount, error: temuanCheckError },
    { count: ruleCount, error: ruleCheckError },
  ] = await Promise.all([
    supabaseAdmin
      .from("qa_temuan")
      .select("*", { count: "exact", head: true })
      .eq("period_id", id),
    supabaseAdmin
      .from("qa_service_rule_versions")
      .select("*", { count: "exact", head: true })
      .eq("effective_period_id", id),
  ]);

  // Fail closed: never delete a period if validation checks are uncertain.
  if (temuanCheckError || ruleCheckError) {
    throw new Error("Gagal memverifikasi status periode.");
  }

  if (temuanCount !== null && (temuanCount ?? 0) > 0)
    throw new Error(
      "Periode ini sudah memiliki data temuan dan tidak bisa dihapus.",
    );
  if (ruleCount !== null && (ruleCount ?? 0) > 0)
    throw new Error(
      "Periode ini masih digunakan oleh versi aturan QA. Hapus atau pindahkan versi aturan terlebih dahulu.",
    );

  const { error } = await supabaseAdmin
    .from("qa_periods")
    .delete()
    .eq("id", id);
  if (error) throw new Error(`Failed to delete period: ${error.message}`);
  return { success: true };
}

export async function resolveActivePublishedRuleVersion(
  serviceType: string,
): Promise<{ id: string } | null> {
  const { data } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .select("id")
    .eq("service_type", serviceType)
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

export async function hasDraftRuleVersion(
  serviceType: string,
): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .select("*", { count: "exact", head: true })
    .eq("service_type", serviceType)
    .eq("status", "draft");
  return (count ?? 0) > 0;
}

export async function getIndicators(
  serviceType?: string,
): Promise<QAIndicator[]> {
  let query = supabaseAdmin.from("qa_indicators").select("*");
  if (serviceType) query = query.eq("service_type", serviceType);
  const { data } = await query.order("service_type").order("name");
  return data ?? [];
}

export async function createIndicator(indicator: {
  service_type: ServiceType;
  name: string;
  category: "critical" | "non_critical" | "none";
  bobot: number;
  has_na?: boolean;
}): Promise<QAIndicator> {
  const { data, error } = await supabaseAdmin
    .from("qa_indicators")
    .insert(indicator)
    .select()
    .single();
  if (error) throw new Error(`Failed to create indicator: ${error.message}`);
  return data;
}

export async function getResolvedInputConfig(
  serviceType: ServiceType,
  periodId?: string,
): Promise<ResolvedSidakInputConfig> {
  // Check if there is a draft version for warning/alert
  const hasDraft = await hasDraftRuleVersion(serviceType);

  let activeVersion: any = null;
  if (periodId) {
    activeVersion = await resolveEffectiveRuleVersionForPeriod(serviceType, periodId);
  }

  let indicators: any[];
  let weight: any;
  let ruleVersionId: string | null = null;

  if (activeVersion) {
    ruleVersionId = activeVersion.id;
    // Load rule indicators ordered by sort_order
    const { data: ruleIndicators, error: riErr } = await supabaseAdmin
      .from("qa_service_rule_indicators")
      .select("*")
      .eq("rule_version_id", activeVersion.id)
      .order("sort_order", { ascending: true });

    if (riErr) {
      throw new Error(`Failed to load rule indicators: ${riErr.message}`);
    }

    indicators = (ruleIndicators ?? []).map((ri: any) => ({
      id: ri.legacy_indicator_id || ri.id,
      service_type: serviceType,
      name: ri.name,
      category: ri.category || "none",
      bobot: Number(ri.bobot),
      has_na: ri.has_na ?? false,
      threshold: ri.threshold,
      ruleIndicatorId: ri.id,
      legacyIndicatorId: ri.legacy_indicator_id,
    }));

    weight = {
      service_type: serviceType,
      critical_weight: Number(activeVersion.critical_weight),
      non_critical_weight: Number(activeVersion.non_critical_weight),
      scoring_mode: activeVersion.scoring_mode,
    };
  } else {
    // If periodId is provided but no active version is resolved, return empty list of indicators
    if (periodId) {
      indicators = [];
    } else {
      // Fallback to global/master indicators for pre-period preview
      const globalInds = await getIndicators(serviceType);
      indicators = globalInds.map((gi) => ({
        id: gi.id,
        service_type: gi.service_type,
        name: gi.name,
        category: gi.category,
        bobot: Number(gi.bobot),
        has_na: gi.has_na,
        threshold: gi.threshold,
        ruleIndicatorId: null,
        legacyIndicatorId: gi.id,
      }));
    }

    // Resolve weight
    const { data: dbWeight } = await supabaseAdmin
      .from("qa_service_weights")
      .select("*")
      .eq("service_type", serviceType)
      .maybeSingle();

    if (dbWeight) {
      weight = {
        service_type: serviceType,
        critical_weight: Number(dbWeight.critical_weight),
        non_critical_weight: Number(dbWeight.non_critical_weight),
        scoring_mode: dbWeight.scoring_mode,
      };
    } else {
      // Fallback to DEFAULT_SERVICE_WEIGHTS
      const defaultWeight = DEFAULT_SERVICE_WEIGHTS[serviceType];
      if (defaultWeight) {
        weight = {
          service_type: serviceType,
          critical_weight: defaultWeight.critical_weight,
          non_critical_weight: defaultWeight.non_critical_weight,
          scoring_mode: defaultWeight.scoring_mode,
        };
      } else {
        weight = {
          service_type: serviceType,
          critical_weight: 0.5,
          non_critical_weight: 0.5,
          scoring_mode: "weighted",
        };
      }
    }
  }

  return {
    indicators,
    weight,
    ruleVersionId,
    hasDraftVersion: hasDraft,
  };
}
