import { supabase } from './supabase';
import { useAuthStore } from '../store/authStore';
import { normalizeProfileStatus } from './profile';
import type { UserProfile } from '@trainers/types';

function isMissingIsDeletedColumn(error: { code?: string; message?: string } | null | undefined) {
  const message = error?.message?.toLowerCase() ?? '';
  return error?.code === '42703' || message.includes('is_deleted');
}

export async function fetchAuthProfile(userId: string): Promise<UserProfile | null> {
  const primary = await supabase
    .from('profiles')
    .select('id, email, full_name, role, status, is_deleted')
    .eq('id', userId)
    .maybeSingle();

  let profile = primary.data;

  if (!profile && primary.error && isMissingIsDeletedColumn(primary.error)) {
    const fallback = await supabase
      .from('profiles')
      .select('id, email, full_name, role, status')
      .eq('id', userId)
      .maybeSingle();

    if (fallback.data) {
      profile = { ...fallback.data, is_deleted: false } as any;
    }
  }

  if (profile) {
    profile.status = normalizeProfileStatus(profile.status) as UserProfile['status'];
    useAuthStore.getState().setProfile(profile);
    localStorage.setItem('auth_profile', JSON.stringify(profile));
  } else {
    useAuthStore.getState().setProfile(null);
    localStorage.removeItem('auth_profile');
  }

  return profile;
}
