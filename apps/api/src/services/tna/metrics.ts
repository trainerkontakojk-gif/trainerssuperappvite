import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Category,
  ServiceType,
  TnaInterventionType,
  TnaMetricsSnapshot,
  TnaPeriodMetrics,
  TnaTrendStatus,
} from "@trainers/types";
import { fetchAllPages } from "../../lib/supabase-pagination";
import {
  MAX_SAMPLING,
  getTemuanSessionKey,
  isAgentExcluded,
} from "../../lib/scoring";
import { applyPesertaScope, type DataScope } from "../access/scope";
import { getScoreRows } from "../sidak/dashboard-aggregation";
import { isCountableFinding } from "../sidak/shared-constants";
import {
  CLASS_SPREAD_PCT,
  MIN_AUDITED_AGENTS,
  MIN_FINDINGS,
  SIGNAL_SPREAD_PCT,
  SIGNAL_TREND_PCT,
} from "./thresholds";

/**
 * Mesin metrik TNA D1: parameter x layanan x periode.
 *
 * Tiga bucket dipakai konsisten dengan SIDAK:
 *   - audit presence: semua baris (termasuk phantom) menentukan agent diaudit;
 *   - score rows: baris real bila ada, atau phantom-only, menentukan sesi sampel;
 *   - findings: hanya baris real yang countable (`isCountableFinding`).
 * Agent non-service dikeluarkan memakai `isAgentExcluded`, sehingga baris
 * mereka tidak menambah populasi maupun temuan.
 *
 * Semua query `qa_temuan` memakai `fetchAllPages` + `order("id")` supaya angka
 * tidak terpotong plafon 1.000 baris PostgREST.
 */

export type TnaTemuanRow = {
  id: string;
  peserta_id: string;
  period_id: string;
  indicator_id: string;
  service_type: string;
  nilai: number | null;
  ketidaksesuaian: string | null;
  sebaiknya: string | null;
  no_tiket: string | null;
  is_phantom_padding: boolean | null;
  rule_version_id: string | null;
  rule_indicator_id: string | null;
  created_at: string | null;
  profiler_peserta: {
    nama: string | null;
    tim: string | null;
    batch_name: string | null;
    jabatan: string | null;
  } | null;
};

export type TnaPeriod = { id: string; month: number; year: number };

export type TnaIndicatorMetadata = {
  id: string;
  name: string;
  category: Category;
};

export type TnaRuleIndicatorMetadata = TnaIndicatorMetadata & {
  legacyIndicatorId: string | null;
};

/** Periode yang diminta tidak ada di `qa_periods`. */
export class TnaPeriodNotFoundError extends Error {}

/** Baris temuan menunjuk indikator yang tidak punya metadata sama sekali. */
export class TnaIndicatorUnmappedError extends Error {
  constructor(public readonly indicatorId: string) {
    super(`Indikator ${indicatorId} tidak memiliki metadata`);
  }
}

const SELECT_COLUMNS =
  "id, peserta_id, period_id, indicator_id, service_type, nilai, ketidaksesuaian, sebaiknya, no_tiket, is_phantom_padding, rule_version_id, rule_indicator_id, created_at, profiler_peserta(nama, tim, batch_name, jabatan)";

export async function fetchPeriods(
  supabase: SupabaseClient,
): Promise<TnaPeriod[]> {
  return fetchAllPages<TnaPeriod>({
    build: ({ from, to }) =>
      supabase
        .from("qa_periods")
        .select("id, month, year")
        .order("year", { ascending: true })
        .order("month", { ascending: true })
        .order("id", { ascending: true })
        .range(from, to),
  });
}

export function sortPeriodsChronologically(periods: TnaPeriod[]): TnaPeriod[] {
  return [...periods].sort(
    (a, b) => a.year - b.year || a.month - b.month || a.id.localeCompare(b.id),
  );
}

export async function fetchPeriodRows(args: {
  supabase: SupabaseClient;
  serviceType: ServiceType;
  periodId: string;
  dataScope: DataScope;
}): Promise<TnaTemuanRow[]> {
  const { supabase, serviceType, periodId, dataScope } = args;
  return fetchAllPages<TnaTemuanRow>({
    build: ({ from, to }) => {
      const query = applyPesertaScope(
        supabase
          .from("qa_temuan")
          .select(SELECT_COLUMNS)
          .eq("service_type", serviceType)
          .eq("period_id", periodId)
          .order("id", { ascending: true })
          .range(from, to),
        dataScope,
      );
      return query as never;
    },
  });
}

