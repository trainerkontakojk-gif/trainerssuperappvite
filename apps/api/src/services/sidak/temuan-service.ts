import { supabaseAdmin } from "../../lib/supabase";
import { fetchAllPages } from "../../lib/supabase-pagination";
import { roundTo } from "../../lib/math-utils";
import { isCountableFinding } from "./shared-constants";
import { getIndicators } from "./period-indicator";
import { getScoreRows } from "./dashboard-aggregation";
import {
  calculateQAScoreFromTemuan,
  DEFAULT_SERVICE_WEIGHTS,
  isServiceType,
} from "../../lib/scoring";
import { resolveEffectiveRuleVersionForPeriod } from "./rule-version-resolver";
import {
  loadPeriodScoringContext,
  normalizePeriodScoringRows,
} from "./period-scoring-context";
import type { QATemuan, ServiceType, ServiceWeight } from "@trainers/types";
import type { DashboardTemuanRow } from "./dashboard-types";

export interface ValidationError {
  indicator_id: string;
  error: string;
}

export interface PreviewResult {
  valid: {
    indicator_id: string;
    nilai: number;
    ketidaksesuaian?: string | null;
    sebaiknya?: string | null;
    no_tiket?: string | null;
  }[];
  invalid: ValidationError[];
  skipped: {
    indicator_id: string;
    nilai: number;
    ketidaksesuaian?: string | null;
    sebaiknya?: string | null;
    no_tiket?: string | null;
  }[];
  stats: { valid_count: number; invalid_count: number; skipped_count: number };
  active_rule_version_id?: string | null;
}

