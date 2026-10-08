import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Category,
  ServiceType,
  TnaMetricsSnapshot,
  TnaParametersResponse,
} from "@trainers/types";
import type { DataScope } from "../access/scope";
import {
  buildPeriodBucket,
  buildSnapshot,
  fetchPeriodRows,
  fetchPeriods,
  resolveIndicatorMetadata,
  sortPeriodsChronologically,
  TnaPeriodNotFoundError,
  type TnaIndicatorMetadata,
  type TnaPeriodBucket,
  type TnaRuleIndicatorMetadata,
  type TnaTemuanRow,
} from "./metrics";

/**
 * Daftar parameter TNA (D1/D6) untuk satu layanan dan periode terpilih.
 *
 * Aturan cakupan:
 *   - `scope=all` menampilkan setiap parameter yang punya baris audit pada
 *     periode terpilih, termasuk parameter dengan 0 temuan supaya status nol
 *     ("audit ada, nol temuan") bisa dibedakan dari "tidak ada audit";
 *   - `scope=candidates` hanya kandidat (temuan >= MIN_FINDINGS + sinyal).
 *   - Kalau periode terpilih tidak punya audit sama sekali, daftar tetap diisi
 *     parameter dari periode pembanding dengan `auditStatus = no_audit` supaya
 *     UI dapat menjelaskan kenapa angka belum bisa dihitung.
 */

export interface ListTnaParametersArgs {
  supabase: SupabaseClient;
  serviceType: ServiceType;
  periodId: string;
  compareCount: number;
  /** D8: menerima DataScope; Fase 1 hanya memanggil dengan `{ kind: "all" }`. */
  dataScope: DataScope;
  listingScope: "candidates" | "all";
  now?: Date;
}

export async function listTnaParameters(
  args: ListTnaParametersArgs,
): Promise<TnaParametersResponse> {
  const { selectedBucket, comparisonBuckets } =
    await loadTnaParameterContext(args);

  const metadataRows: TnaTemuanRow[] = [];
  const indicatorIds = new Set<string>();
  const universeBuckets =
    selectedBucket.auditedAgentIds.size > 0
      ? [selectedBucket]
      : comparisonBuckets;
  for (const bucket of universeBuckets) {
    for (const row of bucket.auditedRows) {
      indicatorIds.add(row.indicator_id);
      metadataRows.push(row);
    }
  }

  const { master, rules } = await loadIndicatorMetadata({
    supabase: args.supabase,
    indicatorIds: [...indicatorIds],
    rows: metadataRows,
  });
  const computedAt = (args.now ?? new Date()).toISOString();

  const items = [...indicatorIds].map((indicatorId) => {
    const metadata = resolveIndicatorMetadata({
      indicatorId,
      rows: metadataRows,
      master,
      rules,
    });
    return buildSnapshot({
      bucket: selectedBucket,
      comparisonBuckets,
      indicatorId,
      serviceType: args.serviceType,
      parameterName: metadata.name,
      category: metadata.category,
      computedAt,
    });
  });

  const visible = items
    .filter((entry) => args.listingScope === "all" || entry.isCandidate)
    .sort(compareParameters);

  return {
    items: visible,
    compare_period_ids: comparisonBuckets.map((bucket) => bucket.period.id),
    selected_audit_status:
      selectedBucket.auditedAgentIds.size > 0 ? "audited" : "no_audit",
    insufficientData:
      visible.length === 0 || visible.every((entry) => entry.insufficientData),
  };
}

/** Shared period selection: list, drill-down and server-side validation agree. */
export async function loadTnaParameterContext(
  args: Omit<ListTnaParametersArgs, "listingScope">,
): Promise<{
  selectedBucket: TnaPeriodBucket;
  comparisonBuckets: TnaPeriodBucket[];
}> {
  const periods = sortPeriodsChronologically(await fetchPeriods(args.supabase));
  const selectedIndex = periods.findIndex((p) => p.id === args.periodId);
  if (selectedIndex === -1) {
    throw new TnaPeriodNotFoundError("Periode tidak ditemukan");
  }
  const selectedPeriod = periods[selectedIndex]!;

  // Periode pembanding: periode sebelumnya yang punya agent diaudit. Periode
  // tanpa audit dilewati, bukan dianggap rata-rata nol.
  const comparisonBuckets: TnaPeriodBucket[] = [];
  for (const period of periods.slice(0, selectedIndex).reverse()) {
    if (comparisonBuckets.length >= args.compareCount) break;
    const rows = await fetchPeriodRows({
      supabase: args.supabase,
      serviceType: args.serviceType,
      periodId: period.id,
      dataScope: args.dataScope,
    });
    const bucket = buildPeriodBucket(period, rows);
    if (bucket.auditedAgentIds.size > 0) comparisonBuckets.push(bucket);
  }

  const selectedRows = await fetchPeriodRows({
    supabase: args.supabase,
    serviceType: args.serviceType,
    periodId: selectedPeriod.id,
    dataScope: args.dataScope,
  });
  const selectedBucket = buildPeriodBucket(selectedPeriod, selectedRows);

  return { selectedBucket, comparisonBuckets };
}

/** D1: kritikal dulu, lalu sebaran, tingkat, nama parameter. */
function compareParameters(
  a: TnaMetricsSnapshot,
  b: TnaMetricsSnapshot,
): number {
  const criticalRank = (entry: TnaMetricsSnapshot) =>
    entry.category === "critical" ? 0 : 1;
  const byCritical = criticalRank(a) - criticalRank(b);
  if (byCritical !== 0) return byCritical;
  const bySpread = (b.spreadPct ?? -1) - (a.spreadPct ?? -1);
  if (bySpread !== 0) return bySpread;
  const byRate = (b.ratePer100 ?? -1) - (a.ratePer100 ?? -1);
  if (byRate !== 0) return byRate;
  return a.parameterName.localeCompare(b.parameterName);
}

export async function loadIndicatorMetadata(args: {
  supabase: SupabaseClient;
  indicatorIds: string[];
  rows: TnaTemuanRow[];
}): Promise<{
  master: Map<string, TnaIndicatorMetadata>;
  rules: Map<string, TnaRuleIndicatorMetadata>;
}> {
  const master = new Map<string, TnaIndicatorMetadata>();
  const rules = new Map<string, TnaRuleIndicatorMetadata>();
  if (args.indicatorIds.length === 0) return { master, rules };

  const { data: masterRows, error: masterError } = await args.supabase
    .from("qa_indicators")
    .select("id, name, category")
    .in("id", args.indicatorIds);
  if (masterError) throw masterError;
  for (const row of masterRows ?? []) {
    master.set(row.id, {
      id: row.id,
      name: row.name,
      category: row.category as Category,
    });
  }

  const ruleIds = [
    ...new Set(
      args.rows
        .map((row) => row.rule_indicator_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (ruleIds.length > 0) {
    const { data: ruleRows, error: ruleError } = await args.supabase
      .from("qa_service_rule_indicators")
      .select("id, name, category, legacy_indicator_id")
      .in("id", ruleIds);
    if (ruleError) throw ruleError;
    for (const row of ruleRows ?? []) {
      rules.set(row.id, {
        id: row.id,
        name: row.name,
        category: row.category as Category,
        legacyIndicatorId: row.legacy_indicator_id,
      });
    }
  }

  return { master, rules };
}
