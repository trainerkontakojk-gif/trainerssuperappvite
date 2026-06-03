import { describe, it, expect, vi, beforeEach } from "vitest";
import * as pdktService from "../services/pdkt-service";

const { mockProfilesQuery, mockSupabaseAdmin } = vi.hoisted(() => {
  const mockProfilesQuery = {
    select: vi.fn(),
    in: vi.fn(),
  };

  const mockSupabaseAdmin: any = {
    from: vi.fn((table: string) => {
      if (table === "profiles") return mockProfilesQuery;
      return mockSupabaseAdmin;
    }),
  };

  return { mockProfilesQuery, mockSupabaseAdmin };
});

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: mockSupabaseAdmin,
}));

describe("PDKT Mailbox Permissions and Shared Policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfilesQuery.select.mockReturnThis();
    mockProfilesQuery.in.mockResolvedValue({
      data: [
        { id: "agent-1", full_name: "Agent One", role: "agent" },
        { id: "agent-2", full_name: "Agent Two", role: "agent" },
      ],
      error: null,
    });
  });

  describe("canDeletePdktMailboxItem Helper", () => {
    const ownItem = {
      created_by_user_id: "agent-1",
      user_id: "agent-1",
    };

    const otherItem = {
      created_by_user_id: "agent-2",
      user_id: "agent-2",
    };

    it("allows admin to delete anyone's item", () => {
      expect(
        pdktService.canDeletePdktMailboxItem(
          { id: "admin-1", role: "admin" },
          otherItem,
        ),
      ).toBe(true);
    });

    it("allows trainer to delete anyone's item", () => {
      expect(
        pdktService.canDeletePdktMailboxItem(
          { id: "trainer-1", role: "trainer" },
          otherItem,
        ),
      ).toBe(true);
    });

    it("allows agent/leader to delete own item", () => {
      expect(
        pdktService.canDeletePdktMailboxItem(
          { id: "agent-1", role: "agent" },
          ownItem,
        ),
      ).toBe(true);
      expect(
        pdktService.canDeletePdktMailboxItem(
          { id: "agent-1", role: "leader" },
          ownItem,
        ),
      ).toBe(true);
    });

    it("denies agent/leader from deleting someone else's item", () => {
      expect(
        pdktService.canDeletePdktMailboxItem(
          { id: "agent-1", role: "agent" },
          otherItem,
        ),
      ).toBe(false);
      expect(
        pdktService.canDeletePdktMailboxItem(
          { id: "agent-1", role: "leader" },
          otherItem,
        ),
      ).toBe(false);
    });
  });

  describe("fetchMailboxItems service", () => {
    it("fetches only canonical active rows and maps creator details and permissions", async () => {
      const mockMailboxItems = [
        {
          id: "m-1",
          user_id: "agent-1",
          created_by_user_id: "agent-1",
          status: "open",
          is_shared_copy: false,
          sender_name: "John",
          sender_email: "john@example.com",
        },
        {
          id: "m-2",
          user_id: "agent-2",
          created_by_user_id: "agent-2",
          status: "open",
          is_shared_copy: null,
          sender_name: "Jane",
          sender_email: "jane@example.com",
        },
      ];

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        neq: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({ data: mockMailboxItems, error: null }),
      };

      const result = await pdktService.fetchMailboxItems(
        mockSupabase as any,
        { id: "agent-1", role: "agent" },
      );

      expect(mockSupabase.from).toHaveBeenCalledWith("pdkt_mailbox_items");
      expect(mockSupabase.neq).toHaveBeenCalledWith("status", "deleted");
      expect(mockSupabase.or).toHaveBeenCalledWith(
        "is_shared_copy.eq.false,is_shared_copy.is.null",
      );
      expect(mockSupabase.limit).toHaveBeenCalledWith(100);
      expect(mockSupabaseAdmin.from).toHaveBeenCalledWith("profiles");
      expect(mockProfilesQuery.select).toHaveBeenCalledWith("id, full_name, role");
      expect(mockProfilesQuery.in).toHaveBeenCalledWith("id", [
        "agent-1",
        "agent-2",
      ]);

      expect(result).toHaveLength(2);
      expect(result[0].created_by_user).toEqual({
        id: "agent-1",
        full_name: "Agent One",
        role: "agent",
        is_current_user: true,
      });
      expect(result[0].permissions?.can_delete).toBe(true);

      expect(result[1].created_by_user).toEqual({
        id: "agent-2",
        full_name: "Agent Two",
        role: "agent",
        is_current_user: false,
      });
      expect(result[1].permissions?.can_delete).toBe(false);
    });
  });

  describe("softDeleteMailboxItem service policy checks", () => {
    it("allows admin to delete item owned by agent", async () => {
      const mockItem = {
        id: "m-1",
        user_id: "agent-1",
        created_by_user_id: "agent-1",
      };

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockItem, error: null }),
        rpc: vi.fn().mockResolvedValue({ error: null }),
      };

      await expect(
        pdktService.softDeleteMailboxItem(mockSupabase as any, "m-1", {
          id: "admin-1",
          role: "admin",
        }),
      ).resolves.not.toThrow();

      expect(mockSupabase.rpc).toHaveBeenCalledWith(
        "soft_delete_pdkt_mailbox_item",
        { p_mailbox_id: "m-1" },
      );
    });

    it("throws 403 error when agent tries to delete another user's item", async () => {
      const mockItem = {
        id: "m-1",
        user_id: "agent-2",
        created_by_user_id: "agent-2",
      };

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: mockItem, error: null }),
        rpc: vi.fn(),
      };

      try {
        await pdktService.softDeleteMailboxItem(mockSupabase as any, "m-1", {
          id: "agent-1",
          role: "agent",
        });
        expect.fail("Should have thrown 403 error");
      } catch (err: any) {
        expect(err.message).toContain("Anda hanya dapat menghapus email yang Anda buat sendiri.");
        expect(err.status).toBe(403);
      }

      expect(mockSupabase.rpc).not.toHaveBeenCalled();
    });
  });

  describe("bulkSoftDeleteMailboxItems service", () => {
    it("successfully deletes allowed items and skips/logs others", async () => {
      const mockItems = [
        { id: "m-1", user_id: "agent-1", created_by_user_id: "agent-1" },
        { id: "m-2", user_id: "agent-2", created_by_user_id: "agent-2" },
      ];

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: mockItems, error: null }),
        rpc: vi.fn().mockResolvedValue({ error: null }),
      };

      const result = await pdktService.bulkSoftDeleteMailboxItems(
        mockSupabase as any,
        ["m-1", "m-2", "m-missing"],
        { id: "agent-1", role: "agent" },
      );

      expect(result.successCount).toBe(1); // m-1 only
      expect(result.failureCount).toBe(2); // m-2 (forbidden) and m-missing (missing)
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toContain("tidak diizinkan untuk dihapus");
      expect(result.errors[1]).toContain("tidak ditemukan");
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(1);
      expect(mockSupabase.rpc).toHaveBeenCalledWith("soft_delete_pdkt_mailbox_item", {
        p_mailbox_id: "m-1",
      });
    });

    it("returns deterministic best-effort summary when an RPC rejects", async () => {
      const mockItems = [
        { id: "m-1", user_id: "agent-1", created_by_user_id: "agent-1" },
        { id: "m-2", user_id: "agent-1", created_by_user_id: "agent-1" },
      ];

      const mockSupabase = {
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        in: vi.fn().mockResolvedValue({ data: mockItems, error: null }),
        rpc: vi.fn()
          .mockRejectedValueOnce(new Error("network dropped"))
          .mockResolvedValueOnce({ error: null }),
      };

      const result = await pdktService.bulkSoftDeleteMailboxItems(
        mockSupabase as any,
        ["m-1", "m-missing", "m-2"],
        { id: "agent-1", role: "agent" },
      );

      expect(result).toEqual({
        successCount: 1,
        failureCount: 2,
        errors: [
          "Gagal menghapus email m-1: network dropped",
          "Email dengan ID m-missing tidak ditemukan.",
        ],
      });
      expect(mockSupabase.rpc).toHaveBeenCalledTimes(2);
    });
  });
});
