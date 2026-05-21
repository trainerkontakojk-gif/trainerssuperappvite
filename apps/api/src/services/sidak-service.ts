import { supabaseAdmin } from '../lib/supabase';
import { calculateQAScoreFromTemuan, DEFAULT_SERVICE_WEIGHTS, SERVICE_LABELS } from '../lib/scoring';
import type {
  QAIndicator, QAPeriod, QATemuan, ServiceType,
  DashboardSummary, DashboardData, AgentDetailData,
  AgentPeriodSummary, TopAgentData, ParetoData,
} from '@trainers/types';

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
}): Promise<{ data: QATemuan[]; total: number }> {
  let query = supabaseAdmin
    .from('qa_temuan')
    .select('*', { count: 'exact' });

  if (params.peserta_id) query = query.eq('peserta_id', params.peserta_id);
  if (params.period_id) query = query.eq('period_id', params.period_id);
  if (params.service_type) query = query.eq('service_type', params.service_type);

  query = query.order('created_at', { ascending: false });

  if (params.limit) query = query.range(params.offset ?? 0, (params.offset ?? 0) + params.limit - 1);

  const { data, count, error } = await query;
  if (error) throw new Error(`Failed to get temuan: ${error.message}`);
  return { data: data ?? [], total: count ?? 0 };
}

export async function createTemuanBatch(items: {
  peserta_id: string;
  period_id: string;
  service_type: ServiceType;
  no_tiket?: string | null;
  items: { indicator_id: string; nilai: number; ketidaksesuaian?: string | null; sebaiknya?: string | null }[];
}) {
  const rows = items.items.map(item => ({
    peserta_id: items.peserta_id,
    period_id: items.period_id,
    indicator_id: item.indicator_id,
    service_type: items.service_type,
    no_tiket: items.no_tiket ?? null,
    nilai: item.nilai,
    ketidaksesuaian: item.ketidaksesuaian ?? null,
    sebaiknya: item.sebaiknya ?? null,
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
  return data ?? [];
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
}): Promise<any[]> {
  let query = supabaseAdmin
    .from('profiler_peserta')
    .select('id, nama, tim, batch_name, foto_url, jabatan')
    .order('nama');

  if (params.batch_name) query = query.eq('batch_name', params.batch_name);
  if (params.tim) query = query.eq('tim', params.tim);
  if (params.search) query = query.ilike('nama', `%${params.search}%`);

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

  const summary: DashboardSummary = {
    totalDefects: totalFindings,
    avgDefectsPerAudit: roundTo(totalAgents > 0 ? totalFindings / totalAgents : 0, 2),
    zeroErrorRate: roundTo(totalAgents > 0 ? (zeroErrorCount / totalAgents) * 100 : 0, 2),
    avgAgentScore: roundTo(totalAgents > 0 ? totalScore / totalAgents : 0, 2),
    complianceRate: roundTo(totalAgents > 0 ? (complianceCount / totalAgents) * 100 : 0, 2),
    complianceCount,
    totalAgents,
  };

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
    .map(([key, val]) => ({ name: val.name, fullName: val.name, count: val.count, cumulative: 0, category: val.cat as any }))
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
}): Promise<any[]> {
  let query = supabaseAdmin
    .from('qa_temuan')
    .select('*, profiler_peserta!inner(id, nama, batch_name, tim, jabatan), qa_indicators!inner(id, name, category), qa_periods!inner(id, month, year)');

  if (params.serviceType) query = query.eq('service_type', params.serviceType);
  if (params.year) query = query.eq('tahun', params.year);
  if (params.pesertaId) query = query.eq('peserta_id', params.pesertaId);
  if (params.indicatorId) query = query.eq('indicator_id', params.indicatorId);

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

export async function fetchPaginatedTrendData(pIds: string[], year?: number) {
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

export async function getServiceTrendForDashboard(timeframe: '3m' | '6m' | 'all' = '3m') {
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

  const temuan = await fetchPaginatedTrendData(pIds);
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

export async function getServiceTrendForDashboardByRange(year: number, startMonth: number, endMonth: number) {
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

  const temuan = await fetchPaginatedTrendData(pIds, year);
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

export async function getAvailableYears(): Promise<number[]> {
  const { data: rows, error } = await supabaseAdmin.from('qa_periods').select('year');
  if (error) throw error;
  const years = (rows ?? []).map(r => r.year).filter(Boolean);
  return [...new Set(years)].sort((a, b) => b - a);
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

export async function publishRuleVersion(id: string, userId: string) {
  const { data: existing } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .select('status')
    .eq('id', id)
    .single();

  if (!existing) throw new Error('Versi aturan tidak ditemukan');
  if (existing.status !== 'draft') throw new Error('Hanya versi draft yang bisa dipublikasikan');

  const { data: result, error } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .update({
      status: 'published',
      published_by: userId,
      published_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Gagal mempublikasikan versi aturan: ${error.message}`);
  return result;
}

export async function supersedeRuleVersion(id: string, userId: string) {
  const { data: existing } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .select('status')
    .eq('id', id)
    .single();

  if (!existing) throw new Error('Versi aturan tidak ditemukan');
  if (existing.status !== 'published') throw new Error('Hanya versi published yang bisa di-supersede');

  const { data: result, error } = await supabaseAdmin
    .from('qa_service_rule_versions')
    .update({
      status: 'superseded',
      superseded_by: userId,
      superseded_at: new Date().toISOString(),
    })
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

