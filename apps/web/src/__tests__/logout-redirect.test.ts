import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { supabase } from "../lib/supabase";
import { useAuthStore } from "../store/authStore";

// Mock Supabase
vi.mock("../lib/supabase", () => {
  const mockSupabase = {
    auth: {
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  };
  return { supabase: mockSupabase };
});

describe("Logout and Auth Redirects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.getState().setSession(null);
    useAuthStore.getState().setProfile(null);
  });

  it("should verify Supabase mocks are configured correctly", () => {
    expect(supabase.auth.signOut).toBeDefined();
  });
});
