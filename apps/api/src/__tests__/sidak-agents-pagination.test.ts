import { describe, it, expect, vi } from "vitest";

const agentRows = Array.from({ length: 1500 }, (_, i) => ({
  id: `agent-${i + 1}`,
  nama: `Agent ${String(i + 1).padStart(4, "0")}`,
  tim: "Tim A",
  batch_name: "Batch A",
  foto_url: null,
  jabatan: "Agent",
}));

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
      if (table === "profiles") return buildPaginatedQuery([]);
      if (table === "profiler_peserta") return buildPaginatedQuery(agentRows);
      throw new Error(`unexpected table: ${table}`);
    }),
  },
  createAdminClient: vi.fn(),
}));

import { getAgents } from "../services/sidak/agent-directory";

describe("getAgents pagination", () => {
  it("returns all agents across the 1000-row boundary", async () => {
    const agents = await getAgents({ showArchived: true });

    expect(agents).toHaveLength(1500);
    expect(agents[0].id).toBe("agent-1");
    expect(agents[1499].id).toBe("agent-1500");
  });
});
