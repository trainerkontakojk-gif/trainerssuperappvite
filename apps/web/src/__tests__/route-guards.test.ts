import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockGetSession, mockFetchAuthProfile } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockFetchAuthProfile: vi.fn(),
}));

vi.mock("../lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: () => mockGetSession(),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
    },
  },
}));

vi.mock("../lib/fetchAuthProfile", () => ({
  fetchAuthProfile: (id: string) => mockFetchAuthProfile(id),
}));

vi.mock("@tanstack/react-router", async () => {
  const actual = await vi.importActual("@tanstack/react-router");
  return {
    ...actual,
    redirect: (opts: { to: string }) => {
      const err = new Error("redirect") as any;
      err.redirectTo = opts.to;
      err.isRedirect = true;
      throw err;
    },
  };
});

async function runGuard(guardFactory: () => () => Promise<void>): Promise<string | null> {
  const guard = guardFactory();
  try {
    await guard();
    return null;
  } catch (e: any) {
    if (e.isRedirect) return e.redirectTo;
    throw e;
  }
}

describe("Route Guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("guardResetPassword", () => {
    it("redirects to / when no session", async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      const { guardResetPassword } = await import("../router");
      const location = await runGuard(guardResetPassword);
      expect(location).toBe("/");
    });

    it("redirects active user to /dashboard", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "u1" } } },
      });
      mockFetchAuthProfile.mockResolvedValue({
        id: "u1",
        role: "trainer",
        status: "active",
        is_deleted: false,
      });
      const { guardResetPassword } = await import("../router");
      const location = await runGuard(guardResetPassword);
      expect(location).toBe("/dashboard");
    });

    it("allows pending user to access reset password", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "u1" } } },
      });
      mockFetchAuthProfile.mockResolvedValue({
        id: "u1",
        role: "trainer",
        status: "pending",
        is_deleted: false,
      });
      const { guardResetPassword } = await import("../router");
      const location = await runGuard(guardResetPassword);
      expect(location).toBeNull();
    });

    it("allows inactive user to access reset password", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "u1" } } },
      });
      mockFetchAuthProfile.mockResolvedValue({
        id: "u1",
        role: "trainer",
        status: "inactive",
        is_deleted: false,
      });
      const { guardResetPassword } = await import("../router");
      const location = await runGuard(guardResetPassword);
      expect(location).toBeNull();
    });

    it("allows deleted active user (may be resetting via email link)", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "u1" } } },
      });
      mockFetchAuthProfile.mockResolvedValue({
        id: "u1",
        role: "trainer",
        status: "active",
        is_deleted: true,
      });
      const { guardResetPassword } = await import("../router");
      const location = await runGuard(guardResetPassword);
      expect(location).toBeNull();
    });

    it("lets error propagate when fetchAuthProfile fails", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "u1" } } },
      });
      mockFetchAuthProfile.mockRejectedValue(new Error("Network Error"));
      const { guardResetPassword } = await import("../router");
      await expect(runGuard(guardResetPassword)).rejects.toThrow("Network Error");
    });
  });

  describe("guardWaitingApproval", () => {
    it("allows access when no session (page handles redirect)", async () => {
      mockGetSession.mockResolvedValue({ data: { session: null } });
      const { guardWaitingApproval } = await import("../router");
      const location = await runGuard(guardWaitingApproval);
      expect(location).toBeNull();
    });

    it("redirects active user to /dashboard", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "u1" } } },
      });
      mockFetchAuthProfile.mockResolvedValue({
        id: "u1",
        role: "trainer",
        status: "active",
        is_deleted: false,
      });
      const { guardWaitingApproval } = await import("../router");
      const location = await runGuard(guardWaitingApproval);
      expect(location).toBe("/dashboard");
    });

    it("allows pending user to access waiting approval", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "u1" } } },
      });
      mockFetchAuthProfile.mockResolvedValue({
        id: "u1",
        role: "agent",
        status: "pending",
        is_deleted: false,
      });
      const { guardWaitingApproval } = await import("../router");
      const location = await runGuard(guardWaitingApproval);
      expect(location).toBeNull();
    });

    it("redirects deleted user to /", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "u1" } } },
      });
      mockFetchAuthProfile.mockResolvedValue({
        id: "u1",
        role: "agent",
        status: "active",
        is_deleted: true,
      });
      const { guardWaitingApproval } = await import("../router");
      const location = await runGuard(guardWaitingApproval);
      expect(location).toBe("/");
    });

    it("redirects inactive user to /", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "u1" } } },
      });
      mockFetchAuthProfile.mockResolvedValue({
        id: "u1",
        role: "agent",
        status: "inactive",
        is_deleted: false,
      });
      const { guardWaitingApproval } = await import("../router");
      const location = await runGuard(guardWaitingApproval);
      expect(location).toBe("/");
    });

    it("lets error propagate when profile fetch fails", async () => {
      mockGetSession.mockResolvedValue({
        data: { session: { user: { id: "u1" } } },
      });
      mockFetchAuthProfile.mockRejectedValue(new Error("Profile fetch error"));
      const { guardWaitingApproval } = await import("../router");
      await expect(runGuard(guardWaitingApproval)).rejects.toThrow("Profile fetch error");
    });
  });
});
