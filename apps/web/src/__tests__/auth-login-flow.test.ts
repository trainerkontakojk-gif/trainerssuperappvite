import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("Auth Login Flow Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubGlobal("fetch", vi.fn());
    vi.stubGlobal("window", { ...window, location: { href: "" } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("fetchApi CSRF header", () => {
    it("adds X-Requested-With header to all API calls", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ success: true, data: { ok: true } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchApi } = await import("../hooks/useApi");
      await fetchApi("/test");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-Requested-With"]).toBe("XMLHttpRequest");
    });

    it("includes X-Requested-With alongside Authorization header", async () => {
      localStorage.setItem("auth_token", "test-token");

      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ success: true, data: { ok: true } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchApi } = await import("../hooks/useApi");
      await fetchApi("/test");

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-Requested-With"]).toBe("XMLHttpRequest");
      expect(options.headers["Authorization"]).toBe("Bearer test-token");
    });
  });

  describe("fetchApi 401 interception", () => {
    it("clears localStorage and triggers hard redirect on 401", async () => {
      localStorage.setItem("auth_token", "expired-token");
      localStorage.setItem("auth_profile", JSON.stringify({ id: "u1" }));
      localStorage.setItem("trainers_login_time", "1234567890");
      localStorage.setItem("trainers_last_activity", "1234567890");

      let redirectUrl = "";
      vi.stubGlobal("window", {
        ...window,
        location: { href: "" },
      });
      Object.defineProperty(window, "location", {
        value: { href: "" },
        writable: true,
        configurable: true,
      });
      Object.defineProperty(window.location, "href", {
        get() {
          return redirectUrl;
        },
        set(v: string) {
          redirectUrl = v;
        },
        configurable: true,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        status: 401,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ success: false, error: { message: "Unauthorized" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchApi } = await import("../hooks/useApi");
      try {
        await fetchApi("/protected");
      } catch (_) {}

      expect(localStorage.getItem("auth_token")).toBeNull();
      expect(localStorage.getItem("auth_profile")).toBeNull();
      expect(localStorage.getItem("trainers_login_time")).toBeNull();
      expect(localStorage.getItem("trainers_last_activity")).toBeNull();
      expect(redirectUrl).toBe("/");
    });

    it("throws human-friendly error message on 401", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 401,
        headers: new Headers({ "content-type": "application/json" }),
        json: () => Promise.resolve({ success: false, error: { message: "Unauthorized" } }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchApi } = await import("../hooks/useApi");
      await expect(fetchApi("/protected")).rejects.toThrow(
        "Sesi telah berakhir. Silakan login kembali.",
      );
    });

    it("does not redirect on non-401 errors", async () => {
      localStorage.setItem("auth_token", "valid-token");
      let redirectUrl = "";
      Object.defineProperty(window.location, "href", {
        get() {
          return redirectUrl;
        },
        set(v: string) {
          redirectUrl = v;
        },
        configurable: true,
      });

      const mockFetch = vi.fn().mockResolvedValue({
        status: 500,
        headers: new Headers({ "content-type": "application/json" }),
        json: () =>
          Promise.resolve({
            success: false,
            error: { message: "Internal Server Error" },
          }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const { fetchApi } = await import("../hooks/useApi");
      try {
        await fetchApi("/test");
      } catch (_) {}

      expect(localStorage.getItem("auth_token")).toBe("valid-token");
      expect(redirectUrl).toBe("");
    });
  });

  describe("UserProfile type accepts qa role", () => {
    it("allows qa role assignment at type level", () => {
      const profile: import("@trainers/types").UserProfile = {
        id: "qa-1",
        email: "qa@test.com",
        full_name: "QA Tester",
        role: "qa",
        status: "active",
      };
      expect(profile.role).toBe("qa");
    });
  });

  describe("ManagedUser type accepts qa role", () => {
    it("allows qa role assignment at type level", () => {
      const user: import("@trainers/types").ManagedUser = {
        id: "qa-1",
        email: "qa@test.com",
        full_name: "QA Tester",
        role: "qa",
        status: "active",
        is_deleted: false,
      };
      expect(user.role).toBe("qa");
    });
  });
});