export async function getTemuan(params: {
  peserta_id?: string;
  period_id?: string;
  service_type?: string;
  limit?: number;
  offset?: number;
  agent_ids?: string[];
}): Promise<{ data: QATemuan[]; total: number }> {
  let query = supabaseAdmin.from("qa_temuan").select("*", { count: "exact" });

  if (params.peserta_id) query = query.eq("peserta_id", params.peserta_id);
  if (params.period_id) query = query.eq("period_id", params.period_id);
  if (params.service_type)
    query = query.eq("service_type", params.service_type);
  if (params.agent_ids && params.agent_ids.length > 0)
    query = query.in("peserta_id", params.agent_ids);

  query = query.order("created_at", { ascending: false });

  if (params.limit)
    query = query.range(
      params.offset ?? 0,
      (params.offset ?? 0) + params.limit - 1,
    );

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to get temuan: ${error.message}`);
  return { data: data ?? [], total: count ?? 0 };
}

export async function createPerfectScoreSession(
  peserta_id: string,
  period_id: string,
  service_type: ServiceType,
): Promise<QATemuan[]> {
  const { data: periodInfo } = await supabaseAdmin
    .from("qa_periods")
    .select("year")
    .eq("id", period_id)
    .single();
  const periodYear = periodInfo?.year ?? new Date().getFullYear();

  const { count: existingCount } = await supabaseAdmin
    .from("qa_temuan")
    .select("id", { count: "exact", head: true })
    .eq("peserta_id", peserta_id)
    .eq("period_id", period_id)
    .eq("service_type", service_type)
    .eq("is_phantom_padding", true);
  if ((existingCount ?? 0) > 0) {
    throw new Error("Sesi tanpa temuan untuk periode ini sudah pernah dibuat.");
  }

  const activeVersion = await resolveEffectiveRuleVersionForPeriod(
    service_type,
    period_id,
  );
  let indicators: { id: string; rule_indicator_id: string | null }[];
  let rule_version_id: string | null = null;

  if (activeVersion) {
    const { data: ruleIndicators } = await supabaseAdmin
      .from("qa_service_rule_indicators")
      .select("id, indicator_id")
      .eq("rule_version_id", activeVersion.id);
    if (ruleIndicators && ruleIndicators.length > 0) {
      indicators = ruleIndicators.map((ri: any) => ({
        id: ri.indicator_id,
        rule_indicator_id: ri.id,
      }));
      rule_version_id = activeVersion.id;
    } else {
      const { data: inds } = await supabaseAdmin
        .from("qa_indicators")
        .select("id")
        .eq("service_type", service_type);
      if (!inds || inds.length === 0)
        throw new Error("Tidak ada parameter untuk tim agent ini");
      indicators = inds.map((i: any) => ({
        id: i.id,
        rule_indicator_id: null,
      }));
    }
  } else {
    const { data: inds } = await supabaseAdmin
      .from("qa_indicators")
      .select("id")
      .eq("service_type", service_type);
    if (!inds || inds.length === 0)
      throw new Error("Tidak ada parameter untuk tim agent ini");
    indicators = inds.map((i: any) => ({ id: i.id, rule_indicator_id: null }));
  }

  if (indicators.length === 0)
    throw new Error("Tidak ada parameter untuk tim agent ini");

  const phantomBatchId = crypto.randomUUID();
  const PADDING_COUNT = 5;
  const rows = Array.from({ length: PADDING_COUNT }).flatMap((_, sessionIdx) =>
    indicators.map((ind) => ({
      peserta_id,
      period_id,
      tahun: periodYear,
      indicator_id: ind.id,
      rule_version_id,
      rule_indicator_id: ind.rule_indicator_id,
      no_tiket: `__PHANTOM__${phantomBatchId}_${sessionIdx + 1}`,
      nilai: 3,
      service_type,
      is_phantom_padding: true,
      phantom_batch_id: phantomBatchId,
    })),
  );

  const { data, error } = await supabaseAdmin
    .from("qa_temuan")
    .insert(rows)
    .select();

  if (error) {
    if (error.message.includes("foreign key")) {
      throw new Error(
        "Data tidak valid: pastikan agent, periode, dan indikator sudah benar",
      );
    }
    throw new Error(`Gagal membuat sesi tanpa temuan: ${error.message}`);
  }

  return data ?? [];
}

export async function validateTemuanBatch(items: {
  peserta_id: string;
  period_id: string;
  service_type: ServiceType;
  no_tiket?: string | null;
  items: {
    indicator_id: string;
    nilai: number;
    ketidaksesuaian?: string | null;
    sebaiknya?: string | null;
    no_tiket?: string | null;
  }[];
}): Promise<PreviewResult> {
  const [activeVersion, validIndicators, existing] = await Promise.all([
    resolveEffectiveRuleVersionForPeriod(items.service_type, items.period_id),

    supabaseAdmin
      .from("qa_indicators")
      .select("id, name, service_type")
      .in(
        "id",
        items.items.map((i) => i.indicator_id),
      ),
    supabaseAdmin
      .from("qa_temuan")
      .select("no_tiket, indicator_id, service_type")
      .eq("period_id", items.period_id)
      .eq("peserta_id", items.peserta_id)
      .eq("service_type", items.service_type)
      .eq("is_phantom_padding", false),
  ]);

  const indicatorMap = new Map(
    (validIndicators?.data ?? []).map((i: any) => [i.id, i]),
  );
  const existingKeys = new Set(
    (existing?.data ?? [])
      .filter((e: any) => e.no_tiket?.trim())
      .map(
        (e: any) =>
          `${e.no_tiket.trim().toLowerCase()}::${e.indicator_id}::${e.service_type}`,
      ),
  );

  let validLegacyIds: Set<string> | null = null;

  if (activeVersion) {
    const { data: ruleIndicators } = await supabaseAdmin
      .from("qa_service_rule_indicators")
      .select("legacy_indicator_id")
      .eq("rule_version_id", activeVersion.id)
      .not("legacy_indicator_id", "is", null);
    if (ruleIndicators && ruleIndicators.length > 0) {
      validLegacyIds = new Set(
        ruleIndicators.map((ri: any) => ri.legacy_indicator_id),
      );
    }
  }

  const valid: PreviewResult["valid"] = [];
  const invalid: ValidationError[] = [];
  const skipped: PreviewResult["skipped"] = [];
  const seenInBatch = new Set<string>();

  for (const item of items.items) {
    const ind = indicatorMap.get(item.indicator_id);

    if (!ind) {
      invalid.push({
        indicator_id: item.indicator_id,
        error: "Indikator tidak ditemukan di database",
      });
      continue;
    }
    if (ind.service_type !== items.service_type) {
      invalid.push({
        indicator_id: item.indicator_id,
        error: `Indikator "${ind.name}" milik layanan ${ind.service_type}, bukan ${items.service_type}`,
      });
      continue;
    }
    if (validLegacyIds && !validLegacyIds.has(item.indicator_id)) {
      invalid.push({
        indicator_id: item.indicator_id,
        error: `Indikator "${ind.name}" tidak termasuk dalam versi aturan QA yang sedang aktif. Periksa parameter di halaman Settings QA.`,
      });
      continue;
    }

    const itemTicket = (item.no_tiket ?? items.no_tiket ?? "").trim();
    if (itemTicket) {
      const key = `${itemTicket.toLowerCase()}::${item.indicator_id}::${items.service_type}`;
      if (existingKeys.has(key) || seenInBatch.has(key)) {
        skipped.push(item);
        continue;
      }
      seenInBatch.add(key);
    }

    valid.push(item);
  }

  return {
    valid,
    invalid,
    skipped,
    stats: {
      valid_count: valid.length,
      invalid_count: invalid.length,
      skipped_count: skipped.length,
    },
    active_rule_version_id: activeVersion?.id ?? null,
  };
}

export async function createTemuanBatch(
  items: {
    peserta_id: string;
    period_id: string;
    service_type: ServiceType;
    no_tiket?: string | null;
    items: {
      indicator_id: string;
      nilai: number;
      ketidaksesuaian?: string | null;
      sebaiknya?: string | null;
      no_tiket?: string | null;
    }[];
  },
  userId?: string,
  userName?: string,
): Promise<{ inserted: number; skipped: number; total: number }> {
  const validation = await validateTemuanBatch(items);

  if (validation.valid.length === 0) {
    if (userId) {
      await supabaseAdmin.from("activity_logs").insert({
        user_id: userId,
        user_name: userName,
        action: "upload_sidak_batch",
        module: "sidak",
        type: "upload_skipped",
      });
    }
    return {
      inserted: 0,
      skipped: validation.stats.skipped_count,
      total: items.items.length,
    };
  }

  const ruleVersionId = validation.active_rule_version_id ?? null;

  const rows = validation.valid.map((item) => {
    const rawTicket = item.no_tiket ?? items.no_tiket ?? null;
    const trimmedTicket = rawTicket ? rawTicket.trim() : null;
    return {
      peserta_id: items.peserta_id,
      period_id: items.period_id,
      indicator_id: item.indicator_id,
      service_type: items.service_type,
      no_tiket: trimmedTicket || null,
      nilai: item.nilai,
      ketidaksesuaian: item.ketidaksesuaian ?? null,
      sebaiknya: item.sebaiknya ?? null,
      rule_version_id: ruleVersionId,
    };
  });

  const { data, error } = await supabaseAdmin
    .from("qa_temuan")
    .insert(rows)
    .select();

  if (error) {
    if (error.message.includes("foreign key")) {
      throw new Error(
        "Data tidak valid: pastikan agent, periode, dan indikator sudah benar",
      );
    }
    throw new Error(`Gagal menyimpan temuan: ${error.message}`);
  }

  if (userId) {
    await supabaseAdmin.from("activity_logs").insert({
      user_id: userId,
      user_name: userName,
      action: "upload_sidak_batch",
      module: "sidak",
      type: "upload",
    });
  }

  if (data && data.length > 0) {
    refreshDashboardSummary(items.period_id, items.service_type).catch(
      (err) => {
        console.error("Summary refresh failed:", err);
      },
    );

    // Refresh materialized view concurrently
    refreshMaterializedView().catch((err) => {
      console.error("Materialized view refresh failed:", err);
    });
  }

  return {
    inserted: data?.length ?? 0,
    skipped: validation.stats.skipped_count,
    total: items.items.length,
  };
}

export async function refreshMaterializedView(): Promise<void> {
  const { error } = await supabaseAdmin.rpc("refresh_mv_qa_period_summary");
  if (error) {
    throw new Error(`MV refresh error: ${error.message}`);
  }
}

export async function refreshDashboardSummary(
  periodId: string,
  serviceType?: string,
) {
  const [indicators, weights] = await Promise.all([
    getIndicators(serviceType),
    supabaseAdmin.from("qa_service_weights").select("*"),
  ]);

  const weightMap = (weights?.data ?? []).reduce(
    (acc: Partial<Record<ServiceType, ServiceWeight>>, w: ServiceWeight) => {
      acc[w.service_type] = w;
      return acc;
    },
    {},
  );

  const allTemuan = await fetchAllPages<RefreshDashboardRow>({
    build: ({ from, to }) => {
      let q = supabaseAdmin
        .from("qa_temuan")
        .select("*, profiler_peserta!inner(id, nama, batch_name, tim, jabatan)")
        .eq("period_id", periodId)
        .order("id", { ascending: true })
        .range(from, to);

      if (serviceType) q = q.eq("service_type", serviceType);

      return q;
    },
  });
  type RefreshDashboardRow = DashboardTemuanRow & {
    profiler_peserta?: {
      nama?: string | null;
      batch_name?: string | null;
      tim?: string | null;
      jabatan?: string | null;
    } | null;
  };
  const rows = allTemuan;

  if (rows.length === 0) {
    return {
      message: "No data to summarize",
      period_id: periodId,
      agent_count: 0,
    };
  }

  const agentMap = new Map<
    string,
    {
      id: string;
      nama: string;
      batch_name: string;
      tim: string;
      jabatan: string;
      rows: RefreshDashboardRow[];
    }
  >();

  for (const row of rows) {
    const pid = row.peserta_id;
    if (!agentMap.has(pid)) {
      const p = row.profiler_peserta;
      agentMap.set(pid, {
        id: pid,
        nama: p?.nama ?? "Unknown",
        batch_name: p?.batch_name ?? "",
        tim: p?.tim ?? "",
        jabatan: p?.jabatan ?? "",
        rows: [],
      });
    }
    agentMap.get(pid)!.rows.push(row);
  }

  const auditedAgents = Array.from(agentMap.values());
  const svc = serviceType ?? auditedAgents[0]?.rows[0]?.service_type ?? "call";

  let totalFindings = 0;
  let totalScore = 0;
  let zeroErrorCount = 0;
  let complianceCount = 0;
  const complianceThreshold = 95;

  const agentRows: {
    agent_id: string;
    period_id: string;
    service_type: string;
    final_score: number;
    non_critical_score: number;
    critical_score: number;
    session_count: number;
    findings_count: number;
  }[] = [];

  const contextCache = new Map<
    string,
    Awaited<ReturnType<typeof loadPeriodScoringContext>>
  >();

  for (const agent of auditedAgents) {
    const rawAgentService = agent.rows[0]?.service_type ?? svc;
    if (!isServiceType(rawAgentService)) {
      throw new Error(`Layanan SIDAK tidak valid: ${rawAgentService}`);
    }
    const agentSvc = rawAgentService;
    const comboKey = `${agentSvc}:${periodId}`;

    if (!contextCache.has(comboKey)) {
      const fallbackWeight =
      weightMap[agentSvc] ??
        DEFAULT_SERVICE_WEIGHTS[agentSvc] ??
      DEFAULT_SERVICE_WEIGHTS.call;
      const ctx = await loadPeriodScoringContext(
        agentSvc,
        periodId,
        indicators,
        fallbackWeight,
      );
      contextCache.set(comboKey, ctx);
    }

    const ctx = contextCache.get(comboKey)!;
    const weight = ctx.weight;
    const scoreRows = getScoreRows(agent.rows);
    const normalizedRows = normalizePeriodScoringRows(scoreRows, ctx);
    const score = calculateQAScoreFromTemuan(
      ctx.indicators,
      normalizedRows,
      weight,
    );

    const findingRows = agent.rows.filter((r) => isCountableFinding(r));
    const agentFindings = findingRows.length;
    totalFindings += agentFindings;
    totalScore += score.finalScore;

    if (agentFindings === 0) zeroErrorCount++;
    if (score.finalScore >= complianceThreshold) complianceCount++;

    agentRows.push({
      agent_id: agent.id,
      period_id: periodId,
      service_type: agentSvc,
      final_score: score.finalScore,
      non_critical_score: score.nonCriticalScore,
      critical_score: score.criticalScore,
      session_count: score.sessionCount,
      findings_count: agentFindings,
    });
  }

  const totalAgents = auditedAgents.length;

  const { error: clearAgentsErr } = await supabaseAdmin
    .from("qa_dashboard_agent_period_summary")
    .delete()
    .eq("period_id", periodId)
    .eq("service_type", svc);
  if (clearAgentsErr)
    throw new Error(
      `Gagal membersihkan cache agent: ${clearAgentsErr.message}`,
    );

  const { error: clearPeriodErr } = await supabaseAdmin
    .from("qa_dashboard_period_summary")
    .delete()
    .eq("period_id", periodId)
    .eq("service_type", svc);
  if (clearPeriodErr)
    throw new Error(
      `Gagal membersihkan cache periode: ${clearPeriodErr.message}`,
    );

  const { error: saveAgentsErr } = await supabaseAdmin
    .from("qa_dashboard_agent_period_summary")
    .insert(agentRows);
  if (saveAgentsErr)
    throw new Error(`Gagal menyimpan cache agent: ${saveAgentsErr.message}`);

  const periodSummary = {
    period_id: periodId,
    service_type: svc,
    total_agents: totalAgents,
    total_defects: totalFindings,
    avg_defects_per_audit: roundTo(
      totalAgents > 0 ? totalFindings / totalAgents : 0,
      2,
    ),
    zero_error_rate: roundTo(
      totalAgents > 0 ? (zeroErrorCount / totalAgents) * 100 : 0,
      2,
    ),
    avg_agent_score: roundTo(totalAgents > 0 ? totalScore / totalAgents : 0, 2),
    compliance_rate: roundTo(
      totalAgents > 0 ? (complianceCount / totalAgents) * 100 : 0,
      2,
    ),
    compliance_count: complianceCount,
  };

  const { error: periodErr } = await supabaseAdmin
    .from("qa_dashboard_period_summary")
    .insert(periodSummary);
  if (periodErr)
    throw new Error(`Gagal menyimpan cache periode: ${periodErr.message}`);

  return {
    message: "Summary refreshed",
    period_id: periodId,
    agent_count: totalAgents,
  };
}

export async function updateTemuan(
  id: string,
  updates: {
    nilai?: number;
    ketidaksesuaian?: string | null;
    sebaiknya?: string | null;
  },
) {
  const { data, error } = await supabaseAdmin
    .from("qa_temuan")
    .update(updates)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(`Gagal update temuan: ${error.message}`);
  return data;
}

export async function deleteTemuan(id: string) {
  const { error } = await supabaseAdmin.from("qa_temuan").delete().eq("id", id);
  if (error) throw new Error(`Gagal hapus temuan: ${error.message}`);
}
