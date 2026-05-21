import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { User } from '@supabase/supabase-js';
import { authMiddleware } from '../middleware/auth';
import * as sidakService from '../services/sidak-service';
import { serviceTypeSchema, categorySchema, createTemuanBatchSchema } from '@trainers/types';

type Variables = { user: User; profile: any };

const sidak = new Hono<{ Variables: Variables }>();

// All SIDAK routes require auth
sidak.use('/*', authMiddleware);

// ── Periods ────────────────────────────────────────────
sidak.get('/periods', async (c) => {
  const periods = await sidakService.getPeriods();
  return c.json({ success: true, data: periods });
});

sidak.post('/periods', async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(2000).max(2100),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data periode tidak valid', details: parsed.error } }, 400);
  }
  const period = await sidakService.createPeriod(parsed.data.month, parsed.data.year);
  return c.json({ success: true, data: period }, 201);
});

// ── Indicators ─────────────────────────────────────────
sidak.get('/indicators', async (c) => {
  const serviceType = c.req.query('service_type');
  const indicators = await sidakService.getIndicators(serviceType);
  return c.json({ success: true, data: indicators });
});

sidak.post('/indicators', async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    service_type: z.enum(['call', 'chat', 'email', 'cso', 'pencatatan', 'bko', 'slik']),
    name: z.string().min(1),
    category: z.enum(['critical', 'non_critical', 'none']),
    bobot: z.number().positive(),
    has_na: z.boolean().optional().default(false),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data indikator tidak valid', details: parsed.error } }, 400);
  }
  const indicator = await sidakService.createIndicator(parsed.data as any);
  return c.json({ success: true, data: indicator }, 201);
});

// ── Temuan (Findings) ──────────────────────────────────
sidak.get('/temuan', async (c) => {
  const peserta_id = c.req.query('peserta_id');
  const period_id = c.req.query('period_id');
  const service_type = c.req.query('service_type');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 50;
  const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!) : 0;

  const result = await sidakService.getTemuan({ peserta_id, period_id, service_type, limit, offset });
  return c.json({ success: true, data: { items: result.data, total: result.total } });
});

sidak.post('/temuan/batch', async (c) => {
  const body = await c.req.json();
  const parsed = createTemuanBatchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data temuan tidak valid', details: parsed.error } }, 400);
  }
  try {
    const result = await sidakService.createTemuanBatch(parsed.data);
    return c.json({ success: true, data: result }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'INSERT_ERROR', message: e.message } }, 400);
  }
});

sidak.put('/temuan/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = z.object({
    nilai: z.number().int().min(0).max(3).optional(),
    ketidaksesuaian: z.string().nullable().optional(),
    sebaiknya: z.string().nullable().optional(),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } }, 400);
  }
  try {
    const result = await sidakService.updateTemuan(id, parsed.data);
    return c.json({ success: true, data: result });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'UPDATE_ERROR', message: e.message } }, 400);
  }
});

sidak.delete('/temuan/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await sidakService.deleteTemuan(id);
    return c.json({ success: true, data: null });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'DELETE_ERROR', message: e.message } }, 400);
  }
});

// ── Agents ─────────────────────────────────────────────
sidak.get('/agents', async (c) => {
  const batch_name = c.req.query('batch_name');
  const tim = c.req.query('tim');
  const search = c.req.query('search');
  const agents = await sidakService.getAgents({ batch_name, tim, search });
  return c.json({ success: true, data: agents });
});

sidak.get('/agents/:id', async (c) => {
  const id = c.req.param('id');
  const year = c.req.query('year') ? parseInt(c.req.query('year')!) : undefined;
  const serviceType = c.req.query('service_type') || undefined;
  try {
    const detail = await sidakService.getAgentDetail(id, year, serviceType);
    return c.json({ success: true, data: detail });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: e.message } }, 404);
  }
});

// ── Dashboard ──────────────────────────────────────────
sidak.get('/dashboard', async (c) => {
  const period_ids = c.req.query('period_ids')?.split(',');
  const service_type = c.req.query('service_type');
  const folder_ids = c.req.query('folder_ids')?.split(',');
  const year = c.req.query('year') ? parseInt(c.req.query('year')!) : undefined;

  const data = await sidakService.getDashboardData({ period_ids, service_type, folder_ids, year });
  return c.json({ success: true, data });
});

// ── Service Weights ────────────────────────────────────
sidak.get('/service-weights', async (c) => {
  const weights = await sidakService.getServiceWeights();
  return c.json({ success: true, data: weights });
});

sidak.put('/service-weights/:serviceType', async (c) => {
  const serviceType = c.req.param('serviceType');
  const body = await c.req.json();
  const parsed = z.object({
    critical_weight: z.number().min(0).max(1).optional(),
    non_critical_weight: z.number().min(0).max(1).optional(),
    scoring_mode: z.enum(['weighted', 'flat', 'no_category']).optional(),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } }, 400);
  }
  try {
    const result = await sidakService.updateServiceWeight(serviceType, parsed.data);
    return c.json({ success: true, data: result });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'UPDATE_ERROR', message: e.message } }, 400);
  }
});

