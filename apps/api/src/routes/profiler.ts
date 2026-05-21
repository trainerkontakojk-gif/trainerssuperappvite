import { Hono } from 'hono';
import { z } from 'zod';
import { requireRole } from '../middleware/role';
import * as profilerService from '../services/profiler-service';

const profiler = new Hono();

// ── Years ────────────────────────────────────────────────
profiler.get('/years', requireRole('admin', 'trainer', 'qa', 'tl', 'spv', 'om'), async (c) => {
  const years = await profilerService.getYears();
  return c.json({ success: true, data: years });
});

profiler.post('/years', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const body = await c.req.json();
  const parsed = z.object({ year: z.number().int().min(2000).max(2100) }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Tahun tidak valid' } }, 400);
  const year = await profilerService.createYear(parsed.data.year);
  return c.json({ success: true, data: year }, 201);
});

profiler.delete('/years/:id', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const id = c.req.param('id');
  try {
    await profilerService.deleteYear(id);
    return c.json({ success: true, data: null });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'DELETE_ERROR', message: e.message } }, 400);
  }
});

// ── Folders ──────────────────────────────────────────────
profiler.get('/folders', requireRole('admin', 'trainer', 'qa', 'tl', 'spv', 'om'), async (c) => {
  const folders = await profilerService.getFolders();
  return c.json({ success: true, data: folders });
});

profiler.post('/folders', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    name: z.string().min(1),
    year_id: z.string().uuid().optional(),
    parent_id: z.string().uuid().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data folder tidak valid' } }, 400);
  const folder = await profilerService.createFolder(parsed.data);
  return c.json({ success: true, data: folder }, 201);
});

profiler.put('/folders/:id', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  const parsed = z.object({ name: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Nama folder tidak valid' } }, 400);
  try {
    const folder = await profilerService.renameFolder(id, parsed.data.name);
    return c.json({ success: true, data: folder });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'UPDATE_ERROR', message: e.message } }, 400);
  }
});

profiler.delete('/folders/:id', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const id = c.req.param('id');
  try {
    await profilerService.deleteFolder(id);
    return c.json({ success: true, data: null });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'DELETE_ERROR', message: e.message } }, 400);
  }
});

profiler.post('/folders/duplicate', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    folder_id: z.string().uuid(),
    target_year_id: z.string().uuid(),
  }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } }, 400);
  try {
    const folder = await profilerService.duplicateFolder(parsed.data.folder_id, parsed.data.target_year_id);
    return c.json({ success: true, data: folder }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'COPY_ERROR', message: e.message } }, 400);
  }
});

// ── Counts ───────────────────────────────────────────────
profiler.get('/counts', requireRole('admin', 'trainer', 'qa', 'tl', 'spv', 'om'), async (c) => {
  const counts = await profilerService.getFolderCounts();
  return c.json({ success: true, data: counts });
});

// ── Peserta ──────────────────────────────────────────────
profiler.get('/peserta', requireRole('admin', 'trainer', 'qa', 'tl', 'spv', 'om'), async (c) => {
  const batch_name = c.req.query('batch_name');
  const tim = c.req.query('tim');
  const search = c.req.query('search');
  const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : undefined;
  const offset = c.req.query('offset') ? parseInt(c.req.query('offset')!) : undefined;

  const result = await profilerService.getPeserta({ batch_name, tim, search, limit, offset });
  return c.json({ success: true, data: { items: result.data, total: result.total } });
});

profiler.get('/peserta/global-pool', requireRole('admin', 'trainer', 'qa', 'tl', 'spv', 'om'), async (c) => {
  const excludeBatch = c.req.query('exclude_batch');
  const pool = await profilerService.getGlobalPesertaPool(excludeBatch);
  return c.json({ success: true, data: pool });
});

profiler.get('/peserta/batch/:batchName', requireRole('admin', 'trainer', 'qa', 'tl', 'spv', 'om'), async (c) => {
  const batchName = c.req.param('batchName');
  const peserta = await profilerService.getPesertaByBatch(batchName);
  return c.json({ success: true, data: peserta });
});

profiler.get('/peserta/:id', requireRole('admin', 'trainer', 'qa', 'tl', 'spv', 'om'), async (c) => {
  const id = c.req.param('id');
  try {
    const peserta = await profilerService.getPesertaById(id);
    return c.json({ success: true, data: peserta });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'NOT_FOUND', message: e.message } }, 404);
  }
});