export interface TnaPeriodBucket {
  period: TnaPeriod;
  rows: TnaTemuanRow[];
  /** Agent non-service sudah dikeluarkan dari himpunan ini. */
  auditedAgentIds: Set<string>;
  auditedRows: TnaTemuanRow[];
  sampledSessions: number;
}

/**
 * Partisi baris satu layanan+periode menjadi populasi audit + temuan.
 * `sampledSessions` = jumlah per agent diaudit dari `max(MAX_SAMPLING, sesi
 * distinct agent)`, memakai kunci sesi yang sama dengan scoring SIDAK.
 */
export function buildPeriodBucket(
  period: TnaPeriod,
  rows: TnaTemuanRow[],
): TnaPeriodBucket {
  const rowsByAgent = new Map<string, TnaTemuanRow[]>();
  for (const row of rows) {
    const agentRows = rowsByAgent.get(row.peserta_id);
    if (agentRows) agentRows.push(row);
    else rowsByAgent.set(row.peserta_id, [row]);
  }

  const auditedAgentIds = new Set<string>();
  let sampledSessions = 0;
  for (const [pesertaId, agentRows] of rowsByAgent) {
    const profile = agentRows[0]?.profiler_peserta;
    if (isAgentExcluded(profile?.tim, profile?.batch_name, profile?.jabatan)) {
      continue;
    }
    auditedAgentIds.add(pesertaId);
    // Guardrail SIDAK #3: sesi mengikuti scoreRows — row real dipakai bila ada,
    // phantom hanya untuk agent phantom-only. Batch `__PHANTOM__<batch>_1..5`
    // tidak boleh menambah sesi sampel agent yang sudah punya row real.
    const scoreRows = getScoreRows(agentRows);
    const sessions = new Set(
      scoreRows.map((row, index) =>
        getTemuanSessionKey(
          {
            no_tiket: row.no_tiket,
            created_at: row.created_at ?? undefined,
            period_id: row.period_id,
          },
          index,
        ),
      ),
    );
    sampledSessions += Math.max(MAX_SAMPLING, sessions.size);
  }

  return {
    period,
    rows,
    auditedAgentIds,
    auditedRows: rows.filter((row) => auditedAgentIds.has(row.peserta_id)),
    sampledSessions,
  };
}

/**
 * Metrik D1 satu parameter pada satu periode. Pembagian dengan nol dilarang:
 * kalau tidak ada agent diaudit, tingkat dan sebaran `null` (bukan `0`).
 */
export function periodMetrics(
  bucket: TnaPeriodBucket,
  indicatorId: string,
): TnaPeriodMetrics {
  const auditedAgents = bucket.auditedAgentIds.size;
  const findings = bucket.auditedRows.filter(
    (row) =>
      row.indicator_id === indicatorId &&
      // Phantom adalah artefak penskoran: tidak pernah menjadi temuan,
      // walau nilainya < 3 atau punya catatan.
      row.is_phantom_padding !== true &&
      isCountableFinding(row),
  );
  const affectedAgents = new Set(findings.map((row) => row.peserta_id)).size;

  return {
    periodId: bucket.period.id,
    auditedAgents,
    sampledSessions: bucket.sampledSessions,
    findings: findings.length,
    affectedAgents,
    ratePer100:
      auditedAgents === 0
        ? null
        : (findings.length / bucket.sampledSessions) * 100,
    spreadPct:
      auditedAgents === 0 ? null : (affectedAgents / auditedAgents) * 100,
    auditStatus: auditedAgents === 0 ? "no_audit" : "audited",
    insufficientData:
      auditedAgents === 0 ||
      auditedAgents < MIN_AUDITED_AGENTS ||
      findings.length < MIN_FINDINGS,
  };
}

