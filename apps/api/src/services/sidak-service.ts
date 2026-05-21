import { supabaseAdmin } from '../lib/supabase';
import { calculateQAScoreFromTemuan, DEFAULT_SERVICE_WEIGHTS, SERVICE_LABELS } from '../lib/scoring';
import type {
  QAIndicator, QAPeriod, QATemuan, ServiceType,
  DashboardSummary, DashboardData, AgentDetailData,
  AgentPeriodSummary, TopAgentData, ParetoData,
} from '@trainers/types';

const TRAINER_ROLES = ['admin', 'trainer', 'qa'] as const;
const LEADER_ROLES = ['tl', 'spv', 'om'] as const;

export async function getAccessibleAgentIds(userId: string, role: string): Promise<string[] | null> {
  if ((TRAINER_ROLES as readonly string[]).includes(role)) return null;

  if (role === 'agent') {
    const { data } = await supabaseAdmin
      .from('profiler_peserta')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();
    return data ? [data.id] : [];
  }

  if ((LEADER_ROLES as readonly string[]).includes(role)) {
    const { data: requests } = await supabaseAdmin
      .from('leader_access_requests')
      .select('id')
      .eq('leader_user_id', userId)
      .eq('status', 'approved')
      .eq('module', 'sidak');

    if (!requests || requests.length === 0) return [];

    const requestIds = requests.map(r => r.id);
    const { data: groupLinks } = await supabaseAdmin
      .from('leader_access_request_groups')
      .select('access_group_id')
      .in('request_id', requestIds);

    if (!groupLinks || groupLinks.length === 0) return [];
    const groupIds = [...new Set(groupLinks.map(g => g.access_group_id))];

    const { data: items } = await supabaseAdmin
      .from('access_group_items')
      .select('field_name, field_value')
      .in('access_group_id', groupIds)
      .eq('is_active', true);

    if (!items || items.length === 0) return [];

    const directIds: string[] = [];
    const batchNames: string[] = [];
    const tims: string[] = [];

    for (const item of items) {
      if (item.field_name === 'peserta_id') directIds.push(item.field_value);
      else if (item.field_name === 'batch_name') batchNames.push(item.field_value);
      else if (item.field_name === 'tim') tims.push(item.field_value);
    }

    const resolvedIds = [...directIds];

    if (batchNames.length > 0) {
      const { data: batchData } = await supabaseAdmin
        .from('profiler_peserta')
        .select('id')
        .in('batch_name', batchNames);
      if (batchData) resolvedIds.push(...batchData.map(b => b.id));
    }

    if (tims.length > 0) {
      const { data: timData } = await supabaseAdmin
        .from('profiler_peserta')
        .select('id')
        .in('tim', tims);
      if (timData) resolvedIds.push(...timData.map(t => t.id));
    }

    return [...new Set(resolvedIds)];
  }

  return [];
}

function roundTo(value: number, digits: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
}

function hasMeaningfulNote(value: string | null | undefined) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isCountableFinding(item: { nilai?: number | null; ketidaksesuaian?: string | null; sebaiknya?: string | null } | null | undefined): boolean {
  if (!item) return false;
  return Number(item.nilai ?? 3) < 3 || hasMeaningfulNote(item.ketidaksesuaian) || hasMeaningfulNote(item.sebaiknya);
}

// ── Periods ────────────────────────────────────────────────

export async function getPeriods(): Promise<QAPeriod[]> {
  const { data } = await supabaseAdmin
    .from('qa_periods')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false });
  return data ?? [];
}

export async function createPeriod(month: number, year: number): Promise<QAPeriod> {
  const label = `${String(month).padStart(2, '0')}/${year}`;
  const { data, error } = await supabaseAdmin
    .from('qa_periods')
    .insert({ month, year })
    .select()
    .single();
  if (error) throw new Error(`Failed to create period: ${error.message}`);
  return { ...data, label };
}

// ── Indicators ─────────────────────────────────────────────

export async function getIndicators(serviceType?: string): Promise<QAIndicator[]> {
  let query = supabaseAdmin.from('qa_indicators').select('*');
  if (serviceType) query = query.eq('service_type', serviceType);
  const { data } = await query.order('service_type').order('name');
  return data ?? [];
}

export async function createIndicator(indicator: {
  service_type: ServiceType;
  name: string;
  category: 'critical' | 'non_critical' | 'none';
  bobot: number;
  has_na?: boolean;
}): Promise<QAIndicator> {
  const { data, error } = await supabaseAdmin
    .from('qa_indicators')
    .insert(indicator)
    .select()
    .single();
  if (error) throw new Error(`Failed to create indicator: ${error.message}`);
  return data;
}

// ── Temuan ─────────────────────────────────────────────────

