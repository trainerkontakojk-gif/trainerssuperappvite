import { describe, it, expect, vi, beforeEach } from "vitest";

const updateCalls: any[] = [];

function buildQuery(onAwait: () => any) {
  const q = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (resolve: any) => resolve(onAwait());
        if (prop === "update" || prop === "insert" || prop === "delete") {
          return (payload?: any) => {
            updateCalls.push({ method: String(prop), payload });
            return q;
          };
        }
        return () => q;
      },
    },
  );
  return q;
}

let pendingResolve: () => any = () => ({ data: [], error: null });

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn(() => buildQuery(() => pendingResolve())),
  },
  createAdminClient: vi.fn(),
}));

import * as adminService from "../services/admin-service";

describe("admin-service", () => {
  beforeEach(() => {
    pendingResolve = () => ({ data: [], error: null });
    updateCalls.length = 0;
  });

  describe("getUsers", () => {
    it("returns all profiles", async () => {
      pendingResolve = () => ({
        data: [
          {
            id: "u1",
            email: "test@example.com",
            role: "agent",
            status: "active",
            is_deleted: false,
          },
        ],
        error: null,
      });
      const res = await adminService.getUsers();
      expect(res).toHaveLength(1);
      expect(res[0].email).toBe("test@example.com");
    });
  });

  describe("updateUserStatus", () => {
    it("updates status and logs activity", async () => {
      pendingResolve = () => ({ error: null });
      await expect(
        adminService.updateUserStatus(
          "target-id",
          "approved",
          "caller-id",
          "caller@example.com",
        ),
      ).resolves.toBeUndefined();
      expect(
        updateCalls.some(
          (call) =>
            call.method === "update" && call.payload?.status === "active",
        ),
      ).toBe(true);
    });

    it("maps rejected status to inactive in the database", async () => {
      pendingResolve = () => ({ error: null });
      await expect(
        adminService.updateUserStatus(
          "target-id",
          "rejected",
          "caller-id",
          "caller@example.com",
        ),
      ).resolves.toBeUndefined();
      expect(
        updateCalls.some(
          (call) =>
            call.method === "update" && call.payload?.status === "inactive",
        ),
      ).toBe(true);
    });

    it("prevents self-status updates", async () => {
      await expect(
        adminService.updateUserStatus(
          "caller-id",
          "approved",
          "caller-id",
          "caller@example.com",
        ),
      ).rejects.toThrow(
        "Anda tidak dapat mengubah status akun Anda sendiri dari panel ini",
      );
    });
  });

  describe("updateUserRole", () => {
    it("updates role and logs activity", async () => {
      pendingResolve = () => ({ error: null });
      await expect(
        adminService.updateUserRole(
          "target-id",
          "leader",
          "caller-id",
          "caller@example.com",
          "admin",
        ),
      ).resolves.toBeUndefined();
    });

    it("prevents promoting to admin if caller is trainer", async () => {
      await expect(
        adminService.updateUserRole(
          "target-id",
          "admin",
          "caller-id",
          "caller@example.com",
          "trainer",
        ),
      ).rejects.toThrow("Trainer tidak dapat memberikan role admin");
    });
  });

  describe("deleteUser", () => {
    it("soft deletes user and logs activity", async () => {
      pendingResolve = () => ({ error: null });
      await expect(
        adminService.deleteUser("target-id", "caller-id", "caller@example.com"),
      ).resolves.toBeUndefined();
    });
  });

  describe("getAccessGroups", () => {
    it("returns active access groups from the count view", async () => {
      pendingResolve = () => ({
        data: [
          {
            id: "g1",
            name: "Group A",
            description: "Desc A",
            scope_type: "union",
            is_active: true,
            created_at: "",
            item_count: "4",
          },
        ],
        error: null,
      });

      const res = await adminService.getAccessGroups();

      expect(res).toEqual([
        {
          id: "g1",
          name: "Group A",
          description: "Desc A",
          scope_type: "union",
          is_active: true,
          created_at: "",
          item_count: 4,
        },
      ]);
    });

    it("throws on view query error", async () => {
      pendingResolve = () => ({
        data: null,
        error: { message: "view broke" },
      });

      await expect(adminService.getAccessGroups()).rejects.toThrow("view broke");
    });
  });

  describe("createAccessGroup", () => {
    it("inserts access group", async () => {
      pendingResolve = () => ({
        data: {
          id: "g1",
          name: "New Group",
          description: "Desc",
          scope_type: "tim",
          is_active: true,
          created_at: "",
        },
        error: null,
      });
      const res = await adminService.createAccessGroup("New Group", "Desc");
      expect(res.name).toBe("New Group");
    });
  });

  describe("approveLeaderRequest", () => {
    it("self-approve guard", async () => {
      pendingResolve = () => ({
        data: {
          id: "req-1",
          status: "pending",
          leader_user_id: "caller-id",
        },
        error: null,
      });
      await expect(
        adminService.approveLeaderRequest("req-1", ["g1"], "caller-id"),
      ).rejects.toThrow(
        "Anda tidak dapat menyetujui request akses milik sendiri",
      );
    });

    it("approves request with group linking and rollback on link failure", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1)
          return {
            data: {
              id: "req-1",
              status: "pending",
              leader_user_id: "other-user",
            },
            error: null,
          };
        if (callCount === 2)
          return { data: [{ id: "g1" }], error: null };
        if (callCount === 3)
          return { error: null };
        if (callCount === 4)
          return { error: { message: "link failed" } };
        return { error: null };
      };
      await expect(
        adminService.approveLeaderRequest("req-1", ["g1"], "caller-id"),
      ).rejects.toThrow("Gagal menautkan access group");
      expect(
        updateCalls.some(
          (call) =>
            call.method === "update" &&
            call.payload?.status === "pending" &&
            call.payload?.reviewed_by === null,
        ),
      ).toBe(true);
    });
  });

  describe("reassignLeaderRequestGroups", () => {
    it("self-reassign guard", async () => {
      pendingResolve = () => ({
        data: {
          id: "req-1",
          status: "approved",
          leader_user_id: "caller-id",
        },
        error: null,
      });
      await expect(
        adminService.reassignLeaderRequestGroups(
          "req-1",
          ["g1"],
          "caller-id",
        ),
      ).rejects.toThrow("Anda tidak dapat mengubah akses milik sendiri");
    });

    it("re-check throws when request no longer approved", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1)
          return {
            data: {
              id: "req-1",
              status: "approved",
              leader_user_id: "other-user",
            },
            error: null,
          };
        if (callCount === 2)
          return { data: [{ id: "g1" }], error: null };
        if (callCount === 3)
          return {
            data: [{ access_group_id: "old-g" }],
            error: null,
          };
        if (callCount === 4)
          return { data: null, error: { message: "not found" } };
        return { error: null };
      };
      await expect(
        adminService.reassignLeaderRequestGroups(
          "req-1",
          ["g1"],
          "caller-id",
        ),
      ).rejects.toThrow(
        "Akses sudah tidak aktif. Permintaan mungkin sudah dicabut.",
      );
    });

    it("rolls back old links when insert fails", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1)
          return {
            data: {
              id: "req-1",
              status: "approved",
              leader_user_id: "other-user",
            },
            error: null,
          };
        if (callCount === 2)
          return { data: [{ id: "g1" }], error: null };
        if (callCount === 3)
          return {
            data: [{ access_group_id: "old-g" }],
            error: null,
          };
        if (callCount === 4)
          return {
            data: { id: "req-1", status: "approved" },
            error: null,
          };
        if (callCount === 5)
          return { error: null };
        if (callCount === 6)
          return { error: { message: "insert failed" } };
        return { error: null };
      };
      await expect(
        adminService.reassignLeaderRequestGroups(
          "req-1",
          ["g1"],
          "caller-id",
        ),
      ).rejects.toThrow("Gagal menyimpan access group baru. Perubahan dibatalkan.");
      const rollbackInserts = updateCalls.filter(
        (call) =>
          call.method === "insert" &&
          Array.isArray(call.payload) &&
          call.payload.some(
            (item: any) => item?.access_group_id === "old-g",
          ),
      );
      expect(rollbackInserts.length).toBeGreaterThanOrEqual(1);
    });

    it("completes reassign successfully", async () => {
      let callCount = 0;
      pendingResolve = () => {
        callCount++;
        if (callCount === 1)
          return {
            data: {
              id: "req-1",
              status: "approved",
              leader_user_id: "other-user",
            },
            error: null,
          };
        if (callCount === 2)
          return { data: [{ id: "g1" }], error: null };
        if (callCount === 3)
          return {
            data: [{ access_group_id: "old-g" }],
            error: null,
          };
        if (callCount === 4)
          return {
            data: { id: "req-1", status: "approved" },
            error: null,
          };
        if (callCount === 5)
          return { error: null };
        if (callCount === 6)
          return { error: null };
        return { error: null };
      };
      await expect(
        adminService.reassignLeaderRequestGroups(
          "req-1",
          ["g1"],
          "caller-id",
        ),
      ).resolves.toBeUndefined();
    });
  });
});
