import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { User } from '@supabase/supabase-js';
import { authMiddleware } from '../middleware/auth';
import * as adminService from '../services/admin-service';
import {
  updateUserStatusSchema,
  updateUserRoleSchema,
  createAccessGroupSchema,
  updateAccessGroupSchema,
  addAccessGroupItemSchema,
  approveLeaderRequestSchema,
  rejectLeaderRequestSchema,
  revokeLeaderRequestSchema,
  reassignLeaderRequestGroupsSchema
} from '@trainers/types';

type Variables = {
  user: User;
  profile: {
    role: 'admin' | 'trainer' | 'leader' | 'agent';
    status: string;
    full_name: string | null;
  };
};

const admin = new Hono<{ Variables: Variables }>();

// All admin/management operations require authMiddleware
admin.use('/*', authMiddleware);

// Middleware to assert caller is admin or trainer
const managerOnly = async (c: any, next: any) => {
  const profile = c.get('profile');
  if (profile?.role !== 'admin' && profile?.role !== 'trainer') {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Akses ditolak: Hanya Admin atau Trainer yang memiliki akses' } },
      403
    );
  }
  await next();
};

// Middleware to assert caller is admin only
const adminOnly = async (c: any, next: any) => {
  const profile = c.get('profile');
  if (profile?.role !== 'admin') {
    return c.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Akses ditolak: Hanya Admin yang memiliki akses' } },
      403
    );
  }
  await next();
};

// Apply managerOnly to all routes in this sub-router (except possibly some logs if needed, but logs should be managerOnly too)
admin.use('/*', managerOnly);

// ── User Management Endpoints ──────────────────────────────
admin.get('/users', async (c) => {
  try {
    const data = await adminService.getUsers();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, 500);
  }
});

admin.put('/users/:id/status', zValidator('json', updateUserStatusSchema), async (c) => {
  const userId = c.req.param('id');
  const body = c.req.valid('json');
  const user = c.get('user');

  try {
    await adminService.updateUserStatus(userId, body.status, user.id, user.email || 'System');
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

admin.put('/users/:id/role', zValidator('json', updateUserRoleSchema), async (c) => {
  const userId = c.req.param('id');
  const body = c.req.valid('json');
  const user = c.get('user');
  const profile = c.get('profile');

  try {
    await adminService.updateUserRole(userId, body.role, user.id, user.email || 'System', profile.role);
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

admin.delete('/users/:id', adminOnly, async (c) => {
  const userId = c.req.param('id');
  const user = c.get('user');

  try {
    await adminService.deleteUser(userId, user.id, user.email || 'System');
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

// ── Access Groups Endpoints ─────────────────────────────────
admin.get('/access-groups', async (c) => {
  try {
    const data = await adminService.getAccessGroups();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, 500);
  }
});

admin.post('/access-groups', zValidator('json', createAccessGroupSchema), async (c) => {
  const body = c.req.valid('json');
  try {
    const data = await adminService.createAccessGroup(body.name, body.description);
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

admin.put('/access-groups/:id', zValidator('json', updateAccessGroupSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  try {
    await adminService.updateAccessGroup(id, body);
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

admin.get('/access-groups/:id/items', async (c) => {
  const id = c.req.param('id');
  try {
    const data = await adminService.getAccessGroupItems(id);
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, 500);
  }
});

admin.post('/access-groups/:id/items', zValidator('json', addAccessGroupItemSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  try {
    const data = await adminService.addAccessGroupItem(id, body.fieldName, body.fieldValue);
    return c.json({ success: true, data }, 201);
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

admin.delete('/access-groups/items/:itemId', async (c) => {
  const itemId = c.req.param('itemId');
  try {
    await adminService.removeAccessGroupItem(itemId);
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

admin.get('/access-scope-options', async (c) => {
  try {
    const data = await adminService.getAccessScopeOptions();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, 500);
  }
});

// ── Leader Request Endpoints ─────────────────────────────────
admin.get('/leader-requests/pending', async (c) => {
  try {
    const data = await adminService.getPendingLeaderRequests();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, 500);
  }
});

admin.get('/leader-requests/approved', async (c) => {
  try {
    const data = await adminService.getApprovedLeaderRequests();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, 500);
  }
});

admin.post('/leader-requests/:id/approve', zValidator('json', approveLeaderRequestSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const user = c.get('user');
  try {
    await adminService.approveLeaderRequest(id, body.accessGroupIds, user.id);
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

admin.post('/leader-requests/:id/reject', zValidator('json', rejectLeaderRequestSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const user = c.get('user');
  try {
    await adminService.rejectLeaderRequest(id, body.note, user.id);
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

admin.post('/leader-requests/:id/revoke', zValidator('json', revokeLeaderRequestSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const user = c.get('user');
  try {
    await adminService.revokeLeaderRequest(id, body.note, user.id);
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

admin.put('/leader-requests/:id/groups', zValidator('json', reassignLeaderRequestGroupsSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const user = c.get('user');
  try {
    await adminService.reassignLeaderRequestGroups(id, body.accessGroupIds, user.id);
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

admin.get('/activity-logs', async (c) => {
  try {
    const data = await adminService.getActivityLogs();
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'SERVER_ERROR', message: error.message } }, 500);
  }
});

admin.delete('/activity-logs/:id', async (c) => {
  const id = c.req.param('id');
  try {
    await adminService.deleteActivity(id);
    return c.json({ success: true, data: null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'BAD_REQUEST', message: error.message } }, 400);
  }
});

export { admin as adminRouter };

