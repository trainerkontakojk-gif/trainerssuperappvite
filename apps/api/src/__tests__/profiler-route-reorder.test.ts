import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

const mockBulkReorder = vi.fn();
const mockReorder = vi.fn();

vi.mock("../services/profiler-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/profiler-service")>();
  return {
    ...original,
    bulkReorderPeserta: mockBulkReorder,
    reorderPeserta: mockReorder,
    getAccessiblePesertaIds: vi.fn().mockResolvedValue(null),
  };
});

let app: Hono<{ Variables: { user: any; profile: any } }>;

async function createApp(role: string) {
  const { profiler } = await import("../routes/profiler");
  app = new Hono<{ Variables: { user: any; profile: any } }>().basePath("/api");
  app.use("/v1/*", async (c, next) => {
    c.set("user", { id: "test-user-id", email: "test@example.com" });
    c.set("profile", { id: "profile-id", role, email: "test@example.com" });
    await next();
  });
  app.route("/v1/profiler", profiler);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockBulkReorder.mockResolvedValue(undefined);
  mockReorder.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.resetModules();
});

describe("Profiler reorder route", () => {
  it("allows admin to save bulk reorder", async () => {
    await createApp("admin");
    const res = await app.request("/api/v1/profiler/peserta/bulk-reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [
          { id: "11111111-1111-1111-1111-111111111111", nomor_urut: 1 },
          { id: "22222222-2222-2222-2222-222222222222", nomor_urut: 2 },
        ],
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockBulkReorder).toHaveBeenCalledWith([
      { id: "11111111-1111-1111-1111-111111111111", nomor_urut: 1 },
      { id: "22222222-2222-2222-2222-222222222222", nomor_urut: 2 },
    ]);
  });

  it("allows trainer to save bulk reorder", async () => {
    await createApp("trainer");
    const res = await app.request("/api/v1/profiler/peserta/bulk-reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [{ id: "11111111-1111-1111-1111-111111111111", nomor_urut: 1 }],
      }),
    });

    expect(res.status).toBe(200);
    expect(mockBulkReorder).toHaveBeenCalledTimes(1);
  });

  it.each(["leader", "qa"])("rejects %s before calling service", async (role) => {
    await createApp(role);
    const res = await app.request("/api/v1/profiler/peserta/bulk-reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updates: [{ id: "11111111-1111-1111-1111-111111111111", nomor_urut: 1 }],
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(mockBulkReorder).not.toHaveBeenCalled();
  });
});
