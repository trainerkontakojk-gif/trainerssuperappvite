import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

export async function createSession(userId: string): Promise<string> {
  const { data, error } = await admin
    .from('telefun_history')
    .insert({
      user_id: userId,
      scenario_title: 'Live Simulation',
      consumer_name: 'Consumer',
      status: 'active',
      messages: [],
    })
    .select('id')
    .single();

  if (error) {
    console.error('[Telefun DB] Failed to create session:', error);
    throw new Error(`Gagal membuat session: ${error.message}`);
  }
  return data.id;
}

export async function updateSession(
  sessionId: string,
  updates: {
    status?: string;
    messages?: unknown[];
    duration_seconds?: number;
  },
): Promise<void> {
  const { error } = await admin
    .from('telefun_history')
    .update(updates)
    .eq('id', sessionId);

  if (error) {
    console.error('[Telefun DB] Failed to update session:', error);
  }
}
