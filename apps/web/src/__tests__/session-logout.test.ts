import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "../store/authStore";
import { LOGOUT_GUEST_LOCK_KEY } from "../lib/authLocalState";

const { mockSignOut } = vi.hoisted(() => ({
  mockSignOut: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      signOut: (args: unknown) => mockSignOut(args),
    },
  },
}));

import { signOutLocalSession } from "../lib/session-logout";

describe("signOutLocalSession", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useAuthStore.getState().setSession({ access_token: "abc" } as any);
    useAuthStore.getState().setProfile({
      id: "u1",
      email: "u1@example.com",
      role: "trainer",
      full_name: "Test User",
      status: "active",
      is_deleted: false,
    });
    localStorage.setItem("auth_token", "abc");
    localStorage.setItem("auth_profile", JSON.stringify({ id: "u1" }));
    localStorage.setItem("trainers_login_time", "1");
    localStorage.setItem("trainers_last_activity", "2");
    mockSignOut.mockResolvedValue({ error: null });
  });

  it("uses Supabase local scope for normal logout", async () => {
    await signOutLocalSession({ markLoggedOut: true, redirectTo: null });

    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("clears local auth state and Zustand session data", async () => {
    await signOutLocalSession({ markLoggedOut: true, redirectTo: null });

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(localStorage.getItem("auth_profile")).toBeNull();
    expect(localStorage.getItem("trainers_login_time")).toBeNull();
    expect(localStorage.getItem("trainers_last_activity")).toBeNull();
    expect(localStorage.getItem(LOGOUT_GUEST_LOCK_KEY)).toBe("1");
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it("skips redirect when redirectTo is null", async () => {
    const hrefSetter = vi.fn();
    const originalLocation = window.location;

    delete (window as any).location;
    (window as any).location = {
      ...originalLocation,
      get href() {
        return originalLocation.href;
      },
      set href(value: string) {
        hrefSetter(value);
      },
    };

    await signOutLocalSession({ markLoggedOut: true, redirectTo: null });

    expect(hrefSetter).not.toHaveBeenCalled();

    (window as any).location = originalLocation;
  });
});