export async function getTemuan(params: {
  peserta_id?: string;
  period_id?: string;
  service_type?: string;
  limit?: number;
  offset?: number;
  agent_ids?: string[];
}): Promise<{ data: QATemuan[]; total: number }> {
  let query = supabaseAdmin
    .from('qa_temuan')
    .select('*', { count: 'exact' });

  if (params.peserta_id) query = query.eq('peserta_id', params.peserta_id);
  if (params.period_id) query = query.eq('period_id', params.period_id);
  if (params.service_type) query = query.eq('service_type', params.service_type);
  if (params.agent_ids && params.agent_ids.length > 0) query = query.in('peserta_id', params.agent_ids);

  query = query.order('created_at', { ascending: false });

  if (params.limit) query = query.range(params.offset ?? 0, (params.offset ?? 0) + params.limit - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to get temuan: ${error.message}`);
  return { data: data ?? [], total: count ?? 0 };
}

export interface ValidationError {
  indicator_id: string;
  error: string;
}

export interface PreviewResult {
  valid: { indicator_id: string; nilai: number; ketidaksesuaian?: string | null; sebaiknya?: string | null }[];
  invalid: ValidationError[];
  skipped: { indicator_id: string; nilai: number; ketidaksesuaian?: string | null; sebaiknya?: string | null }[];
  stats: { valid_count: number; invalid_count: number; skipped_count: number };
}

export async function validateTemuanBatch(
  items: {
    peserta_id: string;
    period_id: string;
    service_type: ServiceType;
    items: { indicator_id: string; nilai: number; ketidaksesuaian?: string | null; sebaiknya?: string | null }[];
  },
): Promise<PreviewResult> {
  const [activeVersion, validIndicators, existing] = await Promise.all([
    supabaseAdmin
      .from('qa_service_rule_versions')
      .select('id')
      .eq('service_type', items.service_type)
      .eq('status', 'published')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('qa_indicators')
      .select('id, name, service_type')
      .in('id', items.items.map(i => i.indicator_id)),
    supabaseAdmin
      .from('qa_temuan')
      .select('indicator_id')
      .eq('period_id', items.period_id)
      .eq('peserta_id', items.peserta_id),
  ]);

  const indicatorMap = new Map((validIndicators?.data ?? []).map((i: any) => [i.id, i]));
  const existingIndicatorIds = new Set((existing?.data ?? []).map((e: any) => e.indicator_id));

  let validLegacyIds: Set<string> | null = null;

  if (activeVersion?.data) {
    const { data: ruleIndicators } = await supabaseAdmin
      .from('qa_service_rule_indicators')
      .select('legacy_indicator_id')
      .eq('rule_version_id', activeVersion.data.id)
      .not('legacy_indicator_id', 'is', null);
    if (ruleIndicators && ruleIndicators.length > 0) {
      validLegacyIds = new Set(ruleIndicators.map((ri: any) => ri.legacy_indicator_id));
    }
  }

  const valid: PreviewResult['valid'] = [];
  const invalid: ValidationError[] = [];
  const skipped: PreviewResult['skipped'] = [];

  for (const item of items.items) {
    const ind = indicatorMap.get(item.indicator_id);

    if (!ind) {
      invalid.push({ indicator_id: item.indicator_id, error: 'Indikator tidak ditemukan di database' });
      continue;
    }
    if (ind.service_type !== items.service_type) {
      invalid.push({ indicator_id: item.indicator_id, error: `Indikator "${ind.name}" milik layanan ${ind.service_type}, bukan ${items.service_type}` });
      continue;
    }
    if (validLegacyIds && !validLegacyIds.has(item.indicator_id)) {
      invalid.push({ indicator_id: item.indicator_id, error: `Indikator "${ind.name}" tidak termasuk dalam versi aturan aktif` });
      continue;
    }
    if (existingIndicatorIds.has(item.indicator_id)) {
      skipped.push(item);
      continue;
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
  };
}

export async function createTemuanBatch(
  items: {
    peserta_id: string;
    period_id: string;
    service_type: ServiceType;
    no_tiket?: string | null;
    items: { indicator_id: string; nilai: number; ketidaksesuaian?: string | null; sebaiknya?: string | null }[];
  },
  userId?: string,
  userName?: string,
): Promise<{ inserted: number; skipped: number; total: number }> {
  const validation = await validateTemuanBatch(items);

  if (validation.valid.length === 0) {
    if (userId) {
      await supabaseAdmin.from('activity_logs').insert({
        user_id: userId,
        user_name: userName,
        action: 'upload_sidak_batch',
        module: 'sidak',
        type: 'upload_skipped',
      });
    }
    return { inserted: 0, skipped: validation.stats.skipped_count, total: items.items.length };
  }

  // Resolve rule version id again for insert
  let ruleVersionId: string | null = null;
  const { data: activeVersion } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .select('id')
    .eq('service_type', items.service_type)
    .eq('status', 'published')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeVersion) ruleVersionId = activeVersion.id;

  const rows = validation.valid.map(item => ({
    peserta_id: items.peserta_id,
    period_id: items.period_id,
    indicator_id: item.indicator_id,
    service_type: items.service_type,
    no_tiket: items.no_tiket ?? null,
    nilai: item.nilai,
    ketidaksesuaian: item.ketidaksesuaian ?? null,
    sebaiknya: item.sebaiknya ?? null,
    rule_version_id: ruleVersionId,
  }));

  const { data, error } = await supabaseAdmin
    .from('qa_temuan')
    .insert(rows)
    .select();

  if (error) {
    if (error.message.includes('foreign key')) {
      throw new Error('Data tidak valid: pastikan agent, periode, dan indikator sudah benar');
    }
    throw new Error(`Gagal menyimpan temuan: ${error.message}`);
  }

  if (userId) {
    await supabaseAdmin.from('activity_logs').insert({
      user_id: userId,
      user_name: userName,
      action: 'upload_sidak_batch',
      module: 'sidak',
      type: 'upload',
    });
  }

  if (data && data.length > 0) {
    refreshDashboardSummary(items.period_id, items.service_type).catch(err => {
      console.error('Summary refresh failed:', err);
    });
  }

  return { inserted: data?.length ?? 0, skipped: validation.stats.skipped_count, total: items.items.length };
}

export async function refreshDashboardSummary(
  periodId: string,
  serviceType?: string,
) {
  const [indicators, weights] = await Promise.all([
    getIndicators(serviceType),
    supabaseAdmin.from('qa_service_weights').select('*'),
  ]);

  const weightMap = (weights?.data ?? []).reduce((acc: Record<string, any>, w: any) => {
    acc[w.service_type] = w;
    return acc;
  }, {});

  let query = supabaseAdmin
    .from('qa_temuan')
    .select('*, profiler_peserta!inner(id, nama, batch_name, tim, jabatan)')
    .eq('period_id', periodId);

  if (serviceType) query = query.eq('service_type', serviceType);

  const { data: allTemuan } = await query;
  const rows = allTemuan ?? [];

  if (rows.length === 0) {
    return { message: 'No data to summarize', period_id: periodId, agent_count: 0 };
  }

  const agentMap = new Map<string, {
    id: string; nama: string; batch_name: string; tim: string; jabatan: string; rows: any[];
  }>();

  for (const row of rows) {
    const pid = row.peserta_id;
    if (!agentMap.has(pid)) {
      const p = row.profiler_peserta as any;
      agentMap.set(pid, {
        id: pid, nama: p?.nama ?? 'Unknown',
        batch_name: p?.batch_name ?? '', tim: p?.tim ?? '', jabatan: p?.jabatan ?? '', rows: [],
      });
    }
    agentMap.get(pid)!.rows.push(row);
  }

  const auditedAgents = Array.from(agentMap.values());
  const svc = serviceType ?? auditedAgents[0]?.rows[0]?.service_type ?? 'call';

  let totalFindings = 0;
  let totalScore = 0;
  let zeroErrorCount = 0;
  let complianceCount = 0;
  const complianceThreshold = 95;

  const agentRows: {
    agent_id: string; period_id: string; service_type: string;
    final_score: number; non_critical_score: number; critical_score: number;
    session_count: number; findings_count: number;
  }[] = [];

  for (const agent of auditedAgents) {
    const agentSvc = agent.rows[0]?.service_type ?? svc;
    const weight = weightMap[agentSvc] ?? DEFAULT_SERVICE_WEIGHTS[agentSvc as ServiceType] ?? DEFAULT_SERVICE_WEIGHTS.call;

    const realRows = agent.rows.filter((r: any) => r.is_phantom_padding !== true);
    const scoreRows = realRows.length > 0 ? realRows : agent.rows;
    const score = calculateQAScoreFromTemuan(indicators, scoreRows, weight);

    const findingRows = agent.rows.filter((r: any) => isCountableFinding(r));
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
    .from('qa_dashboard_agent_period_summary')
    .delete()
    .eq('period_id', periodId)
    .eq('service_type', svc);
  if (clearAgentsErr) throw new Error(`Gagal membersihkan cache agent: ${clearAgentsErr.message}`);

  const { error: clearPeriodErr } = await supabaseAdmin
    .from('qa_dashboard_period_summary')
    .delete()
    .eq('period_id', periodId)
    .eq('service_type', svc);
  if (clearPeriodErr) throw new Error(`Gagal membersihkan cache periode: ${clearPeriodErr.message}`);

  if (agentRows.length > 0) {
    const { error: agentErr } = await supabaseAdmin
      .from('qa_dashboard_agent_period_summary')
      .insert(agentRows);
    if (agentErr) throw new Error(`Gagal menyimpan cache agen: ${agentErr.message}`);
  }

  const periodSummary = {
    period_id: periodId,
    service_type: svc,
    total_agents: totalAgents,
    total_defects: totalFindings,
    avg_defects_per_audit: roundTo(totalAgents > 0 ? totalFindings / totalAgents : 0, 2),
    zero_error_rate: roundTo(totalAgents > 0 ? (zeroErrorCount / totalAgents) * 100 : 0, 2),
    avg_agent_score: roundTo(totalAgents > 0 ? totalScore / totalAgents : 0, 2),
    compliance_rate: roundTo(totalAgents > 0 ? (complianceCount / totalAgents) * 100 : 0, 2),
    compliance_count: complianceCount,
  };

  const { error: periodErr } = await supabaseAdmin
    .from('qa_dashboard_period_summary')
    .insert(periodSummary);
  if (periodErr) throw new Error(`Gagal menyimpan cache periode: ${periodErr.message}`);

  return { message: 'Summary refreshed', period_id: periodId, agent_count: totalAgents };
}

export async function updateTemuan(id: string, updates: {
  nilai?: number;
  ketidaksesuaian?: string | null;
  sebaiknya?: string | null;
}) {
  const { data, error } = await supabaseAdmin
    .from('qa_temuan')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(`Gagal update temuan: ${error.message}`);
  return data;
}

export async function deleteTemuan(id: string) {
  const { error } = await supabaseAdmin.from('qa_temuan').delete().eq('id', id);
  if (error) throw new Error(`Gagal hapus temuan: ${error.message}`);
}

// ── Agents ─────────────────────────────────────────────────

export async function getAgents(params: {
  batch_name?: string;
  tim?: string;
  search?: string;
  agent_ids?: string[];
}): Promise<any[]> {
  let query = supabaseAdmin
    .from('profiler_peserta')
    .select('id, nama, tim, batch_name, foto_url, jabatan')
    .order('nama');

  if (params.batch_name) query = query.eq('batch_name', params.batch_name);
  if (params.tim) query = query.eq('tim', params.tim);
  if (params.search) query = query.ilike('nama', `%${params.search}%`);
  if (params.agent_ids && params.agent_ids.length > 0) query = query.in('id', params.agent_ids);

  const { data } = await query;
  return data ?? [];
}

export async function getAgentDetail(agentId: string, year?: number, serviceType?: string): Promise<AgentDetailData> {
  const [peserta, indicators, periods] = await Promise.all([
    supabaseAdmin.from('profiler_peserta').select('*').eq('id', agentId).single(),
    getIndicators(serviceType),
    getPeriods(),
  ]);

  if (peserta.error) throw new Error('Agent tidak ditemukan');

  const currentYear = year ?? new Date().getFullYear();
  const { data: temuan } = await supabaseAdmin
    .from('qa_temuan')
    .select('*')
    .eq('peserta_id', agentId)
    .eq('tahun', currentYear)
    .order('created_at', { ascending: false });

  const rows = temuan ?? [];
  const weight = serviceType ? DEFAULT_SERVICE_WEIGHTS[serviceType as ServiceType] ?? DEFAULT_SERVICE_WEIGHTS['call'] : DEFAULT_SERVICE_WEIGHTS['call'];

  const summaries: AgentPeriodSummary[] = [];
  for (const period of periods) {
    const periodRows = rows.filter(r => r.period_id === period.id && (serviceType ? r.service_type === serviceType : true));
    if (periodRows.length === 0) continue;
    const scoreRows = periodRows.filter(r => r.is_phantom_padding !== true);
    const scoreRowsForCalc = scoreRows.length > 0 ? scoreRows : periodRows;
    const score = calculateQAScoreFromTemuan(indicators, scoreRowsForCalc, weight);
    const findingsCount = periodRows.filter(r => isCountableFinding(r)).length;
    summaries.push({
      id: period.id,
      month: period.month,
      year: period.year,
      label: `${String(period.month).padStart(2, '0')}/${period.year}`,
      serviceType: (serviceType as ServiceType) ?? 'call',
      finalScore: roundTo(score.finalScore, 2),
      nonCriticalScore: roundTo(score.nonCriticalScore, 2),
      criticalScore: roundTo(score.criticalScore, 2),
      sessionCount: score.sessionCount,
      findingsCount,
    });
  }

  const scoreHistory = summaries.map(s => ({
    month: s.month,
    year: s.year,
    finalScore: s.finalScore,
    nonCriticalScore: s.nonCriticalScore,
    criticalScore: s.criticalScore,
    sessionCount: s.sessionCount,
    service_type: s.serviceType,
  }));

  return {
    indicators,
    periodSummaries: summaries.sort((a, b) => b.year - a.year || b.month - a.month),
    temuan: rows.filter(r => !r.is_phantom_padding),
    personalTrend: { labels: [], datasets: [] },
    scoreHistory,
    initialYear: currentYear,
    initialService: (serviceType as ServiceType) ?? 'call',
    initialTrendRange: { start: 1, end: 12 },
  };
}

// ── Dashboard ──────────────────────────────────────────────

export async function getDashboardData(params: {
  period_ids?: string[];
  service_type?: string;
  folder_ids?: string[];
  year?: number;
  peserta_id?: string;
  agent_ids?: string[];
}): Promise<DashboardData> {
  const [periods, folders, indicators, weights] = await Promise.all([
    getPeriods(),
    supabaseAdmin.from('profiler_folders').select('id, name').order('name'),
    getIndicators(),
    supabaseAdmin.from('qa_service_weights').select('*'),
  ]);

  let query = supabaseAdmin
    .from('qa_temuan')
    .select('*, profiler_peserta!inner(id, nama, batch_name, tim, jabatan)');

  if (params.service_type && params.service_type !== 'all') {
    query = query.eq('service_type', params.service_type);
  }
  if (params.period_ids && params.period_ids.length > 0) {
    query = query.in('period_id', params.period_ids);
  }
  if (params.year) {
    query = query.eq('tahun', params.year);
  }
  if (params.peserta_id) {
    query = query.eq('peserta_id', params.peserta_id);
  }
  if (params.agent_ids && params.agent_ids.length > 0) {
    query = query.in('peserta_id', params.agent_ids);
  }

  const { data: allTemuan } = await query;
  const rows = allTemuan ?? [];
  const weightMap = (weights?.data ?? []).reduce((acc: Record<string, any>, w: any) => {
    acc[w.service_type] = w;
    return acc;
  }, {});

  const agentMap = new Map<string, {
    id: string;
    nama: string;
    batch_name: string;
    tim: string;
    jabatan: string;
    rows: any[];
  }>();

  for (const row of rows) {
    const pid = row.peserta_id;
    if (!agentMap.has(pid)) {
      const p = row.profiler_peserta as any;
      agentMap.set(pid, {
        id: pid,
        nama: p?.nama ?? 'Unknown',
        batch_name: p?.batch_name ?? '',
        tim: p?.tim ?? '',
        jabatan: p?.jabatan ?? '',
        rows: [],
      });
    }
    agentMap.get(pid)!.rows.push(row);
  }

  const auditedAgents = Array.from(agentMap.values());
  let totalFindings = 0;
  let totalScore = 0;
  let zeroErrorCount = 0;
  let complianceCount = 0;
  const complianceThreshold = 95;

  const serviceDefects: Record<string, number> = {};
  const paretoMap = new Map<string, { name: string; count: number; cat: string }>();
  let criticalCount = 0;
  let nonCriticalCount = 0;

  for (const agent of auditedAgents) {
    const svc = agent.rows[0]?.service_type ?? 'call';
    const weight = weightMap[svc] ?? DEFAULT_SERVICE_WEIGHTS[svc as ServiceType] ?? DEFAULT_SERVICE_WEIGHTS['call'];

    const realRows = agent.rows.filter(r => r.is_phantom_padding !== true);
    const scoreRows = realRows.length > 0 ? realRows : agent.rows;
    const score = calculateQAScoreFromTemuan(indicators, scoreRows, weight);

    const findingRows = agent.rows.filter(r => isCountableFinding(r));
    const agentFindings = findingRows.length;
    totalFindings += agentFindings;
    totalScore += score.finalScore;

    if (agentFindings === 0) zeroErrorCount++;
    if (score.finalScore >= complianceThreshold) complianceCount++;

    const agentServiceType = agent.rows[0]?.service_type ?? 'unknown';
    serviceDefects[agentServiceType] = (serviceDefects[agentServiceType] ?? 0) + agentFindings;

    for (const row of findingRows) {
      const ind = indicators.find(i => i.id === row.indicator_id);
      if (ind) {
        const key = ind.name;
        paretoMap.set(key, {
          name: key,
          count: (paretoMap.get(key)?.count ?? 0) + 1,
          cat: ind.category,
        });
        if (ind.category === 'critical') criticalCount++;
        else if (ind.category === 'non_critical') nonCriticalCount++;
      }
    }
  }

  const totalAgents = auditedAgents.length;

  let summary: DashboardSummary = {
    totalDefects: totalFindings,
    avgDefectsPerAudit: roundTo(totalAgents > 0 ? totalFindings / totalAgents : 0, 2),
    zeroErrorRate: roundTo(totalAgents > 0 ? (zeroErrorCount / totalAgents) * 100 : 0, 2),
    avgAgentScore: roundTo(totalAgents > 0 ? totalScore / totalAgents : 0, 2),
    complianceRate: roundTo(totalAgents > 0 ? (complianceCount / totalAgents) * 100 : 0, 2),
    complianceCount,
    totalAgents,
  };

  // Cache override: when single period + specific service type, use pre-computed summary
  if (params.period_ids?.length === 1 && params.service_type && params.service_type !== 'all') {
    try {
      const { data: cachedPeriod } = await supabaseAdmin
        .from('qa_dashboard_period_summary')
        .select('*')
        .eq('period_id', params.period_ids[0])
        .eq('service_type', params.service_type)
        .maybeSingle();
      if (cachedPeriod) {
        summary = {
          totalDefects: cachedPeriod.total_defects,
          avgDefectsPerAudit: Number(cachedPeriod.avg_defects_per_audit),
          zeroErrorRate: Number(cachedPeriod.zero_error_rate),
          avgAgentScore: Number(cachedPeriod.avg_agent_score),
          complianceRate: Number(cachedPeriod.compliance_rate),
          complianceCount: cachedPeriod.compliance_count,
          totalAgents: cachedPeriod.total_agents,
        };
      }
    } catch {
      // Cache unavailable — use computed values
    }
  }

  const topAgents: TopAgentData[] = auditedAgents
    .map(agent => {
      const svc = agent.rows[0]?.service_type ?? 'call';
      const weight = weightMap[svc] ?? DEFAULT_SERVICE_WEIGHTS[svc as ServiceType] ?? DEFAULT_SERVICE_WEIGHTS['call'];
      const realRows = agent.rows.filter(r => r.is_phantom_padding !== true);
      const scoreRows = realRows.length > 0 ? realRows : agent.rows;
      const score = calculateQAScoreFromTemuan(indicators, scoreRows, weight);
      const findingRows = agent.rows.filter(r => isCountableFinding(r));
      return {
        agentId: agent.id,
        nama: agent.nama,
        batch: agent.batch_name,
        tim: agent.tim,
        jabatan: agent.jabatan,
        defects: findingRows.length,
        score: roundTo(score.finalScore, 2),
        hasCritical: findingRows.some(r => {
          const ind = indicators.find(i => i.id === r.indicator_id);
          return ind?.category === 'critical';
        }),
      };
    })
    .sort((a, b) => b.defects - a.defects || a.nama.localeCompare(b.nama))
    .slice(0, 20);

  const paretoArray: ParetoData[] = Array.from(paretoMap.entries())
    .map(([_key, val]) => ({ name: val.name, fullName: val.name, count: val.count, cumulative: 0, category: val.cat as any }))
    .sort((a, b) => b.count - a.count);

  let cumulative = 0;
  for (const p of paretoArray) {
    cumulative += p.count;
    p.cumulative = cumulative;
  }

  const folderIds = (params.folder_ids?.length ?? 0) > 0
    ? params.folder_ids!.map(id => ({ id, name: '' }))
    : (folders?.data ?? []).map((f: any) => ({ id: f.id, name: f.name }));

  const availableYears = [...new Set(rows.map(r => r.tahun).filter(Boolean))].sort((a, b) => b - a) as number[];
  const currentYear = params.year ?? new Date().getFullYear();

  return {
    periods,
    folders: folderIds,
    summary,
    serviceData: Object.entries(serviceDefects).map(([svc, total]) => ({
      name: (SERVICE_LABELS as any)[svc] ?? svc,
      serviceType: svc,
      total,
      severity: total > 50 ? 'Critical' : total > 30 ? 'High' : total > 15 ? 'Medium' : 'Low',
    })),
    topAgents,
    paretoData: paretoArray,
    donutData: { critical: criticalCount, nonCritical: nonCriticalCount, total: criticalCount + nonCriticalCount },
    paramTrend: { labels: [], datasets: [] },
    sparklines: {},
    availableYears,
    currentYear,
  };
}

// ── Service Weights ────────────────────────────────────────

// ── Reports ────────────────────────────────────────────────

export async function getDataReportRows(params: {
  serviceType?: string;
  year?: number;
  startMonth?: number;
  endMonth?: number;
  folderId?: string;
  pesertaId?: string;
  indicatorId?: string;
  agent_ids?: string[];
}): Promise<any[]> {
  let query = supabaseAdmin
    .from('qa_temuan')
    .select('*, profiler_peserta!inner(id, nama, batch_name, tim, jabatan), qa_indicators!inner(id, name, category), qa_periods!inner(id, month, year)');

  if (params.serviceType) query = query.eq('service_type', params.serviceType);
  if (params.year) query = query.eq('tahun', params.year);
  if (params.pesertaId) query = query.eq('peserta_id', params.pesertaId);
  if (params.indicatorId) query = query.eq('indicator_id', params.indicatorId);
  if (params.agent_ids && params.agent_ids.length > 0) query = query.in('peserta_id', params.agent_ids);

  if (params.startMonth && params.year) {
    const startPeriod = await supabaseAdmin
      .from('qa_periods')
      .select('id')
      .eq('month', params.startMonth)
      .eq('year', params.year)
      .single();
    if (startPeriod.data) query = query.gte('period_id', startPeriod.data.id);
  }

  if (params.endMonth && params.year) {
    const endPeriod = await supabaseAdmin
      .from('qa_periods')
      .select('id')
      .eq('month', params.endMonth)
      .eq('year', params.year)
      .single();
    if (endPeriod.data) query = query.lte('period_id', endPeriod.data.id);
  }

  const { data } = await query.order('created_at', { ascending: false }).limit(1000);
  return data ?? [];
}

export async function getReportChartData(params: {
  serviceType?: string;
  year?: number;
  startMonth?: number;
  endMonth?: number;
  folderId?: string;
  pesertaId?: string;
  agent_ids?: string[];
}): Promise<{
  donutData: { critical: number; nonCritical: number; total: number };
  paretoData: { name: string; count: number; cumulative: number }[];
  trendData: { month: string; total: number }[];
}> {
  const rows = await getDataReportRows(params);
  if (rows.length === 0) {
    return { donutData: { critical: 0, nonCritical: 0, total: 0 }, paretoData: [], trendData: [] };
  }

  const indicators = await getIndicators(params.serviceType);
  const paretoMap = new Map<string, number>();
  let criticalCount = 0;
  let nonCriticalCount = 0;

  for (const row of rows) {
    const ind = indicators.find(i => i.id === row.indicator_id);
    if (ind) {
      const key = ind.name;
      paretoMap.set(key, (paretoMap.get(key) ?? 0) + 1);
      if (ind.category === 'critical') criticalCount++;
      else if (ind.category === 'non_critical') nonCriticalCount++;
    }
  }

  const paretoArray = Array.from(paretoMap.entries())
    .map(([name, count]) => ({ name, count, cumulative: 0 }))
    .sort((a, b) => b.count - a.count);

  let cumulative = 0;
  for (const p of paretoArray) {
    cumulative += p.count;
    p.cumulative = cumulative;
  }

  const periodMap = new Map<string, number>();
  for (const row of rows) {
    const period = row.qa_periods as { month?: number; year?: number } | undefined;
    if (period?.month && period?.year) {
      const key = `${String(period.month).padStart(2, '0')}/${period.year}`;
      periodMap.set(key, (periodMap.get(key) ?? 0) + 1);
    }
  }

  const sortedPeriods = Array.from(periodMap.entries()).sort(([a], [b]) => a.localeCompare(b));
  const trendData = sortedPeriods.map(([month, total]) => ({ month, total }));

  return {
    donutData: { critical: criticalCount, nonCritical: nonCriticalCount, total: criticalCount + nonCriticalCount },
    paretoData: paretoArray.slice(0, 15),
    trendData,
  };
}

export async function getServiceWeights(): Promise<any[]> {
  const { data } = await supabaseAdmin.from('qa_service_weights').select('*');
  return data ?? [];
}

export async function updateServiceWeight(serviceType: string, updates: {
  critical_weight?: number;
  non_critical_weight?: number;
  scoring_mode?: string;
}) {
  const { data, error } = await supabaseAdmin
    .from('qa_service_weights')
    .update(updates)
    .eq('service_type', serviceType)
    .select()
    .single();
  if (error) throw new Error(`Gagal update service weight: ${error.message}`);
  return data;
}

// ── Dashboard Trend Analysis ──────────────────────────────────

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agt','Sep','Okt','Nov','Des'];

export async function fetchPaginatedTrendData(pIds: string[], year?: number, agent_ids?: string[]) {
  let allData: any[] = [];
  let from = 0;
  const step = 1000;
  let hasMore = true;

  while (hasMore) {
    let query = supabaseAdmin
      .from('qa_temuan')
      .select('nilai, ketidaksesuaian, sebaiknya, period_id, service_type, peserta_id, no_tiket, indicator_id, tahun')
      .in('period_id', pIds)
      .eq('is_phantom_padding', false)
      .order('id', { ascending: true })
      .range(from, from + step - 1);

    if (year) {
      query = query.eq('tahun', year);
    }
    if (agent_ids && agent_ids.length > 0) {
      query = query.in('peserta_id', agent_ids);
    }

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allData = [...allData, ...data];
      hasMore = data.length === step;
      from += step;
    }
  }

  return allData;
}

export async function calculateTopParameters(temuan: any[]) {
  if (!temuan || temuan.length === 0) return {};
  const indicators = await getIndicators();
  const countsPerService: Record<string, Record<string, { count: number, name: string }>> = {};

  for (const finding of temuan) {
    if (!isCountableFinding(finding)) continue;
    const service = finding.service_type || 'unknown';
    const id = finding.indicator_id;
    if (!id) continue;
    const indicator = indicators.find(i => i.id === id);
    const name = indicator?.name || 'Unknown';

    if (!countsPerService[service]) countsPerService[service] = {};
    if (!countsPerService[service][id]) countsPerService[service][id] = { count: 0, name };
    countsPerService[service][id].count++;
  }

  const result: Record<string, { name: string, count: number }> = {};
  Object.keys(countsPerService).forEach(service => {
    const sorted = Object.values(countsPerService[service]).sort((a, b) => b.count - a.count);
    if (sorted[0]) {
      result[service] = sorted[0];
    }
  });

  return result;
}

export async function getServiceTrendForDashboard(timeframe: '3m' | '6m' | 'all' = '3m', agent_ids?: string[]) {
  const limitMap = { '3m': 3, '6m': 6, 'all': 12 };
  const limit = limitMap[timeframe] || 3;

  const { data: periods, error } = await supabaseAdmin
    .from('qa_periods')
    .select('*')
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(limit);

  if (error) throw error;
  if (!periods || periods.length === 0) {
    return {
      labels: [],
      totalData: [],
      serviceData: {},
      activeServices: [],
      serviceSummary: {},
      totalSummary: { totalDefects: 0, auditedAgents: 0, activeServiceCount: 0 },
      periodStats: [],
      topParameters: {}
    };
  }

  const sortedPeriods = [...periods].reverse();
  const pIds = sortedPeriods.map(p => p.id);
  const labels = sortedPeriods.map(p => `${MONTHS_SHORT[p.month - 1]} ${String(p.year).slice(-2)}`);

  const temuan = await fetchPaginatedTrendData(pIds, undefined, agent_ids);
  const topParameters = await calculateTopParameters(temuan);

  if (!temuan || temuan.length === 0) {
    return {
      labels,
      totalData: labels.map(() => 0),
      serviceData: {},
      activeServices: [],
      serviceSummary: {},
      totalSummary: { totalDefects: 0, auditedAgents: 0, activeServiceCount: 0 },
      periodStats: [],
      topParameters: {}
    };
  }

  const activeServicesSet = new Set<string>();
  const totalData = labels.map(() => 0);
  const serviceData: Record<string, number[]> = {};
  const serviceSummary: Record<string, { totalDefects: number, auditedAgents: number }> = {};

  const totalAuditedAgentsSet = new Set(temuan.map(t => t.peserta_id));
  const totalDefectsCount = temuan.filter(isCountableFinding).length;

  temuan.forEach(t => {
    const sType = t.service_type || 'unknown';
    activeServicesSet.add(sType);

    const periodIdx = sortedPeriods.findIndex(p => p.id === t.period_id);
    if (periodIdx === -1) return;

    if (isCountableFinding(t)) {
      totalData[periodIdx]++;
    }
    if (!serviceData[sType]) serviceData[sType] = labels.map(() => 0);
    if (isCountableFinding(t)) {
      serviceData[sType][periodIdx]++;
    }

    if (!serviceSummary[sType]) {
      serviceSummary[sType] = { totalDefects: 0, auditedAgents: 0 };
    }
    if (isCountableFinding(t)) {
      serviceSummary[sType].totalDefects++;
    }
  });

  const serviceAgentsMap: Record<string, Set<string>> = {};
  temuan.forEach(t => {
    const sType = t.service_type || 'unknown';
    if (!serviceAgentsMap[sType]) serviceAgentsMap[sType] = new Set<string>();
    serviceAgentsMap[sType].add(t.peserta_id);
  });

  Object.keys(serviceSummary).forEach(sType => {
    serviceSummary[sType].auditedAgents = serviceAgentsMap[sType]?.size || 0;
  });

  const periodStats = sortedPeriods.map((p, idx) => {
    const pTemuan = temuan.filter(t => t.period_id === p.id);
    const svcStats: Record<string, { totalDefects: number, auditedAgents: number }> = {};

    const pAgents = new Set(pTemuan.map(t => t.peserta_id));
    const pDefects = pTemuan.filter(isCountableFinding).length;

    activeServicesSet.forEach(svc => {
      const sTemuan = pTemuan.filter(t => t.service_type === svc);
      svcStats[svc] = {
        totalDefects: sTemuan.filter(isCountableFinding).length,
        auditedAgents: new Set(sTemuan.map(t => t.peserta_id)).size
      };
    });

    return {
      id: p.id,
      label: labels[idx],
      totalDefects: pDefects,
      auditedAgents: pAgents.size,
      serviceStats: svcStats
    };
  });

  return {
    labels,
    totalData,
    serviceData,
    activeServices: Array.from(activeServicesSet),
    serviceSummary,
    totalSummary: {
      totalDefects: totalDefectsCount,
      auditedAgents: totalAuditedAgentsSet.size,
      activeServiceCount: activeServicesSet.size
    },
    periodStats,
    topParameters
  };
}

export async function getServiceTrendForDashboardByRange(year: number, startMonth: number, endMonth: number, agent_ids?: string[]) {
  const allPeriods = await getPeriods();
  const sortedPeriods = allPeriods
    .filter(p => p.year === year && p.month >= startMonth && p.month <= endMonth)
    .sort((a, b) => a.month - b.month);

  const pIds = sortedPeriods.map(p => p.id);
  const labels = sortedPeriods.map(p => `${MONTHS_SHORT[p.month - 1]} ${String(p.year).slice(-2)}`);

  if (pIds.length === 0) {
    return {
      labels: [],
      totalData: [],
      serviceData: {},
      activeServices: [],
      serviceSummary: {},
      totalSummary: { totalDefects: 0, auditedAgents: 0, activeServiceCount: 0 },
      periodStats: [],
      topParameters: {}
    };
  }

  const temuan = await fetchPaginatedTrendData(pIds, year, agent_ids);
  const topParameters = await calculateTopParameters(temuan);

  if (!temuan || temuan.length === 0) {
    return {
      labels,
      totalData: labels.map(() => 0),
      serviceData: {},
      activeServices: [],
      serviceSummary: {},
      totalSummary: { totalDefects: 0, auditedAgents: 0, activeServiceCount: 0 },
      periodStats: [],
      topParameters: {}
    };
  }

  const activeServicesSet = new Set<string>();
  const totalData = labels.map(() => 0);
  const serviceData: Record<string, number[]> = {};
  const serviceSummary: Record<string, { totalDefects: number, auditedAgents: number }> = {};

  const totalAuditedAgentsSet = new Set(temuan.map(t => t.peserta_id));
  const totalDefectsCount = temuan.filter(isCountableFinding).length;

  temuan.forEach(t => {
    const sType = t.service_type || 'unknown';
    activeServicesSet.add(sType);

    const periodIdx = sortedPeriods.findIndex(p => p.id === t.period_id);
    if (periodIdx === -1) return;

    if (isCountableFinding(t)) {
      totalData[periodIdx]++;
    }
    if (!serviceData[sType]) serviceData[sType] = labels.map(() => 0);
    if (isCountableFinding(t)) {
      serviceData[sType][periodIdx]++;
    }

    if (!serviceSummary[sType]) {
      serviceSummary[sType] = { totalDefects: 0, auditedAgents: 0 };
    }
    if (isCountableFinding(t)) {
      serviceSummary[sType].totalDefects++;
    }
  });

  const serviceAgentsMap: Record<string, Set<string>> = {};
  temuan.forEach(t => {
    const sType = t.service_type || 'unknown';
    if (!serviceAgentsMap[sType]) serviceAgentsMap[sType] = new Set<string>();
    serviceAgentsMap[sType].add(t.peserta_id);
  });

  Object.keys(serviceSummary).forEach(sType => {
    serviceSummary[sType].auditedAgents = serviceAgentsMap[sType]?.size || 0;
  });

  const periodStats = sortedPeriods.map((p, idx) => {
    const pTemuan = temuan.filter(t => t.period_id === p.id);
    const svcStats: Record<string, { totalDefects: number, auditedAgents: number }> = {};

    const pAgents = new Set(pTemuan.map(t => t.peserta_id));
    const pDefects = pTemuan.filter(isCountableFinding).length;

    activeServicesSet.forEach(svc => {
      const sTemuan = pTemuan.filter(t => t.service_type === svc);
      svcStats[svc] = {
        totalDefects: sTemuan.filter(isCountableFinding).length,
        auditedAgents: new Set(sTemuan.map(t => t.peserta_id)).size
      };
    });

    return {
      id: p.id,
      label: labels[idx],
      totalDefects: pDefects,
      auditedAgents: pAgents.size,
      serviceStats: svcStats
    };
  });

  return {
    labels,
    totalData,
    serviceData,
    activeServices: Array.from(activeServicesSet),
    serviceSummary,
    totalSummary: {
      totalDefects: totalDefectsCount,
      auditedAgents: totalAuditedAgentsSet.size,
      activeServiceCount: activeServicesSet.size
    },
    periodStats,
    topParameters
  };
}

export function sliceTrendData(data: any, months: number) {
  const safeLabels = data.labels || [];
  const safeTotalData = data.totalData || [];
  const safeServiceData = data.serviceData || {};
  const safeActiveServices = data.activeServices || [];
  const safePeriodStats = data.periodStats || [];

  const sliceIdx = Math.max(0, safeLabels.length - months);
  const slicedLabels = safeLabels.slice(sliceIdx);
  const slicedTotalData = safeTotalData.slice(sliceIdx);

  const slicedPeriodStats = safePeriodStats.slice(sliceIdx);

  const slicedServiceData: Record<string, number[]> = {};
  Object.entries(safeServiceData).forEach(([svc, arr]) => {
    if (Array.isArray(arr)) {
      slicedServiceData[svc] = arr.slice(sliceIdx);
    }
  });

  const latestStat = slicedPeriodStats[slicedPeriodStats.length - 1] || { 
    totalDefects: 0, 
    auditedAgents: 0, 
    serviceStats: {} as Record<string, { totalDefects: number; auditedAgents: number }> 
  };
  
  const totalDefects = slicedTotalData.reduce((a: number, b: number) => a + b, 0);
  
  const serviceSummary: Record<string, { totalDefects: number, auditedAgents: number }> = {};
  safeActiveServices.forEach((svc: string) => {
    const svcTotalDefects = slicedServiceData[svc]?.reduce((a: number, b: number) => a + b, 0) || 0;
    serviceSummary[svc] = {
      totalDefects: svcTotalDefects,
      auditedAgents: latestStat.serviceStats[svc]?.auditedAgents || 0
    };
  });

  return {
    labels: slicedLabels,
    totalData: slicedTotalData,
    serviceData: slicedServiceData,
    activeServices: safeActiveServices,
    serviceSummary,
    totalSummary: {
      totalDefects,
      auditedAgents: latestStat.auditedAgents || 0,
      activeServiceCount: safeActiveServices.length
    },
    periodStats: slicedPeriodStats
  };
}

export async function getAvailableYears(agent_ids?: string[]): Promise<number[]> {
  let query = supabaseAdmin
    .from('qa_temuan')
    .select('tahun')
    .not('tahun', 'is', null);

  if (agent_ids && agent_ids.length > 0) {
    query = query.in('peserta_id', agent_ids);
  }

  const { data } = await query.order('tahun', { ascending: false });

  const years = [...new Set((data ?? []).map(r => r.tahun).filter(Boolean))] as number[];
  return years;
}

// ── QA Rule Versions ────────────────────────────────────────

export async function getRuleVersions(serviceType?: string) {
  let query = supabaseAdmin
    .from('qa_service_rule_versions')
    .select('*, created_by_user:created_by(full_name), published_by_user:published_by(full_name)')
    .order('version_number', { ascending: false });

  if (serviceType) query = query.eq('service_type', serviceType);
  const { data, error } = await query;
  if (error) throw new Error(`Gagal memuat versi aturan: ${error.message}`);

  if (data && data.length > 0) {
    const { data: indicatorRows } = await supabaseAdmin
      .from('qa_service_rule_indicators')
      .select('rule_version_id')
      .in('rule_version_id', data.map(v => v.id));

    const countMap: Record<string, number> = {};
    if (indicatorRows) {
      for (const row of indicatorRows) {
        countMap[row.rule_version_id] = (countMap[row.rule_version_id] || 0) + 1;
      }
    }
    return data.map(v => ({ ...v, indicator_count: countMap[v.id] || 0 }));
  }

  return data ?? [];
}

export async function createRuleVersion(data: {
  service_type: string;
  effective_period_id: string;
  critical_weight: number;
  non_critical_weight: number;
  scoring_mode: string;
  change_reason?: string;
}, userId: string) {
  const { data: versions } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .select('version_number')
    .eq('service_type', data.service_type)
    .order('version_number', { ascending: false })
    .limit(1);

  const versionNumber = (versions?.[0]?.version_number ?? 0) + 1;

  const { data: result, error } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .insert({
      service_type: data.service_type,
      effective_period_id: data.effective_period_id,
      status: 'draft',
      critical_weight: data.critical_weight,
      non_critical_weight: data.non_critical_weight,
      scoring_mode: data.scoring_mode,
      version_number: versionNumber,
      change_reason: data.change_reason,
      created_by: userId,
    })
    .select()
    .single();

  if (error) throw new Error(`Gagal membuat versi aturan: ${error.message}`);
  return result;
}

export async function updateRuleVersion(id: string, data: {
  critical_weight?: number;
  non_critical_weight?: number;
  scoring_mode?: string;
  change_reason?: string;
}, userId: string) {
  const { data: existing } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .select('status')
    .eq('id', id)
    .single();

  if (!existing) throw new Error('Versi aturan tidak ditemukan');
  if (existing.status !== 'draft') throw new Error('Hanya versi draft yang bisa diedit');

  const { data: result, error } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .update({ ...data, updated_by: userId })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Gagal mengupdate versi aturan: ${error.message}`);
  return result;
}

