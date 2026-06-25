import { describe, it, expect, vi, beforeEach } from "vitest";

const selectCalls: string[] = [];
const eqCalls: string[] = [];
const getUserCallsArr: { token: string }[] = [];
const adminFromCalls: string[] = [];
const userFromCalls: string[] = [];
const userClientTokens: string[] = [];

let pendingGetUserResult: any = () => ({ data: { user: { id: "user-1" } }, error: null });
let pendingProfileResult: any = () => ({
  data: {
    status: "active",
    role: "trainer",
    full_name: "Test User",
    is_deleted: false,
  },
  error: null,
});

function makeQuery() {
  const self: any = {};
  self.select = (...args: any[]) => {
    selectCalls.push(args.join(","));
    return self;
  };
  self.eq = (...args: any[]) => {
    eqCalls.push(args.join(","));
    return self;
  };
  self.maybeSingle = () => Promise.resolve(pendingProfileResult());
  self.single = () => Promise.resolve(pendingProfileResult());
  return self;
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    auth: {
      getUser: vi.fn((token: string) => {
        getUserCallsArr.push({ token });
        return pendingGetUserResult();
      }),
    },
    from: vi.fn((table: string) => {
      adminFromCalls.push(table);
      return makeQuery();
    }),
  },
  createUserClient: vi.fn((token: string) => {
    userClientTokens.push(token);
    return {
      from: vi.fn((table: string) => {
        userFromCalls.push(table);
        return makeQuery();
      }),
    };
  }),
}));

import { authMiddleware } from "../middleware/auth";

