import { supabase } from '../lib/supabase';
import { useAuthStore } from './authStore';

export async function initAuth() {
  const token = localStorage.getItem('auth_token');
  if (!token) return;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    localStorage.removeItem('auth_token');
    return;
  }

  useAuthStore.getState().setSession({ access_token: token, user } as any);

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', user.id)
    .single();

  if (profile) {
    useAuthStore.getState().setProfile(profile);
  }
}
