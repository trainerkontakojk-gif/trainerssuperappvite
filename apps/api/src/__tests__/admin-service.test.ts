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

import * as adminService from '../services/admin-service';

describe('admin-service', () => {
  beforeEach(() => {
    pendingResolve = () => ({ data: [], error: null });
  });

  describe('getUsers', () => {
    it('returns all profiles', async () => {
      pendingResolve = () => ({
        data: [{ id: 'u1', email: 'test@example.com', role: 'agent', status: 'active', is_deleted: false }],
        error: null,
      });
      const res = await adminService.getUsers();
      expect(res).toHaveLength(1);
      expect(res[0].email).toBe('test@example.com');
    });
  });

  describe('updateUserStatus', () => {
    it('updates status and logs activity', async () => {
      pendingResolve = () => ({ error: null });
      await expect(
        adminService.updateUserStatus('target-id', 'approved', 'caller-id', 'caller@example.com')
      ).resolves.toBeUndefined();
    });

    it('prevents self-status updates', async () => {
      await expect(
        adminService.updateUserStatus('caller-id', 'approved', 'caller-id', 'caller@example.com')
      ).rejects.toThrow('Anda tidak dapat mengubah status akun Anda sendiri dari panel ini');
    });
  });

  describe('updateUserRole', () => {
    it('updates role and logs activity', async () => {
      pendingResolve = () => ({ error: null });
      await expect(
        adminService.updateUserRole('target-id', 'leader', 'caller-id', 'caller@example.com', 'admin')
      ).resolves.toBeUndefined();
    });

    it('prevents promoting to admin if caller is trainer', async () => {
      await expect(
        adminService.updateUserRole('target-id', 'admin', 'caller-id', 'caller@example.com', 'trainer')
      ).rejects.toThrow('Trainer tidak dapat memberikan role admin');
    });
  });

  describe('deleteUser', () => {
    it('soft deletes user and logs activity', async () => {
      pendingResolve = () => ({ error: null });
      await expect(
        adminService.deleteUser('target-id', 'caller-id', 'caller@example.com')
      ).resolves.toBeUndefined();
    });
  });

  describe('getAccessGroups', () => {
    it('returns active access groups', async () => {
      pendingResolve = () => ({
        data: [{ id: 'g1', name: 'Group A', description: 'Desc A', scope_type: 'tim', is_active: true, created_at: '' }],
        error: null,
      });
      const res = await adminService.getAccessGroups();
      expect(res).toHaveLength(1);
      expect(res[0].name).toBe('Group A');
    });
  });

  describe('createAccessGroup', () => {
    it('inserts access group', async () => {
      pendingResolve = () => ({
        data: { id: 'g1', name: 'New Group', description: 'Desc', scope_type: 'tim', is_active: true, created_at: '' },
        error: null,
      });
      const res = await adminService.createAccessGroup('New Group', 'Desc');
      expect(res.name).toBe('New Group');
    });
  });
});