export async function publishRuleVersion(id: string, userId: string, change_reason?: string) {
  const { data: existing } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .select('status, service_type')
    .eq('id', id)
    .single();

  if (!existing) throw new Error('Versi aturan tidak ditemukan');
  if (existing.status !== 'draft') throw new Error('Hanya versi draft yang bisa dipublikasikan');

  const now = new Date().toISOString();

  // auto-supersede other published versions for the same service_type
  const { data: publishedVersions } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .select('id')
    .eq('service_type', existing.service_type)
    .eq('status', 'published')
    .neq('id', id);

  if (publishedVersions && publishedVersions.length > 0) {
    const { error: supersedeError } = await supabaseAdmin
      .from('qa_service_rule_versions')
      .update({
        status: 'superseded',
        superseded_by: userId,
        superseded_at: now,
        superseded_by_version_id: id,
      })
      .in('id', publishedVersions.map(p => p.id));

    if (supersedeError) throw new Error(`Gagal menonaktifkan versi lama: ${supersedeError.message}`);
  }

  const updates: Record<string, any> = {
    status: 'published',
    published_by: userId,
    published_at: now,
  };
  if (change_reason !== undefined) updates.change_reason = change_reason;

  const { data: result, error } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Gagal mempublikasikan versi aturan: ${error.message}`);
  return result;
}

export async function supersedeRuleVersion(id: string, userId: string, change_reason?: string) {
  const { data: existing } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .select('status')
    .eq('id', id)
    .single();

  if (!existing) throw new Error('Versi aturan tidak ditemukan');
  if (existing.status !== 'published') throw new Error('Hanya versi published yang bisa di-supersede');

  const updates: Record<string, any> = {
    status: 'superseded',
    superseded_by: userId,
    superseded_at: new Date().toISOString(),
  };
  if (change_reason !== undefined) updates.change_reason = change_reason;

  const { data: result, error } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Gagal menonaktifkan versi aturan: ${error.message}`);
  return result;
}

