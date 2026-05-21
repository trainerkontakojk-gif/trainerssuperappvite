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
    it('inserts valid rows after validation', async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: null, error: null }; // rule_versions (validate)
        if (callCount === 2) return { data: [{ id: 'i1', name: 'Test', service_type: 'call' }], error: null }; // indicators (validate)
        if (callCount === 3) return { data: [], error: null }; // existing (validate)
        if (callCount === 4) return { data: null, error: null }; // rule_versions (create)
        return { data: [{ id: 't1' }], error: null }; // insert
      };
      const r = await sidakService.createTemuanBatch({
        peserta_id: 'p1', period_id: 'per1', service_type: 'call',
        items: [{ indicator_id: 'i1', nilai: 2 }],
      });
      expect(r.inserted).toBe(1);
    });

    it('returns 0 for indicator not matching service_type', async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: null, error: null }; // rule_versions
        if (callCount === 2) return { data: [{ id: 'i1', name: 'Wrong', service_type: 'email' }], error: null }; // indicators
        return { data: [], error: null }; // existing
      };
      const r = await sidakService.createTemuanBatch({
        peserta_id: 'p1', period_id: 'per1', service_type: 'call',
        items: [{ indicator_id: 'i1', nilai: 0 }],
      });
      expect(r.inserted).toBe(0);
    });

    it('friendly msg for FK error', async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: null, error: null }; // rule_versions (validate)
        if (callCount === 2) return { data: [{ id: 'i1', name: 'Test', service_type: 'call' }], error: null }; // indicators (validate)
        if (callCount === 3) return { data: [], error: null }; // existing (validate)
        if (callCount === 4) return { data: null, error: null }; // rule_versions (create)
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

  describe('saveReportArchive', () => {
    it('inserts and returns with id', async () => {
      pendingResolve = () => ({ data: { id: 'r1', title: 'Test', report_type: 'ai', created_at: '2025-01-01' }, error: null });
      const r = await sidakService.saveReportArchive({
        userId: 'u1', title: 'Test', reportType: 'ai',
        filterParams: {}, reportData: { summary: 'test' },
      });
      expect(r.id).toBe('r1');
      expect(r.report_type).toBe('ai');
    });

    it('throws on error', async () => {
      pendingResolve = () => ({ data: null, error: { message: 'insert failed' } });
      await expect(sidakService.saveReportArchive({
        userId: 'u1', title: 'Test', reportType: 'ai',
        filterParams: {}, reportData: {},
      })).rejects.toThrow('Gagal menyimpan report');
    });
  });

  describe('getReportArchives', () => {
    it('returns list for admin', async () => {
      pendingResolve = () => ({ data: [{ id: 'r1', title: 'Report 1' }], error: null });
      const r = await sidakService.getReportArchives('u1', 'admin');
      expect(r).toHaveLength(1);
    });

    it('returns [] when null', async () => {
      pendingResolve = () => ({ data: null, error: null });
      const r = await sidakService.getReportArchives('u1', 'agent');
      expect(r).toEqual([]);
    });
  });

  describe('getReportArchiveById', () => {
    it('returns report for owner', async () => {
      pendingResolve = () => ({ data: { id: 'r1', title: 'My Report', user_id: 'u1' }, error: null });
      const r = await sidakService.getReportArchiveById('r1', 'u1', 'agent');
      expect(r).not.toBeNull();
      expect(r!.id).toBe('r1');
    });

    it('returns null for other user', async () => {
      pendingResolve = () => ({ data: { id: 'r1', user_id: 'u2' }, error: null });
      const r = await sidakService.getReportArchiveById('r1', 'u1', 'agent');
      expect(r).toBeNull();
    });

    it('returns null for non-existent', async () => {
      pendingResolve = () => ({ data: null, error: { message: 'not found' } });
      const r = await sidakService.getReportArchiveById('bad', 'u1', 'agent');
      expect(r).toBeNull();
    });
  });

  describe('deleteReportArchive', () => {
    it('deletes successfully', async () => {
      pendingResolve = () => ({ error: null });
      await expect(sidakService.deleteReportArchive('r1', 'u1', 'admin')).resolves.toBeUndefined();
    });
  });

  describe('refreshDashboardSummary', () => {
    it('returns early when no temuan', async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount <= 2) return { data: [], error: null };
        return { data: [], error: null };
      };
      const r = await sidakService.refreshDashboardSummary('p1', 'call');
      expect(r.agent_count).toBe(0);
      expect(r.message).toBe('No data to summarize');
    });

    it('aggregates and stores summary with temuan', async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: [{ id: 'i1', name: 'Test', category: 'non_critical', bobot: 1 }], error: null };
        if (callCount === 2) return { data: [{ service_type: 'call', critical_weight: 0.5, non_critical_weight: 0.5, scoring_mode: 'weighted' }], error: null };
        if (callCount === 3) return {
          data: [{
            peserta_id: 'a1',
            service_type: 'call',
            indicator_id: 'i1',
            nilai: 2,
            is_phantom_padding: false,
            profiler_peserta: { id: 'a1', nama: 'Agent 1', batch_name: 'B1', tim: 'T1', jabatan: 'Agent' },
          }],
          error: null,
        };
        if (callCount === 4 || callCount === 5) return { data: null, error: null };
        if (callCount === 6 || callCount === 7) return { data: [{ id: 'x' }], error: null };
        return { data: null, error: null };
      };
      const r = await sidakService.refreshDashboardSummary('p1', 'call');
      expect(r.agent_count).toBe(1);
      expect(r.message).toBe('Summary refreshed');
    });
  });

  describe('validateTemuanBatch', () => {
    it('returns all valid when no issues', async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: null, error: null }; // rule_versions (none)
        if (callCount === 2) return { data: [{ id: 'i1', name: 'Test', service_type: 'call' }], error: null }; // indicators
        return { data: [], error: null }; // existing (no dupes)
      };
      const r = await sidakService.validateTemuanBatch({
        peserta_id: 'p1', period_id: 'per1', service_type: 'call',
        items: [{ indicator_id: 'i1', nilai: 2 }],
      });
      expect(r.stats.valid_count).toBe(1);
      expect(r.stats.invalid_count).toBe(0);
      expect(r.stats.skipped_count).toBe(0);
      expect(r.valid).toHaveLength(1);
    });

    it('flags invalid indicator (wrong service_type)', async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: null, error: null }; // rule_versions
        if (callCount === 2) return { data: [{ id: 'i1', name: 'Wrong', service_type: 'email' }], error: null }; // indicators
        return { data: [], error: null }; // existing
      };
      const r = await sidakService.validateTemuanBatch({
        peserta_id: 'p1', period_id: 'per1', service_type: 'call',
        items: [{ indicator_id: 'i1', nilai: 0 }],
      });
      expect(r.stats.invalid_count).toBe(1);
      expect(r.invalid[0].error).toContain('milik layanan email');
    });

    it('flags skipped duplicates', async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1) return { data: null, error: null };
        if (callCount === 2) return { data: [{ id: 'i1', name: 'Test', service_type: 'call' }], error: null };
        return { data: [{ indicator_id: 'i1' }], error: null }; // already exists
      };
      const r = await sidakService.validateTemuanBatch({
        peserta_id: 'p1', period_id: 'per1', service_type: 'call',
        items: [{ indicator_id: 'i1', nilai: 2 }],
      });
      expect(r.stats.skipped_count).toBe(1);
      expect(r.stats.valid_count).toBe(0);
    });
  });
});
