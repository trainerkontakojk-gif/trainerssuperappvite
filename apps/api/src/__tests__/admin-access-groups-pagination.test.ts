import { describe, it, expect, vi } from "vitest";

const groupRows = [
  {
    id: "group-a",
    name: "Group A",
    description: "A",
    scope_type: "tim",
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "group-b",
    name: "Group B",
    description: "B",
    scope_type: "tim",
    is_active: true,
    created_at: "2026-01-02T00:00:00Z",
  },
];

const itemRows = [
  ...Array.from({ length: 1001 }, () => ({ access_group_id: "group-a" })),
  ...Array.from({ length: 250 }, () => ({ access_group_id: "group-b" })),
];

function buildGroupsQuery() {
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => resolve({ data: groupRows, error: null });
        }
        return (..._args: any[]) => q;
      },
    },
  );

  return q;
}

function buildItemsQuery() {
  let rangeFrom = 0;
  let rangeTo = Number.MAX_SAFE_INTEGER;
  let usedRange = false;

  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => {
            if (!usedRange) {
              return resolve({ data: itemRows.slice(0, 1000), error: null });
            }
            return resolve({
              data: itemRows.filter((_, idx) => idx >= rangeFrom && idx <= rangeTo),
              error: null,
            });
          };
        }
        if (prop === "range") {
          return (from: number, to: number) => {
            usedRange = true;
            rangeFrom = from;
            rangeTo = to;
            return q;
          };
        }
        return (..._args: any[]) => q;
      },
    },
  );

  return q;
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === "access_groups") return buildGroupsQuery();
      if (table === "access_group_items") return buildItemsQuery();
      throw new Error(`unexpected table: ${table}`);
    }),
    auth: {
      admin: {
        generateLink: vi.fn(),
      },
    },
  },
  createAdminClient: vi.fn(),
}));

import { getAccessGroups } from "../services/admin-service";

describe("getAccessGroups pagination", () => {
  it("counts access_group_items across all pages", async () => {
    const groups = await getAccessGroups();

    expect(groups).toHaveLength(2);
    expect(groups.find((group) => group.id === "group-a")?.item_count).toBe(1001);
    expect(groups.find((group) => group.id === "group-b")?.item_count).toBe(250);
  });
});
