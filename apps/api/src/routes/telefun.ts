import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { User } from '@supabase/supabase-js';
import { createAdminClient } from '../lib/supabase';

type Variables = { user: User; profile: any };

const telefun = new Hono<{ Variables: Variables }>();

telefun.get('/sessions', async (c) => {
  const user = c.get('user');
  const profile = c.get('profile');
  const adminClient = createAdminClient();

  try {
    const isManager = ['admin', 'trainer', 'qa'].includes(profile?.role);
    let query = adminClient
      .from('telefun_history')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (!isManager) {
      query = query.eq('user_id', user.id);
    }

    const { data, error } = await query;
    if (error) throw error;
    return c.json({ success: true, data: data ?? [] });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

telefun.get('/settings', async (c) => {
  const user = c.get('user');
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient
      .from('user_settings')
      .select('settings')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;
    const telefunSettings = data?.settings?.telefun || null;
    return c.json({ success: true, settings: telefunSettings });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

telefun.put('/settings', zValidator('json', z.object({
  selectedModel: z.string(),
  voiceName: z.string(),
  systemInstruction: z.string(),
  consumerName: z.string(),
  consumerGender: z.string(),
  scenarioTitle: z.string().optional(),
  scenarios: z.array(z.object({
    id: z.string(),
    title: z.string(),
    instruction: z.string(),
    isActive: z.boolean(),
  })).optional(),
  consumerTypes: z.array(z.object({
    id: z.string(),
    name: z.string(),
    gender: z.string(),
    description: z.string(),
  })).optional(),
})), async (c) => {
  const user = c.get('user');
  const adminClient = createAdminClient();
  const body = c.req.valid('json');

  try {
    const { data: existing } = await adminClient
      .from('user_settings')
      .select('settings')
      .eq('user_id', user.id)
      .maybeSingle();

    const updatedSettings = {
      ...(existing?.settings || {}),
      telefun: body,
    };

    const { error } = await adminClient
      .from('user_settings')
      .upsert(
        { user_id: user.id, settings: updatedSettings, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );

    if (error) throw error;
    return c.json({ success: true, message: 'Pengaturan Telefun berhasil disimpan.' });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

telefun.get('/history/:id', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const profile = c.get('profile');
  const adminClient = createAdminClient();

  try {
    const { data, error } = await adminClient
      .from('telefun_history')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } }, 404);
    }

    const isManager = ['admin', 'trainer', 'qa'].includes(profile?.role);
    if (!isManager && data.user_id !== user.id) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Anda tidak memiliki akses ke sesi ini.' } }, 403);
    }

    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

telefun.get('/coaching-summary/:id', async (c) => {
  const sessionId = c.req.param('id');
  const user = c.get('user');
  const profile = c.get('profile');
  const adminClient = createAdminClient();

  try {
    const { data: session, error: sessionError } = await adminClient
      .from('telefun_history')
      .select('user_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } }, 404);
    }

    const isManager = ['admin', 'trainer', 'qa'].includes(profile?.role);
    if (!isManager && session.user_id !== user.id) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Anda tidak memiliki akses ke sesi ini.' } }, 403);
    }

    const { data, error } = await adminClient
      .from('telefun_coaching_summary')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (error) throw error;
    return c.json({ success: true, data: data || null });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

telefun.get('/annotations/:id', async (c) => {
  const sessionId = c.req.param('id');
  const user = c.get('user');
  const profile = c.get('profile');
  const adminClient = createAdminClient();

  try {
    const { data: session, error: sessionError } = await adminClient
      .from('telefun_history')
      .select('user_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } }, 404);
    }

    const isManager = ['admin', 'trainer', 'qa'].includes(profile?.role);
    if (!isManager && session.user_id !== user.id) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Anda tidak memiliki akses ke sesi ini.' } }, 403);
    }

    const { data, error } = await adminClient
      .from('telefun_replay_annotations')
      .select('*')
      .eq('session_id', sessionId)
      .order('timestamp_ms', { ascending: true });

    if (error) throw error;
    return c.json({ success: true, data: data ?? [] });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

telefun.post('/annotations/:id', zValidator('json', z.object({
  timestamp_ms: z.number().int(),
  category: z.enum(['strength', 'improvement_area', 'critical_moment', 'technique_used']),
  moment: z.string(),
  text: z.string().max(500),
  is_manual: z.boolean().default(true),
})), async (c) => {
  const sessionId = c.req.param('id');
  const user = c.get('user');
  const profile = c.get('profile');
  const adminClient = createAdminClient();
  const body = c.req.valid('json');

  try {
    const { data: session, error: sessionError } = await adminClient
      .from('telefun_history')
      .select('user_id')
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Sesi tidak ditemukan.' } }, 404);
    }

    const isManager = ['admin', 'trainer', 'qa'].includes(profile?.role);
    if (!isManager && session.user_id !== user.id) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Anda tidak memiliki akses ke sesi ini.' } }, 403);
    }

    const { data, error } = await adminClient
      .from('telefun_replay_annotations')
      .insert({
        session_id: sessionId,
        user_id: session.user_id,
        timestamp_ms: body.timestamp_ms,
        category: body.category,
        moment: body.moment,
        text: body.text,
        is_manual: true
      })
      .select()
      .single();

    if (error) throw error;
    return c.json({ success: true, data });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

telefun.delete('/annotations/:annotationId', async (c) => {
  const annotationId = c.req.param('annotationId');
  const user = c.get('user');
  const profile = c.get('profile');
  const adminClient = createAdminClient();

  try {
    const { data: annotation, error: fetchError } = await adminClient
      .from('telefun_replay_annotations')
      .select('user_id, session_id, is_manual')
      .eq('id', annotationId)
      .maybeSingle();

    if (fetchError) throw fetchError;
    if (!annotation) {
      return c.json({ success: false, error: { code: 'NOT_FOUND', message: 'Anotasi tidak ditemukan.' } }, 404);
    }

    const isManager = ['admin', 'trainer', 'qa'].includes(profile?.role);
    if (!isManager && annotation.user_id !== user.id) {
      return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Anda tidak memiliki akses untuk menghapus anotasi ini.' } }, 403);
    }

    if (!annotation.is_manual) {
      return c.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'Hanya anotasi manual yang dapat dihapus.' } }, 400);
    }

    const { error: deleteError } = await adminClient
      .from('telefun_replay_annotations')
      .delete()
      .eq('id', annotationId)
      .eq('is_manual', true);

    if (deleteError) throw deleteError;
    return c.json({ success: true, message: 'Anotasi berhasil dihapus.' });
  } catch (error: any) {
    return c.json({ success: false, error: { code: 'DATABASE_ERROR', message: error?.message || 'Database error.' } }, 500);
  }
});

export { telefun };
