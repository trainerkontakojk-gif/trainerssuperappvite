import { beforeEach, describe, expect, it, vi } from "vitest";

let tableResults: Record<string, any> = {};

function buildQuery(table: string) {
  const q: any = new Proxy(
    {},
    {
      get(_target, prop) {
        if (prop === "then") {
          return (resolve: any) =>
            resolve(tableResults[table] ?? { data: [], error: null });
        }
        return (..._args: any[]) => q;
      },
    },
  );
  return q;
}

vi.mock("../lib/supabase", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => buildQuery(table)),
  },
  createAdminClient: vi.fn(),
}));

import {
  getIndicators,
  getPeriods,
  hasDraftRuleVersion,
  resolveActivePublishedRuleVersion,
} from "../services/sidak/period-indicator";

describe("SIDAK period indicator DB error handling", () => {
  beforeEach(() => {
    tableResults = {};
  });

  it("throws when periods cannot be loaded", async () => {
    tableResults.qa_periods = {
      data: null,
      error: { message: "periods failed" },
    };

    await expect(getPeriods()).rejects.toThrow("periods failed");
  });

  it("throws when indicators cannot be loaded", async () => {
    tableResults.qa_indicators = {
      data: null,
      error: { message: "indicators failed" },
    };

    await expect(getIndicators("call")).rejects.toThrow("indicators failed");
  });

  it("throws when active rule version lookup fails", async () => {
    tableResults.qa_service_rule_versions = {
      data: null,
      error: { message: "rule version failed" },
    };

    await expect(resolveActivePublishedRuleVersion("call")).rejects.toThrow(
      "rule version failed",
    );
  });

  it("throws when draft rule version lookup fails", async () => {
    tableResults.qa_service_rule_versions = {
      count: null,
      error: { message: "draft failed" },
    };

    await expect(hasDraftRuleVersion("call")).rejects.toThrow("draft failed");
  });
});
