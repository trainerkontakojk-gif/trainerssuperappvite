import { supabase } from '../lib/supabase';
import { useAuthStore } from './authStore';

export async function initAuth() {
  function isMissingIsDeletedColumn(error: { code?: string; message?: string } | null | undefined) {
    const message = error?.message?.toLowerCase() ?? '';
    return error?.code === '42703' || message.includes('is_deleted');
  }

  async function fetchProfile(userId: string) {
    const primary = await supabase
      .from('profiles')
      .select('id, email, full_name, role, status, is_deleted')
      .eq('id', userId)
      .maybeSingle();

    if (primary.data) {
      return primary;
    }

    if (primary.error && !isMissingIsDeletedColumn(primary.error)) {
      return primary;
    }

    const fallback = await supabase
      .from('profiles')
      .select('id, email, full_name, role, status')
      .eq('id', userId)
      .maybeSingle();

    if (fallback.data) {
      return {
        data: { ...fallback.data, is_deleted: false },
        error: null,
      };
    }

    return fallback.error ? fallback : primary;
  }

  // Subscribe to authentication state changes
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session?.access_token) {
      localStorage.setItem('auth_token', session.access_token);
      useAuthStore.getState().setSession(session);

      const { data: profile, error: profileError } = await fetchProfile(session.user.id);

      if (profileError) {
        console.warn('[authInit] Error fetching profile in onAuthStateChange:', profileError);
        useAuthStore.getState().setProfile(null);
      } else if (profile) {
        useAuthStore.getState().setProfile(profile);
      }
    } else {
      localStorage.removeItem('auth_token');
      useAuthStore.getState().setSession(null);
      useAuthStore.getState().setProfile(null);
    }
  });

  const token = localStorage.getItem('auth_token');
  if (!token) return;

  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    localStorage.removeItem('auth_token');
    return;
  }

  const { data: { session } } = await supabase.auth.getSession();
  if (session) {
    useAuthStore.getState().setSession(session);
  } else {
    useAuthStore.getState().setSession({ access_token: token, user } as any);
  }

  const { data: profile, error: profileError } = await fetchProfile(user.id);

  if (profileError) {
    console.warn('[authInit] Error fetching profile:', profileError);
    useAuthStore.getState().setProfile(null);
  } else if (profile) {
    useAuthStore.getState().setProfile(profile);
  }
}
