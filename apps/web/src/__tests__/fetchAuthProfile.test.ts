import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useAuthStore } from '../store/authStore';

const mockMaybeSingle = vi.fn();

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
        })),
      })),
    })),
  },
}));

const { fetchAuthProfile } = await import('../lib/fetchAuthProfile');

describe('fetchAuthProfile', () => {
  beforeEach(() => {
    useAuthStore.setState({ session: null, profile: null });
    localStorage.clear();
    mockMaybeSingle.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches profile and saves to store + localStorage', async () => {
    const profileData = { id: 'u1', email: 'test@x.com', full_name: 'Test', role: 'agent', status: 'active', is_deleted: false };
    mockMaybeSingle.mockResolvedValue({ data: profileData, error: null });

    const result = await fetchAuthProfile('u1');

    expect(result).toEqual(profileData);
    expect(useAuthStore.getState().profile).toEqual(profileData);
    expect(JSON.parse(localStorage.getItem('auth_profile')!)).toEqual(profileData);
  });

  it('returns null and clears store on error', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: { message: 'not found', code: 'PGRST116' } });

    const result = await fetchAuthProfile('u1');

    expect(result).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
    expect(localStorage.getItem('auth_profile')).toBeNull();
  });

  it('normalizes legacy status approved to active', async () => {
    const profileData = { id: 'u1', email: 'test@x.com', full_name: 'Test', role: 'agent', status: 'approved', is_deleted: false };
    mockMaybeSingle.mockResolvedValue({ data: profileData, error: null });

    const result = await fetchAuthProfile('u1');

    expect(result?.status).toBe('active');
    expect(useAuthStore.getState().profile?.status).toBe('active');
  });

  it('normalizes legacy status rejected to inactive', async () => {
    const profileData = { id: 'u1', email: 'test@x.com', full_name: 'Test', role: 'agent', status: 'rejected', is_deleted: false };
    mockMaybeSingle.mockResolvedValue({ data: profileData, error: null });

    const result = await fetchAuthProfile('u1');

    expect(result?.status).toBe('inactive');
  });
});
