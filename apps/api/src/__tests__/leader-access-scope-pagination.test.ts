import { describe, it, expect, vi } from "vitest";

const requestRows = [
  {
    id: "req-1",
    module: "sidak",
    status: "approved",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  },
];

const groupLinkRows = [{ access_group_id: "group-1" }];

const accessGroupItems = [
  ...Array.from({ length: 1000 }, (_, i) => ({
    field_name: "peserta_id",
    field_value: `raw-${i + 1}`,
  })),
  { field_name: "batch_name", field_value: "Batch X" },
  { field_name: "tim", field_value: "Tim X" },
  { field_name: "service_type", field_value: "call" },
];

const batchExpansionRows = Array.from({ length: 1001 }, (_, i) => ({
  id: `batch-${i + 1}`,
}));

const timExpansionRows = Array.from({ length: 1001 }, (_, i) => ({
  id: `tim-${i + 1}`,
}));

function buildStaticQuery(rows: any[]) {
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) => resolve({ data: rows, error: null });
        }
        return (..._args: any[]) => q;
      },
    },
  );

  return q;
}

function buildPaginatedQuery(rows: any[]) {
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
              return resolve({ data: rows.slice(0, 1000), error: null });
            }
            return resolve({
              data: rows.filter((_, idx) => idx >= rangeFrom && idx <= rangeTo),
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
      if (table === "leader_access_requests") return buildStaticQuery(requestRows);
      if (table === "leader_access_request_groups") return buildStaticQuery(groupLinkRows);
      if (table === "access_group_items") return buildPaginatedQuery(accessGroupItems);
      if (table === "profiler_peserta") {
        const q: any = new Proxy(
          {},
          {
            get(_target, prop) {
              const state = { values: [] as string[] };

              if (prop === "select") {
                return () => {
                  const inner: any = new Proxy(
                    {},
                    {
                      get(_target2, prop2) {
                        if (prop2 === "in") {
                          return (column: string, values: string[]) => {
                            state.values = values;
                            if (column === "batch_name") {
                              return buildPaginatedQuery(batchExpansionRows);
                            }
                            if (column === "tim") {
                              return buildPaginatedQuery(timExpansionRows);
                            }
                            throw new Error(`unexpected in column: ${column}`);
                          };
                        }
                        return (..._args: any[]) => inner;
                      },
                    },
                  );
                  return inner;
                };
              }

              return (..._args: any[]) => q;
            },
          },
        );
        return q;
      }
      throw new Error(`unexpected table: ${table}`);
    }),
  },
  createAdminClient: vi.fn(),
}));

import { getLeaderScopeSnapshot } from "../services/leader-access-service";

describe("getLeaderScopeSnapshot pagination", () => {
  it("expands access group items, batch scope, and tim scope across all pages", async () => {
    const snapshot = await getLeaderScopeSnapshot("leader-1", "sidak");

    expect(snapshot.requestIds).toEqual(["req-1"]);
    expect(snapshot.batchNames).toEqual(["Batch X"]);
    expect(snapshot.tims).toEqual(["Tim X"]);
    expect(snapshot.serviceTypes).toEqual(["call"]);
    expect(snapshot.pesertaIds).toHaveLength(3002);
  });
});
