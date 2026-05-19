import { createClient } from '@supabase/supabase-js';

// Note: Ensure process.env access is correct for your environment
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export function createAdminClient() {
  return supabaseAdmin;
}
