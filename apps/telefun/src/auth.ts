import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

export async function verifyToken(token: string) {
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return { success: false, error: error?.message || 'Unauthorized' };
    }
    return { success: true, user };
  } catch {
    return { success: false, error: 'Internal Auth Error' };
  }
}
