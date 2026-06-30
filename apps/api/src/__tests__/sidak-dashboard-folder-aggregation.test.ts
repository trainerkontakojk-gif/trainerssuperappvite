import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchAllPagesMock = vi.hoisted(() => vi.fn());

function buildFolderQuery() {
  const state = {
    idFilter: [] as string[],
  };

  const query: any = {
    select: () => query,
    in: (field: string, values: string[]) => {
      if (field === "id") {
        state.idFilter = values;
      }
      return query;
    },
    order: () => query,
    then: (resolve: any) => {
      const folders = state.idFilter.includes("team-call-root")
        ? [
            {
              id: "team-call-root",
              name: "Tim Call",
              parent_id: null,
            },
          ]
        : [];

      resolve({ data: folders, error: null });
    },
  };

  return query;
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((tableName: string) => {
      if (tableName === "profiler_folders") {
        return buildFolderQuery();
      }

      throw new Error(`Unexpected table access in test: ${tableName}`);
    }),
  },
}));

vi.mock("../lib/supabase-pagination", () => ({
  fetchAllPages: (...args: any[]) => fetchAllPagesMock(...args),
}));

import { resolveFolderFiltersByIds } from "../services/sidak/access-scope";

describe("SIDAK folder filter aggregation", () => {
  beforeEach(() => {
    fetchAllPagesMock.mockReset();
    fetchAllPagesMock.mockResolvedValue([
      {
        id: "batch-anis",
        name: "Siti Nur Anisa",
        parent_id: "team-call-root",
      },
      {
        id: "batch-fahmi",
        name: "Muhammad Fahmi Nasrulloh",
        parent_id: "team-call-root",
      },
    ]);
  });

  it("expands a root Tim filter into its child batch names", async () => {
    const result = await resolveFolderFiltersByIds(["team-call-root"]);

    expect(result.selectedFolders).toEqual([
      {
        id: "team-call-root",
        name: "Tim Call",
        parent_id: null,
      },
    ]);
    expect(result.filterNames).toEqual(
      expect.arrayContaining([
        "Siti Nur Anisa",
        "Muhammad Fahmi Nasrulloh",
      ]),
    );
    expect(fetchAllPagesMock).toHaveBeenCalledTimes(1);
  });
});
