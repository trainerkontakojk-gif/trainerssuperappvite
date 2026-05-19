import { describe, it, expect, vi, beforeEach } from 'vitest';

function buildQuery(onAwait: () => any) {
  const q = new Proxy({}, {
    get(_target, prop) {
      if (prop === 'then') return (resolve: any) => resolve(onAwait());
      return () => q;
    },
  });
  return q;
}

let pendingResolve: () => any = () => ({ data: [], error: null });

vi.mock('../lib/supabase', () => ({
  supabaseAdmin: {
    from: vi.fn(() => buildQuery(() => pendingResolve())),
  },
  createAdminClient: vi.fn(),
}));

import * as profilerService from '../services/profiler-service';

describe('profiler-service', () => {
  beforeEach(() => {
    pendingResolve = () => ({ data: [], error: null });
  });

  describe('getYears', () => {
    it('returns years descending', async () => {
      pendingResolve = () => ({ data: [{ id: 'y1', year: 2025 }], error: null });
      const r = await profilerService.getYears();
      expect(r).toHaveLength(1);
    });
  });

  describe('createYear', () => {
    it('creates year with label', async () => {
      pendingResolve = () => ({ data: { id: 'y1', year: 2025, label: 'Tahun 2025' }, error: null });
      const r = await profilerService.createYear(2025);
      expect(r.label).toBe('Tahun 2025');
    });

    it('throws on error', async () => {
      pendingResolve = () => ({ data: null, error: { message: 'dup' } });
      await expect(profilerService.createYear(2025)).rejects.toThrow();
    });
  });

  describe('getFolders', () => {
    it('returns folders ordered by name', async () => {
      pendingResolve = () => ({ data: [{ id: 'f1', name: 'Batch 1' }], error: null });
      const r = await profilerService.getFolders();
      expect(r).toHaveLength(1);
    });
  });

  describe('createFolder', () => {
    it('creates with params', async () => {
      pendingResolve = () => ({ data: { id: 'f1', name: 'New Folder' }, error: null });
      const r = await profilerService.createFolder({ name: 'New Folder' });
      expect(r.name).toBe('New Folder');
    });
  });

  describe('getPeserta', () => {
    it('fetches with filters', async () => {
      pendingResolve = () => ({ data: [{ id: 'p1', nama: 'Budi' }], count: 1, error: null });
      const r = await profilerService.getPeserta({ batch_name: 'Batch 1' });
      expect(r.data).toHaveLength(1);
      expect(r.total).toBe(1);
    });

    it('defaults to empty array when null', async () => {
      pendingResolve = () => ({ data: null, error: null });
      const r = await profilerService.getPeserta({});
      expect(r.data).toEqual([]);
    });
  });

  describe('getPesertaById', () => {
    it('fetches single', async () => {
      pendingResolve = () => ({ data: { id: 'p1', nama: 'Budi' }, error: null });
      const r = await profilerService.getPesertaById('p1');
      expect(r.nama).toBe('Budi');
    });

    it('throws when not found', async () => {
      pendingResolve = () => ({ data: null, error: { message: 'Not found' } });
      await expect(profilerService.getPesertaById('bad')).rejects.toThrow('Peserta tidak ditemukan');
    });
  });

  describe('getPesertaByBatch', () => {
    it('returns array', async () => {
      pendingResolve = () => ({ data: [{ id: 'p1', nama: 'Budi' }], error: null });
      const r = await profilerService.getPesertaByBatch('Batch 1');
      expect(r).toHaveLength(1);
    });
  });

  describe('createPeserta', () => {
    it('creates with minimal fields', async () => {
      pendingResolve = () => ({ data: { id: 'p1', nama: 'Test' }, error: null });
      const r = await profilerService.createPeserta({ nama: 'Test', batch_name: 'B1' });
      expect(r.nama).toBe('Test');
    });
  });

  describe('updatePeserta', () => {
    it('updates and returns', async () => {
      pendingResolve = () => ({ data: { id: 'p1', nama: 'Updated' }, error: null });
      const r = await profilerService.updatePeserta('p1', { nama: 'Updated' });
      expect(r.nama).toBe('Updated');
    });
  });

  describe('deletePeserta', () => {
    it('resolves on success', async () => {
      pendingResolve = () => ({ error: null });
      await expect(profilerService.deletePeserta('p1')).resolves.toBeUndefined();
    });
  });

  describe('getTeams', () => {
    it('returns teams', async () => {
      pendingResolve = () => ({ data: [{ id: 't1', nama: 'Telepon' }], error: null });
      const r = await profilerService.getTeams();
      expect(r).toHaveLength(1);
    });
  });

  describe('createTeam', () => {
    it('creates team', async () => {
      pendingResolve = () => ({ data: { id: 't1', nama: 'New Team' }, error: null });
      const r = await profilerService.createTeam('New Team');
      expect(r.nama).toBe('New Team');
    });
  });

  describe('deleteTeam', () => {
    it('resolves', async () => {
      pendingResolve = () => ({ error: null });
      await expect(profilerService.deleteTeam('t1')).resolves.toBeUndefined();
    });
  });
});