// ── Folders ────────────────────────────────────────────
sidak.get('/folders', async (c) => {
  const { data } = await (await import('../lib/supabase')).supabaseAdmin
    .from('profiler_folders')
    .select('id, name')
    .order('name');
  return c.json({ success: true, data: data ?? [] });
});

// ── Reports ──────────────────────────────────────────────
sidak.post('/reports/data', async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    serviceType: z.string().optional(),
    year: z.number().int().optional(),
    startMonth: z.number().int().min(1).max(12).optional(),
    endMonth: z.number().int().min(1).max(12).optional(),
    folderId: z.string().optional(),
    pesertaId: z.string().optional(),
    indicatorId: z.string().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Filter tidak valid' } }, 400);
  try {
    const rows = await sidakService.getDataReportRows(parsed.data);
    return c.json({ success: true, data: rows });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'REPORT_ERROR', message: e.message } }, 400);
  }
});

sidak.post('/reports/ai/generate', async (c: any) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = z.object({
    modelId: z.string().optional(),
    serviceType: z.string().optional(),
    year: z.number().int().optional(),
    startMonth: z.number().int().min(1).max(12).optional(),
    endMonth: z.number().int().min(1).max(12).optional(),
    pesertaId: z.string().optional(),
    mode: z.enum(['layanan', 'individu']).default('layanan'),
  }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } }, 400);

  try {
    const rows = await sidakService.getDataReportRows({
      serviceType: parsed.data.serviceType,
      year: parsed.data.year,
      startMonth: parsed.data.startMonth,
      endMonth: parsed.data.endMonth,
      pesertaId: parsed.data.mode === 'individu' ? parsed.data.pesertaId : undefined,
    });

    if (rows.length === 0) {
      return c.json({ success: false, error: { code: 'NO_DATA', message: 'Tidak ada data temuan untuk filter yang dipilih.' } }, 400);
    }

    const totalFindings = rows.filter(r => (r.nilai ?? 3) < 3 || r.ketidaksesuaian).length;
    const agentName = rows[0]?.profiler_peserta?.nama ?? 'Unknown';
    const serviceTypes = [...new Set(rows.map(r => r.service_type))].join(', ');

    const { generateGeminiContent } = await import('../lib/gemini');
    const { generateOpenRouterContent } = await import('../lib/openrouter');
    const { resolveModelProvider } = await import('../lib/ai-models');

    const modelInfo = resolveModelProvider(parsed.data.modelId);
    const findingsSample = rows.slice(0, 20).map(r => ({
      agent: r.profiler_peserta?.nama,
      service: r.service_type,
      parameter: r.qa_indicators?.name,
      nilai: r.nilai,
      ketidaksesuaian: r.ketidaksesuaian,
      sebaiknya: r.sebaiknya,
    }));

    const prompt = `Buat laporan analisis kualitas QA dalam Bahasa Indonesia berdasarkan data berikut:

Periode: ${parsed.data.startMonth ? `${parsed.data.startMonth}-${parsed.data.endMonth ?? '?'}/${parsed.data.year}` : `${parsed.data.year || 'Semua'}`}
Mode: ${parsed.data.mode}
${parsed.data.mode === 'individu' ? `Nama Agen: ${agentName}` : `Tipe Layanan: ${serviceTypes}`}
Total Temuan: ${totalFindings}
Total Baris Data: ${rows.length}

Sample Data (20 baris pertama):
${JSON.stringify(findingsSample, null, 2)}

Buat laporan dengan format JSON:
{
  "executiveSummary": "Ringkasan eksekutif 2-3 paragraf",
  "keyFindings": ["Temuan penting 1", "Temuan penting 2", "Temuan penting 3"],
  "scoreAnalysis": "Analisis skor dan tren",
  "recommendations": ["Rekomendasi 1", "Rekomendasi 2", "Rekomendasi 3"],
  "priorityAreas": ["Area prioritas perbaikan 1", "Area prioritas perbaikan 2"]
}`;

    const contents = [{ role: 'user', parts: [{ text: prompt }] }] as any;
    const genOptions = {
      model: modelInfo.modelId,
      contents,
      temperature: 0.5,
      usageContext: { module: 'qa-analyzer' as const, action: 'report_generation' },
      userId: user?.id,
    };

    const result = modelInfo.provider === 'openrouter'
      ? await generateOpenRouterContent(genOptions)
      : await generateGeminiContent(genOptions);

    if (!result.success) {
      return c.json({ success: false, error: { code: 'AI_ERROR', message: result.error || 'Gagal generate laporan' } }, 500);
    }

    let parsedReport;
    try {
      const cleaned = (result.text || '').replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
      parsedReport = JSON.parse(cleaned);
    } catch {
      parsedReport = { executiveSummary: result.text };
    }

    return c.json({
      success: true,
      data: {
        report: parsedReport,
        metadata: {
          totalRows: rows.length,
          totalFindings,
          agentName: parsed.data.mode === 'individu' ? agentName : undefined,
          serviceTypes,
        },
      },
    });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'REPORT_ERROR', message: e.message } }, 500);
  }
});

