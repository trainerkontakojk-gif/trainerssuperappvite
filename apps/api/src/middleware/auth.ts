import { Context, Next } from 'hono';
import { supabaseAdmin } from '../lib/supabase';
import { User } from '@supabase/supabase-js';

type Variables = {
  user: User;
  profile: any;
};

export const authMiddleware = async (c: Context<{ Variables: Variables }>, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, 401);
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid token' } }, 401);
  }

  // Fetch profile status
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('status, role, full_name')
    .eq('id', user.id)
    .single();

  if (!profile || profile.status !== 'active') {
    return c.json({ 
      success: false, 
      error: { code: 'ACCOUNT_PENDING', message: 'Account pending approval' },
    }, 403);
  }

  // Use c.set to store user and profile in context
  c.set('user', user);
  c.set('profile', profile);
  await next();
};
