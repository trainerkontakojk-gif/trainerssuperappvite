import { supabaseAdmin } from "../../lib/supabase";

export interface EffectiveRuleVersion {
  id: string;
  service_type: string;
  effective_period_id: string;
  critical_weight: number;
  non_critical_weight: number;
  scoring_mode: "weighted" | "flat" | "no_category";
}

export async function resolveEffectiveRuleVersionForPeriod(
  serviceType: string,
  periodId: string,
): Promise<EffectiveRuleVersion | null> {
  // 1. Get target period details
  const { data: targetPeriod, error: pErr } = await supabaseAdmin
    .from("qa_periods")
    .select("id, month, year")
    .eq("id", periodId)
    .maybeSingle();

  if (pErr) throw new Error(`Gagal memuat periode target: ${pErr.message}`);
  if (!targetPeriod) return null;

  // 2. Get all published versions for this service type
  const { data: versions, error: vErr } = await supabaseAdmin
    .from("qa_service_rule_versions")
    .select("*, qa_periods(id, month, year)")
    .eq("service_type", serviceType)
    .eq("status", "published");

  if (vErr) throw new Error(`Gagal memuat versi aturan: ${vErr.message}`);
  if (!versions || versions.length === 0) return null;

  // 3. Filter to versions whose effective period is before or equal to target period
  const eligibleVersions = versions.filter((v: any) => {
    const effPeriod = v.qa_periods;
    if (!effPeriod) return false;
    if (effPeriod.year < targetPeriod.year) return true;
    if (effPeriod.year === targetPeriod.year && effPeriod.month <= targetPeriod.month) return true;
    return false;
  });

  if (eligibleVersions.length === 0) return null;

  // 4. Sort: newest effective period first, version_number desc, published_at/created_at desc
  eligibleVersions.sort((a: any, b: any) => {
    const aPeriod = a.qa_periods;
    const bPeriod = b.qa_periods;

    const yearDiff = bPeriod.year - aPeriod.year;
    if (yearDiff !== 0) return yearDiff;

    const monthDiff = bPeriod.month - aPeriod.month;
    if (monthDiff !== 0) return monthDiff;

    if (b.version_number !== a.version_number) {
      return b.version_number - a.version_number;
    }

    const bTime = b.published_at ? new Date(b.published_at).getTime() : new Date(b.created_at).getTime();
    const aTime = a.published_at ? new Date(a.published_at).getTime() : new Date(a.created_at).getTime();
    return bTime - aTime;
  });

  const bestVersion = eligibleVersions[0];

  return {
    id: bestVersion.id,
    service_type: bestVersion.service_type,
    effective_period_id: bestVersion.effective_period_id,
    critical_weight: Number(bestVersion.critical_weight),
    non_critical_weight: Number(bestVersion.non_critical_weight),
    scoring_mode: bestVersion.scoring_mode,
  };
}
