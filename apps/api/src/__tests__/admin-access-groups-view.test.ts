import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();

function buildQuery(result: any) {
  const q = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") return (resolve: any) => resolve(result);
        return () => q;
      },
    },
  );
  return q;
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: (...args: any[]) => fromMock(...args),
    auth: {
      admin: {
        generateLink: vi.fn(),
      },
    },
  },
  createAdminClient: vi.fn(),
}));

import { getAccessGroups } from "../services/admin-service";

describe("getAccessGroups view", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  it("reads from the count view and maps numeric item_count", async () => {
    fromMock.mockImplementation((table: string) => {
      expect(table).toBe("v_access_groups_with_item_counts");
      return buildQuery({
        data: [
          {
            id: "group-a",
            name: "Group A",
            description: "Desc",
            scope_type: "union",
            is_active: true,
            created_at: "2026-06-18T00:00:00Z",
            item_count: "12",
          },
        ],
        error: null,
      });
    });

    await expect(getAccessGroups()).resolves.toEqual([
      {
        id: "group-a",
        name: "Group A",
        description: "Desc",
        scope_type: "union",
        is_active: true,
        created_at: "2026-06-18T00:00:00Z",
        item_count: 12,
      },
    ]);
  });

  it("returns empty array when the view returns no rows", async () => {
    fromMock.mockImplementation(() =>
      buildQuery({
        data: [],
        error: null,
      }),
    );

    await expect(getAccessGroups()).resolves.toEqual([]);
  });

  it("throws on query error", async () => {
    fromMock.mockImplementation(() =>
      buildQuery({
        data: null,
        error: { message: "view failed" },
      }),
    );

    await expect(getAccessGroups()).rejects.toThrow("view failed");
  });
});
