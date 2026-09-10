import { Hono } from "hono";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { escapePesertaSearchLiteral } from "../services/profiler-service";

const { mockSearch } = vi.hoisted(() => ({ mockSearch: vi.fn() }));

vi.mock("../services/profiler-service", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../services/profiler-service")>();
  return {
    ...actual,
    getAccessiblePesertaIds: vi.fn().mockResolvedValue(null),
    searchPesertaOptions: mockSearch,
  };
});

import { profiler } from "../routes/profiler";

type Variables = { user: User; profile: { role: string } };

function buildApp(role: string) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as User);
    c.set("profile", { role });
    await next();
  });
  app.route("/", profiler);
  return app;
}

describe("profiler peserta options", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearch.mockResolvedValue([
      { id: "1", nama: "Andi", tim: "Tim A", batch_name: "Batch 12" },
    ]);
  });

  it("returns options for admin with exact four fields envelope", async () => {
    const res = await buildApp("admin").request("/peserta/options?search=Andi");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(Object.keys(json.data[0]).sort()).toEqual([
      "batch_name",
      "id",
      "nama",
      "tim",
    ]);
  });

  it("does not collide with dynamic peserta route", async () => {
    const res = await buildApp("admin").request("/peserta/options?search=Andi");
    expect(res.status).not.toBe(404);
    expect(mockSearch).toHaveBeenCalled();
  });

  it("rejects search below minimum length without querying", async () => {
    const res = await buildApp("admin").request("/peserta/options?search=a");
    expect(res.status).toBe(400);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("rejects search above maximum length", async () => {
    const res = await buildApp("admin").request(
      `/peserta/options?search=${"x".repeat(101)}`,
    );
    expect(res.status).toBe(400);
  });

  it("denies non-manager roles without leaking data", async () => {
    const res = await buildApp("agent").request("/peserta/options?search=Andi");
    expect(res.status).toBe(403);
    expect(mockSearch).not.toHaveBeenCalled();
  });

  it("escapes wildcard and backslash literally", () => {
    expect(escapePesertaSearchLiteral("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });
});
