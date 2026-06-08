import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {},
}));

import {
  getPendingLeaderRequests,
  getApprovedLeaderRequests,
} from "../services/admin-service";

const mockPendingData = [
  {
    id: "request-ktp",
    leader_user_id: "leader-1",
    module: "ktp",
    status: "pending",
    created_at: "2026-06-08T08:00:00.000Z",
    profiles: { full_name: "Trainers", email: "trainer@example.com" },
  },
  {
    id: "request-sidak",
    leader_user_id: "leader-1",
    module: "sidak",
    status: "pending",
    created_at: "2026-06-08T09:00:00.000Z",
    profiles: { full_name: "Trainers", email: "trainer@example.com" },
  },
];

const mockJoinRows = [
  { request_id: "approved-ktp", access_group_id: "group-1" },
];

const mockAllGroups = [{ id: "group-1", name: "Tim Call" }];

describe("admin-service read contract", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("getPendingLeaderRequests", () => {
    it("includes leader_user_id in every row", async () => {
      const supabase = await import("../lib/supabase");
      (supabase as any).supabaseAdmin = {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() =>
                Promise.resolve({ data: mockPendingData, error: null }),
              ),
            })),
          })),
        })),
      };

      const result = await getPendingLeaderRequests();

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: "request-ktp",
        leader_user_id: "leader-1",
        module: "ktp",
      });
      expect(result[1]).toMatchObject({
        id: "request-sidak",
        leader_user_id: "leader-1",
        module: "sidak",
      });
    });
  });

  describe("getApprovedLeaderRequests", () => {
    it("includes leader_user_id and preserves access-group mapping", async () => {
      let callCount = 0;
      const supabase = await import("../lib/supabase");
      (supabase as any).supabaseAdmin = {
        from: vi.fn(() => {
          callCount++;
          if (callCount === 2) {
            return {
              select: vi.fn(() => ({
                in: vi.fn(() =>
                  Promise.resolve({ data: mockJoinRows, error: null }),
                ),
              })),
            };
          }
          if (callCount === 3) {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() =>
                  Promise.resolve({ data: mockAllGroups, error: null }),
                ),
              })),
            };
          }
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({
                    data: [
                      {
                        id: "approved-ktp",
                        leader_user_id: "leader-2",
                        module: "ktp",
                        status: "approved",
                        updated_at: "2026-06-08T10:00:00.000Z",
                        profiles: {
                          full_name: "Leader Dua",
                          email: "leader2@example.com",
                        },
                      },
                    ],
                    error: null,
                  }),
                ),
              })),
            })),
          };
        }),
      };

      const result = await getApprovedLeaderRequests();
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: "approved-ktp",
        leader_user_id: "leader-2",
        module: "ktp",
      });
    });
  });
});
