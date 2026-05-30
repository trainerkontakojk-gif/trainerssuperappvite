import { supabaseAdmin } from "../../lib/supabase";
import type { QAPeriod, QAIndicator, ServiceType } from "@trainers/types";

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