sidak.get('/dashboard/available-years', async (c) => {
  try {
    const years = await sidakService.getAvailableYears();
    return c.json({ success: true, data: years });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, 500);
  }
});

sidak.get('/dashboard/trend', async (c) => {
  const yearQuery = c.req.query('year');
  const startMonthQuery = c.req.query('startMonth');
  const endMonthQuery = c.req.query('endMonth');

  try {
    if (yearQuery) {
      const year = parseInt(yearQuery);
      const startMonth = startMonthQuery ? parseInt(startMonthQuery) : 1;
      const endMonth = endMonthQuery ? parseInt(endMonthQuery) : 12;
      const trend = await sidakService.getServiceTrendForDashboardByRange(year, startMonth, endMonth);
      return c.json({ success: true, data: trend });
    } else {
      const trendAll = await sidakService.getServiceTrendForDashboard('all');
      const trendMap = {
        '3m': sidakService.sliceTrendData(trendAll, 3),
        '6m': sidakService.sliceTrendData(trendAll, 6),
        'all': trendAll
      };
      return c.json({ success: true, data: { trendMap } });
    }
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, 500);
  }
});

// ── QA Rule Versions ────────────────────────────────────
sidak.get('/rule-versions', async (c) => {
  const serviceType = c.req.query('service_type');
  try {
    const versions = await sidakService.getRuleVersions(serviceType || undefined);
    return c.json({ success: true, data: versions });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, 500);
  }
});

sidak.post('/rule-versions', async (c) => {
  const user = c.get('user');
  const body = await c.req.json();
  const parsed = z.object({
    service_type: z.enum(['call', 'chat', 'email', 'cso', 'pencatatan', 'bko', 'slik']),
    effective_period_id: z.string().uuid(),
    critical_weight: z.number().min(0).max(1).default(0.5),
    non_critical_weight: z.number().min(0).max(1).default(0.5),
    scoring_mode: z.enum(['weighted', 'flat', 'no_category']).default('weighted'),
    change_reason: z.string().optional(),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data versi aturan tidak valid', details: parsed.error } }, 400);
  }
  try {
    const version = await sidakService.createRuleVersion(parsed.data, user.id);
    return c.json({ success: true, data: version }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, 500);
  }
});

sidak.put('/rule-versions/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = z.object({
    critical_weight: z.number().min(0).max(1).optional(),
    non_critical_weight: z.number().min(0).max(1).optional(),
    scoring_mode: z.enum(['weighted', 'flat', 'no_category']).optional(),
    change_reason: z.string().optional(),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid', details: parsed.error } }, 400);
  }
  try {
    const version = await sidakService.updateRuleVersion(id, parsed.data, user.id);
    return c.json({ success: true, data: version });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, 500);
  }
});

sidak.post('/rule-versions/:id/publish', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  try {
    const version = await sidakService.publishRuleVersion(id, user.id);
    return c.json({ success: true, data: version });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, 500);
  }
});

sidak.post('/rule-versions/:id/supersede', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  try {
    const version = await sidakService.supersedeRuleVersion(id, user.id);
    return c.json({ success: true, data: version });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, 500);
  }
});

sidak.get('/rule-versions/:id/indicators', async (c) => {
  const id = c.req.param('id');
  try {
    const indicators = await sidakService.getRuleVersionIndicators(id);
    return c.json({ success: true, data: indicators });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, 500);
  }
});

sidak.post('/rule-versions/:id/indicators', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = z.object({
    service_type: z.enum(['call', 'chat', 'email', 'cso', 'pencatatan', 'bko', 'slik']),
    name: z.string().min(1),
    category: z.enum(['critical', 'non_critical', 'none']),
    bobot: z.number().positive(),
    has_na: z.boolean().optional().default(false),
    threshold: z.number().optional(),
    sort_order: z.number().int().optional().default(0),
  }).safeParse(body);
  if (!parsed.success) {
    return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data indikator tidak valid', details: parsed.error } }, 400);
  }
  try {
    const indicator = await sidakService.addRuleVersionIndicator({ rule_version_id: id, ...parsed.data }, user.id);
    return c.json({ success: true, data: indicator }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, 500);
  }
});

sidak.delete('/rule-versions/:versionId/indicators/:indicatorId', async (c) => {
  const indicatorId = c.req.param('indicatorId');
  try {
    await sidakService.deleteRuleVersionIndicator(indicatorId);
    return c.json({ success: true, message: 'Indikator berhasil dihapus' });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'INTERNAL_ERROR', message: error.message } }, 500);
  }
});

export { sidak };

