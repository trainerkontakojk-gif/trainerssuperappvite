import { describe, it, expect, vi, beforeEach } from 'vitest';

function buildQuery(onAwait: () => any) {
  const q = new Proxy({}, {
    get(target, prop) {
      if (prop === 'then') {
        return (resolve: any) => resolve(onAwait());
      }
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

import * as sidakService from '../services/sidak-service';

describe('sidak-service', () => {
  beforeEach(() => {
    pendingResolve = () => ({ data: [], error: null });
  });

  describe('getPeriods', () => {
    it('returns periods ordered by desc', async () => {
      const fake = [{ id: '1', month: 1, year: 2025 }];
      pendingResolve = () => ({ data: fake, error: null });

      const result = await sidakService.getPeriods();
      expect(result).toEqual(fake);
    });

    it('returns [] when null', async () => {
      pendingResolve = () => ({ data: null, error: null });
      expect(await sidakService.getPeriods()).toEqual([]);
    });
  });

  describe('createPeriod', () => {
    it('adds label', async () => {
      pendingResolve = () => ({ data: { id: '1', month: 3, year: 2025 }, error: null });
      const r = await sidakService.createPeriod(3, 2025);
      expect(r.label).toBe('03/2025');
    });

    it('throws on error', async () => {
      pendingResolve = () => ({ data: null, error: { message: 'dup' } });
      await expect(sidakService.createPeriod(1, 2025)).rejects.toThrow('Failed to create period');
    });
  });

  describe('getIndicators', () => {
    it('filters by service type', async () => {
      pendingResolve = () => ({ data: [{ id: '1' }], error: null });
      expect((await sidakService.getIndicators('call'))).toHaveLength(1);
    });

    it('all without type', async () => {
      pendingResolve = () => ({ data: [{ id: '1' }, { id: '2' }], error: null });
      expect((await sidakService.getIndicators())).toHaveLength(2);
    });
  });

  describe('createTemuanBatch', () => {
    it('inserts rows with rule_version_id and validasi indicator', async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: null, error: null }; // rule_versions: no published version
        if (callCount === 2) return { data: [{ id: 'i1', name: 'Test', service_type: 'call' }], error: null }; // qa_indicators
        return { data: [{ id: 't1' }], error: null }; // insert
      };
      const r = await sidakService.createTemuanBatch({
        peserta_id: 'p1', period_id: 'per1', service_type: 'call',
        items: [{ indicator_id: 'i1', nilai: 2 }],
      });
      expect(r).toHaveLength(1);
    });

    it('rejects indicator not matching service_type', async () => {
      pendingResolve = () => ({ data: [{ id: 'i1', name: 'Wrong', service_type: 'email' }], error: null });
      await expect(sidakService.createTemuanBatch({
        peserta_id: 'p1', period_id: 'per1', service_type: 'call',
        items: [{ indicator_id: 'i1', nilai: 0 }],
      })).rejects.toThrow('milik layanan email');
    });

    it('friendly msg for FK error', async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: null, error: null }; // rule_versions
        if (callCount === 2) return { data: [{ id: 'i1', name: 'Test', service_type: 'call' }], error: null }; // qa_indicators
        return { data: null, error: { message: 'violates foreign key constraint' } }; // insert fails
      };
      await expect(sidakService.createTemuanBatch({
        peserta_id: 'bad', period_id: 'bad', service_type: 'call',
        items: [{ indicator_id: 'i1', nilai: 0 }],
      })).rejects.toThrow('Data tidak valid');
    });
  });

  describe('getTemuan', () => {
    it('applies filters', async () => {
      pendingResolve = () => ({ data: [{ id: 't1' }], count: 1, error: null });
      const r = await sidakService.getTemuan({ peserta_id: 'p1', service_type: 'call' });
      expect(r.total).toBe(1);
    });
  });

  describe('deleteTemuan', () => {
    it('deletes by id', async () => {
      pendingResolve = () => ({ error: null });
      await expect(sidakService.deleteTemuan('t1')).resolves.toBeUndefined();
    });
  });

  describe('getAgents', () => {
    it('searches by name', async () => {
      pendingResolve = () => ({ data: [{ id: 'a1', nama: 'Budi' }], error: null });
      const r = await sidakService.getAgents({ search: 'Budi' });
      expect(r).toHaveLength(1);
  });
});
});