export async function getRuleVersionIndicators(versionId: string) {
  const { data, error } = await supabaseAdmin
    .from('qa_service_rule_indicators')
    .select('*')
    .eq('rule_version_id', versionId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error(`Gagal memuat indikator: ${error.message}`);
  return data ?? [];
}

export async function addRuleVersionIndicator(data: {
  rule_version_id: string;
  service_type: string;
  name: string;
  category: 'critical' | 'non_critical' | 'none';
  bobot: number;
  has_na?: boolean;
  threshold?: number;
  sort_order?: number;
  legacy_indicator_id?: string;
}, userId: string) {
  const { data: result, error } = await supabaseAdmin
    .from('qa_service_rule_indicators')
    .insert({ ...data, created_by: userId })
    .select()
    .single();

  if (error) throw new Error(`Gagal menambah indikator: ${error.message}`);
  return result;
}

export async function deleteRuleVersionIndicator(id: string) {
  const { error } = await supabaseAdmin
    .from('qa_service_rule_indicators')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Gagal menghapus indikator: ${error.message}`);
}

type ReportArchiveInput = {
  userId: string;
  title: string;
  reportType: 'data' | 'ai';
  filterParams: Record<string, unknown>;
  reportData: Record<string, unknown>;
  reportHtml?: string;
  reportJson?: Record<string, unknown>;
};

export async function saveReportArchive(params: ReportArchiveInput) {
  const { data, error } = await supabaseAdmin
    .from('report_archives')
    .insert({
      user_id: params.userId,
      title: params.title,
      report_type: params.reportType,
      filter_params: params.filterParams,
      report_data: params.reportData,
      report_html: params.reportHtml ?? null,
      report_json: params.reportJson ?? null,
    })
    .select('id, title, report_type, created_at')
    .single();

  if (error) throw new Error(`Gagal menyimpan report: ${error.message}`);
  return data;
}

export async function getReportArchives(userId: string, role: string) {
  const adminRoles: readonly string[] = ['admin', 'trainer', 'qa'];
  let query = supabaseAdmin
    .from('report_archives')
    .select('id, title, report_type, filter_params, created_at')
    .order('created_at', { ascending: false });

  if (!adminRoles.includes(role)) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Gagal memuat daftar report: ${error.message}`);
  return data ?? [];
}

export async function getReportArchiveById(archiveId: string, userId: string, role: string) {
  const { data, error } = await supabaseAdmin
    .from('report_archives')
    .select('*')
    .eq('id', archiveId)
    .single();

  if (error) return null;

  const adminRoles: readonly string[] = ['admin', 'trainer', 'qa'];
  if (!adminRoles.includes(role) && data.user_id !== userId) return null;

  return data;
}

export async function deleteReportArchive(archiveId: string, userId: string, role: string) {
  const adminRoles: readonly string[] = ['admin', 'trainer', 'qa'];
  let query = supabaseAdmin
    .from('report_archives')
    .delete()
    .eq('id', archiveId);

  if (!adminRoles.includes(role)) {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;
  if (error) throw new Error(`Gagal menghapus report: ${error.message}`);
}

