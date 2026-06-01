import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAuthStore } from "../store/authStore";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

let authStateCallback:
  | ((event: AuthChangeEvent, session: Session | null) => void)
  | null = null;
const mockOnAuthStateChange = vi.fn();
const mockGetUser = vi.fn();
const mockGetSession = vi.fn();

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      onAuthStateChange: (
        cb: (event: AuthChangeEvent, session: Session | null) => void,
      ) => {
        authStateCallback = cb;
        return mockOnAuthStateChange;
      },
      getUser: mockGetUser,
      getSession: mockGetSession,
    },
  },
}));

vi.mock("../lib/fetchAuthProfile", () => ({
  fetchAuthProfile: vi
    .fn()
    .mockResolvedValue({
      id: "u1",
      email: "test@x.com",
      role: "agent",
      status: "active",
    }),
}));

const { initAuth } = await import("../store/authInit");

describe("initAuth", () => {
  beforeEach(() => {
    useAuthStore.setState({ session: null, profile: null });
    localStorage.clear();
    authStateCallback = null;
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    });
    mockGetUser.mockReset();
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
    mockGetSession.mockReset();
    mockGetSession.mockResolvedValue({ data: { session: null }, error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("onAuthStateChange callback is synchronous and defers profile hydration", () => {
    const fakeSession = { access_token: "tok1", user: { id: "u1" } } as Session;
    initAuth();

    expect(authStateCallback).not.toBeNull();

    authStateCallback!("SIGNED_IN", fakeSession);

    expect(localStorage.getItem("auth_token")).toBe("tok1");
    expect(useAuthStore.getState().session).toEqual(fakeSession);
    // Profile should NOT be set immediately (deferred via queueMicrotask)
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it("on SIGNED_OUT clears auth_token and profile", () => {
    localStorage.setItem("auth_token", "tok1");
    localStorage.setItem("auth_profile", JSON.stringify({ id: "u1" }));
    useAuthStore.getState().setProfile({ id: "u1" } as any);

    initAuth();
    authStateCallback!("SIGNED_OUT", null);

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(localStorage.getItem("auth_profile")).toBeNull();
    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });

  it("ignores stale signed-in events while logout guest lock is active", () => {
    localStorage.setItem("trainers_logout_guest_lock", "1");
    localStorage.setItem("auth_token", "stale-token");
    const fakeSession = { access_token: "stale-token", user: { id: "u1" } } as Session;

    initAuth();
    authStateCallback!("SIGNED_IN", fakeSession);

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(useAuthStore.getState().session).toBeNull();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("restores session from stored token", async () => {
    localStorage.setItem("auth_token", "tok1");
    mockGetUser.mockResolvedValue({
      data: { user: { id: "u1" } },
      error: null,
    });
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: "tok1", user: { id: "u1" } } },
      error: null,
    });

    await initAuth();

    expect(mockGetUser).toHaveBeenCalledWith("tok1");
    expect(useAuthStore.getState().session).toEqual({
      access_token: "tok1",
      user: { id: "u1" },
    });
  });

  it("clears token if getUser fails", async () => {
    localStorage.setItem("auth_token", "bad-token");
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error("invalid"),
    });

    await initAuth();

    expect(localStorage.getItem("auth_token")).toBeNull();
    expect(localStorage.getItem("auth_profile")).toBeNull();
  });
});
