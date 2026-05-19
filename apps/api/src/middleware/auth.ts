import { Context, Next } from 'hono';
import { supabaseAdmin } from '../lib/supabase';

export const authMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Unauthorized' }, 401);
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return c.json({ success: false, error: 'Invalid token' }, 401);
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
      error: 'Account pending approval', 
      code: 'ACCOUNT_PENDING' 
    }, 403);
  }

  // Use c.set to store user and profile in context
  c.set('user', user);
  c.set('profile', profile);
  await next();
};
