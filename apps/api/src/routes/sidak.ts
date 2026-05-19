import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth';
import * as sidakService from '../services/sidak-service';
import { serviceTypeSchema, categorySchema, createTemuanBatchSchema } from '@trainers/types';

const sidak = new Hono();

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

export { sidak };
