import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { User } from '@supabase/supabase-js';
import { authMiddleware } from '../middleware/auth';
import { createAdminClient } from '../lib/supabase';

type Variables = { user: User; profile: any };

const telefun = new Hono<{ Variables: Variables }>();
telefun.use('*', authMiddleware);

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

export { telefun };