function mockContext(headers: Record<string, string>) {
  const stored = new Map<string, any>();

  const c = {
    req: {
      header: (name: string) => headers[name] ?? null,
    },
    set: (key: string, value: any) => {
      stored.set(key, value);
    },
    get: (key: string) => stored.get(key),
    json: (body: any, statusOrInit?: number | { status?: number }) => {
      const status =
        typeof statusOrInit === "number"
          ? statusOrInit
          : statusOrInit?.status ?? 200;
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  } as any;

  return { c, getStored: (key: string) => stored.get(key) };
}

async function extractResponse(resp: Response): Promise<{ status: number; body: any }> {
  const text = await resp.text();
  return { status: resp.status, body: JSON.parse(text) };
}

describe("authMiddleware", () => {
  beforeEach(() => {
    selectCalls.length = 0;
    eqCalls.length = 0;
    getUserCallsArr.length = 0;
    adminFromCalls.length = 0;
    userFromCalls.length = 0;
    userClientTokens.length = 0;
    pendingGetUserResult = () => ({ data: { user: { id: "user-1" } }, error: null });
    pendingProfileResult = () => ({
      data: {
        status: "active",
        role: "trainer",
        full_name: "Test User",
        is_deleted: false,
      },
      error: null,
    });
  });

  describe("token validation", () => {
    it("returns 401 when no Authorization header", async () => {
      const { c } = mockContext({});
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 when Authorization is not Bearer", async () => {
      const { c } = mockContext({ Authorization: "Basic dGVzdDp0ZXN0" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(401);
      expect(body.error.code).toBe("UNAUTHORIZED");
    });

    it("returns 401 when token is invalid", async () => {
      pendingGetUserResult = () => ({
        data: { user: null },
        error: { message: "Invalid token" },
      });
      const { c } = mockContext({ Authorization: "Bearer invalid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(401);
      expect(body.error.code).toBe("INVALID_TOKEN");
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("profile checks", () => {
    it("passes for active user with valid token", async () => {
      const { c, getStored } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeUndefined();
      expect(next).toHaveBeenCalled();
      expect(getStored("user")).toBeDefined();
      expect(getStored("user").id).toBe("user-1");
      expect(getStored("profile").status).toBe("active");
    });

    it("selects is_deleted column along with status, role, full_name", async () => {
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      await authMiddleware(c, next);

      expect(selectCalls.some((call) => call.includes("is_deleted"))).toBe(true);
      expect(selectCalls.some((call) => call.includes("status"))).toBe(true);
      expect(selectCalls.some((call) => call.includes("role"))).toBe(true);
      expect(selectCalls.some((call) => call.includes("full_name"))).toBe(true);
    });

    it("queries profile with the user-scoped client so RLS still applies", async () => {
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      await authMiddleware(c, next);

      expect(userClientTokens).toEqual(["valid-token"]);
      expect(userFromCalls).toEqual(["profiles"]);
      expect(adminFromCalls).toEqual([]);
    });

    it("returns 403 when profile not found", async () => {
      pendingProfileResult = () => ({ data: null, error: null });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(403);
      expect(body.error.code).toBe("PROFILE_NOT_FOUND");
      expect(body.error.message).toContain("Profil tidak ditemukan");
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 403 when profile query errors", async () => {
      pendingProfileResult = () => ({ data: null, error: { message: "Database error" } });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(403);
      expect(body.error.code).toBe("PROFILE_ERROR");
      expect(body.error.message).toContain("Gagal memverifikasi profil");
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 403 when user is deleted", async () => {
      pendingProfileResult = () => ({
        data: { status: "active", role: "trainer", full_name: "Deleted User", is_deleted: true },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(403);
      expect(body.error.code).toBe("ACCOUNT_DELETED");
      expect(body.error.message).toContain("dinonaktifkan");
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 403 for pending status", async () => {
      pendingProfileResult = () => ({
        data: { status: "pending", role: "agent", full_name: "Pending User", is_deleted: false },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(403);
      expect(body.error.code).toBe("ACCOUNT_PENDING");
      expect(body.error.message).toContain("menunggu persetujuan");
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 403 for inactive status", async () => {
      pendingProfileResult = () => ({
        data: { status: "inactive", role: "agent", full_name: "Inactive User", is_deleted: false },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(403);
      expect(body.error.code).toBe("ACCOUNT_INACTIVE");
      expect(body.error.message).toContain("tidak aktif");
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("legacy status normalization", () => {
    it("normalizes approved to active and passes", async () => {
      pendingProfileResult = () => ({
        data: { status: "approved", role: "trainer", full_name: "Legacy User", is_deleted: false },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it("normalizes rejected to inactive and blocks", async () => {
      pendingProfileResult = () => ({
        data: { status: "rejected", role: "agent", full_name: "Rejected User", is_deleted: false },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(403);
      expect(body.error.code).toBe("ACCOUNT_INACTIVE");
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("deleted user always rejected regardless of status", () => {
    it("rejects deleted user even with active status", async () => {
      pendingProfileResult = () => ({
        data: { status: "active", role: "trainer", full_name: "Deleted Active", is_deleted: true },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(403);
      expect(body.error.code).toBe("ACCOUNT_DELETED");
      expect(next).not.toHaveBeenCalled();
    });

    it("rejects deleted user with legacy approved status", async () => {
      pendingProfileResult = () => ({
        data: { status: "approved", role: "trainer", full_name: "Deleted Legacy", is_deleted: true },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      const result = await authMiddleware(c, next);

      expect(result).toBeInstanceOf(Response);
      const { status, body } = await extractResponse(result as unknown as Response);
      expect(status).toBe(403);
      expect(body.error.code).toBe("ACCOUNT_DELETED");
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("non-admin role access", () => {
    it("passes for trainer role", async () => {
      pendingProfileResult = () => ({
        data: { status: "active", role: "trainer", full_name: "Trainer User", is_deleted: false },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      expect(await authMiddleware(c, next)).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it("passes for leader role", async () => {
      pendingProfileResult = () => ({
        data: { status: "active", role: "leader", full_name: "Leader User", is_deleted: false },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      expect(await authMiddleware(c, next)).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it("passes for qa role", async () => {
      pendingProfileResult = () => ({
        data: { status: "active", role: "qa", full_name: "QA User", is_deleted: false },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      expect(await authMiddleware(c, next)).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it("passes for agent role", async () => {
      pendingProfileResult = () => ({
        data: { status: "active", role: "agent", full_name: "Agent User", is_deleted: false },
        error: null,
      });
      const { c } = mockContext({ Authorization: "Bearer valid-token" });
      const next = vi.fn();
      expect(await authMiddleware(c, next)).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });
  });
});