profiler.post('/peserta', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    batch_name: z.string().min(1),
    nama: z.string().min(1),
    tim: z.string().min(1),
    jabatan: z.string().min(1),
    nomor_urut: z.number().int().optional(),
    foto_url: z.string().nullable().optional(),
    nik_ojk: z.string().nullable().optional(),
    bergabung_date: z.string().nullable().optional(),
    email_ojk: z.string().nullable().optional(),
    no_telepon: z.string().nullable().optional(),
    jenis_kelamin: z.string().nullable().optional(),
    agama: z.string().nullable().optional(),
    tgl_lahir: z.string().nullable().optional(),
    status_perkawinan: z.string().nullable().optional(),
    pendidikan: z.string().nullable().optional(),
    no_ktp: z.string().nullable().optional(),
    no_npwp: z.string().nullable().optional(),
    nomor_rekening: z.string().nullable().optional(),
    nama_bank: z.string().nullable().optional(),
    alamat_tinggal: z.string().nullable().optional(),
    status_tempat_tinggal: z.string().nullable().optional(),
    nama_lembaga: z.string().nullable().optional(),
    jurusan: z.string().nullable().optional(),
    previous_company: z.string().nullable().optional(),
    pengalaman_cc: z.string().nullable().optional(),
    catatan_tambahan: z.string().nullable().optional(),
    keterangan: z.string().nullable().optional(),
  }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data peserta tidak valid', details: parsed.error } }, 400);
  try {
    const peserta = await profilerService.createPeserta(parsed.data);
    return c.json({ success: true, data: peserta }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'CREATE_ERROR', message: e.message } }, 400);
  }
});

profiler.put('/peserta/:id', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();
  try {
    const peserta = await profilerService.updatePeserta(id, body);
    return c.json({ success: true, data: peserta });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'UPDATE_ERROR', message: e.message } }, 400);
  }
});

profiler.delete('/peserta/:id', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const id = c.req.param('id');
  try {
    await profilerService.deletePeserta(id);
    return c.json({ success: true, data: null });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'DELETE_ERROR', message: e.message } }, 400);
  }
});

profiler.post('/peserta/bulk', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    items: z.array(z.object({
      batch_name: z.string().min(1),
      nama: z.string().min(1),
      tim: z.string().min(1),
      jabatan: z.string().min(1),
    })).min(1),
  }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } }, 400);
  try {
    const result = await profilerService.bulkCreatePeserta(parsed.data.items);
    return c.json({ success: true, data: result }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'BULK_INSERT_ERROR', message: e.message } }, 400);
  }
});

profiler.post('/peserta/copy', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    peserta_ids: z.array(z.string().uuid()).min(1),
    target_batch_name: z.string().min(1),
  }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } }, 400);
  try {
    const count = await profilerService.copyPesertaToFolder(parsed.data.peserta_ids, parsed.data.target_batch_name);
    return c.json({ success: true, data: { copied: count } }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'COPY_ERROR', message: e.message } }, 400);
  }
});

profiler.put('/peserta/reorder', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    peserta_ids: z.array(z.string().uuid()),
  }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } }, 400);
  try {
    await profilerService.reorderPeserta(parsed.data.peserta_ids);
    return c.json({ success: true, data: null });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'REORDER_ERROR', message: e.message } }, 400);
  }
});

profiler.post('/peserta/bulk-reorder', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const body = await c.req.json();
  const parsed = z.object({
    updates: z.array(z.object({
      id: z.string().uuid(),
      nomor_urut: z.number().int().min(1)
    })).min(1),
  }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Data tidak valid' } }, 400);
  try {
    await profilerService.bulkReorderPeserta(parsed.data.updates);
    return c.json({ success: true, data: null });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'REORDER_ERROR', message: e.message } }, 400);
  }
});

// ── Teams ────────────────────────────────────────────────
profiler.get('/teams', requireRole('admin', 'trainer', 'qa', 'tl', 'spv', 'om'), async (c) => {
  const teams = await profilerService.getTeams();
  return c.json({ success: true, data: teams });
});

profiler.post('/teams', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const body = await c.req.json();
  const parsed = z.object({ nama: z.string().min(1) }).safeParse(body);
  if (!parsed.success) return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Nama tim tidak valid' } }, 400);
  try {
    const team = await profilerService.createTeam(parsed.data.nama);
    return c.json({ success: true, data: team }, 201);
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'CREATE_ERROR', message: e.message } }, 400);
  }
});

profiler.delete('/teams/:id', requireRole('admin', 'trainer', 'qa'), async (c) => {
  const id = c.req.param('id');
  try {
    await profilerService.deleteTeam(id);
    return c.json({ success: true, data: null });
  } catch (e: any) {
    return c.json({ success: false, error: { code: 'DELETE_ERROR', message: e.message } }, 400);
  }
});

export { profiler };
