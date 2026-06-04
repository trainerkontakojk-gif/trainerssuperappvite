import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

let app: Hono<{ Variables: { user: any; profile: any } }>;

const mockCreatePeserta = vi.fn();

vi.mock("../services/profiler-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/profiler-service")>();
  return {
    ...original,
    createPeserta: mockCreatePeserta,
    getAccessiblePesertaIds: vi.fn().mockResolvedValue(null),
  };
});

vi.mock("../services/activity-log-service", () => ({
  logActivity: vi.fn(),
}));

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
});

afterEach(() => {
  vi.resetModules();
});

describe("POST /profiler/peserta", () => {
  it("allows trainer to create peserta with foto_url", async () => {
    mockCreatePeserta.mockResolvedValue({ id: "p1", nama: "Agent A" });
    await createApp("trainer");

    const res = await app.request("/api/v1/profiler/peserta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batch_name: "Batch 1",
        nama: "Agent A",
        tim: "Telepon",
        jabatan: "cca",
        foto_url: "https://project.supabase.co/storage/v1/object/public/profiler-foto/p1/avatar.jpg",
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(mockCreatePeserta).toHaveBeenCalledWith(
      expect.objectContaining({ nama: "Agent A", foto_url: expect.stringContaining("profiler-foto") }),
    );
  });

  it("rejects leader before service create", async () => {
    await createApp("leader");

    const res = await app.request("/api/v1/profiler/peserta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batch_name: "Batch 1",
        nama: "Agent A",
        tim: "Telepon",
        jabatan: "cca",
      }),
    });

    const json = await res.json();
    expect(res.status).toBe(403);
    expect(json.success).toBe(false);
    expect(mockCreatePeserta).not.toHaveBeenCalled();
  });

  it("rejects qa before service create", async () => {
    await createApp("qa");

    const res = await app.request("/api/v1/profiler/peserta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        batch_name: "Batch 1",
        nama: "Agent A",
        tim: "Telepon",
        jabatan: "cca",
      }),
    });

    expect(res.status).toBe(403);
    expect(mockCreatePeserta).not.toHaveBeenCalled();
  });
});