export function computeTrend(args: {
  current: TnaPeriodMetrics;
  comparisons: TnaPeriodMetrics[];
}): {
  trendStatus: TnaTrendStatus;
  trendPct: number | null;
  comparisonRatePer100: number | null;
} {
  const rates = args.comparisons
    .map((metrics) => metrics.ratePer100)
    .filter((rate): rate is number => rate !== null);
  const comparisonRatePer100 =
    rates.length === 0
      ? null
      : rates.reduce((sum, rate) => sum + rate, 0) / rates.length;

  if (args.current.auditStatus === "no_audit") {
    return {
      trendStatus: "no_current_audit",
      trendPct: null,
      comparisonRatePer100,
    };
  }
  if (comparisonRatePer100 === null) {
    return {
      trendStatus: "no_comparison_data",
      trendPct: null,
      comparisonRatePer100: null,
    };
  }
  const currentRate = args.current.ratePer100 ?? 0;
  if (comparisonRatePer100 === 0) {
    return {
      trendStatus: currentRate > 0 ? "new_from_zero" : "no_findings_both",
      trendPct: null,
      comparisonRatePer100,
    };
  }
  return {
    trendStatus: "computed",
    trendPct:
      ((currentRate - comparisonRatePer100) / comparisonRatePer100) * 100,
    comparisonRatePer100,
  };
}

export function computeSignals(args: {
  category: Category;
  spreadPct: number | null;
  trendStatus: TnaTrendStatus;
  trendPct: number | null;
}): Array<"tersebar" | "naik" | "kritikal"> {
  const signals: Array<"tersebar" | "naik" | "kritikal"> = [];
  if (args.spreadPct !== null && args.spreadPct >= SIGNAL_SPREAD_PCT) {
    signals.push("tersebar");
  }
  if (
    args.trendStatus === "new_from_zero" ||
    (args.trendStatus === "computed" &&
      (args.trendPct ?? 0) >= SIGNAL_TREND_PCT)
  ) {
    signals.push("naik");
  }
  if (args.category === "critical") signals.push("kritikal");
  return signals;
}

export function suggestedIntervention(
  spreadPct: number | null,
): TnaInterventionType {
  if (spreadPct === null) return "coaching_individu";
  if (spreadPct >= CLASS_SPREAD_PCT) return "kelas";
  if (spreadPct >= SIGNAL_SPREAD_PCT) return "kelompok_kecil";
  return "coaching_individu";
}

export function buildSnapshot(args: {
  bucket: TnaPeriodBucket;
  comparisonBuckets: TnaPeriodBucket[];
  indicatorId: string;
  serviceType: ServiceType;
  parameterName: string;
  category: Category;
  computedAt: string;
}): TnaMetricsSnapshot {
  const current = periodMetrics(args.bucket, args.indicatorId);
  const comparePeriods = args.comparisonBuckets.map((bucket) =>
    periodMetrics(bucket, args.indicatorId),
  );
  const trend = computeTrend({ current, comparisons: comparePeriods });
  const signals = computeSignals({
    category: args.category,
    spreadPct: current.spreadPct,
    trendStatus: trend.trendStatus,
    trendPct: trend.trendPct,
  });

  return {
    metric_version: 1,
    computed_at: args.computedAt,
    serviceType: args.serviceType,
    indicatorId: args.indicatorId,
    parameterName: args.parameterName,
    category: args.category,
    ...current,
    comparePeriods,
    comparisonRatePer100: trend.comparisonRatePer100,
    trendStatus: trend.trendStatus,
    trendPct: trend.trendPct,
    isCandidate:
      !current.insufficientData &&
      current.findings >= MIN_FINDINGS &&
      signals.length > 0,
    signals,
    suggestedIntervention: suggestedIntervention(current.spreadPct),
  };
}

/**
 * Resolusi metadata tampilan per periode (guardrail K8): pakai snapshot rule
 * hanya kalau `legacy_indicator_id`-nya memang parameter master yang sama;
 * selain itu fallback ke `qa_indicators` yang stabil lintas versi.
 */
export function resolveIndicatorMetadata(args: {
  indicatorId: string;
  rows: TnaTemuanRow[];
  master: Map<string, TnaIndicatorMetadata>;
  rules: Map<string, TnaRuleIndicatorMetadata>;
}): TnaIndicatorMetadata {
  for (const row of args.rows) {
    if (row.indicator_id !== args.indicatorId) continue;
    if (!row.rule_version_id || !row.rule_indicator_id) continue;
    const rule = args.rules.get(row.rule_indicator_id);
    if (!rule || rule.legacyIndicatorId !== args.indicatorId) continue;
    return { id: args.indicatorId, name: rule.name, category: rule.category };
  }
  const master = args.master.get(args.indicatorId);
  if (master) return master;
  throw new TnaIndicatorUnmappedError(args.indicatorId);
}
