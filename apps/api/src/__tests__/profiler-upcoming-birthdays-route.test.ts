import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";

let app: Hono<{ Variables: { user: any; profile: any } }>;

const mockGetUpcomingBirthdays = vi.fn();
const mockGetAccessiblePesertaIds = vi.fn().mockResolvedValue(null);

vi.mock("../services/profiler-service", async (importOriginal) => {
  const original = await importOriginal<typeof import("../services/profiler-service")>();
  return {
    ...original,
    getUpcomingBirthdays: mockGetUpcomingBirthdays,
    getAccessiblePesertaIds: mockGetAccessiblePesertaIds,
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

describe("GET /profiler/peserta/upcoming-birthdays", () => {
  it("returns top 5 upcoming birthdays for trainer", async () => {
    mockGetUpcomingBirthdays.mockResolvedValue([
      { id: "1", nama: "A", tgl_lahir: "2000-01-01", batch_name: "B1", daysUntil: 2, age: 26 },
      { id: "2", nama: "B", tgl_lahir: "1999-05-05", batch_name: "B2", daysUntil: 10, age: 27 },
    ]);
    await createApp("trainer");

    const res = await app.request("/api/v1/profiler/peserta/upcoming-birthdays?limit=5", {
      method: "GET",
    });

    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(mockGetUpcomingBirthdays).toHaveBeenCalledWith(5, null);
  });

  it("defaults limit to 5 when not provided", async () => {
    mockGetUpcomingBirthdays.mockResolvedValue([]);
    await createApp("admin");

    const res = await app.request("/api/v1/profiler/peserta/upcoming-birthdays", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    expect(mockGetUpcomingBirthdays).toHaveBeenCalledWith(5, null);
  });

  it("rejects qa role", async () => {
    await createApp("qa");

    const res = await app.request("/api/v1/profiler/peserta/upcoming-birthdays", {
      method: "GET",
    });

    expect(res.status).toBe(403);
    expect(mockGetUpcomingBirthdays).not.toHaveBeenCalled();
  });

  it("passes scoped ids for leader role", async () => {
    mockGetAccessiblePesertaIds.mockResolvedValue(["p1", "p2"]);
    mockGetUpcomingBirthdays.mockResolvedValue([]);
    await createApp("leader");

    const res = await app.request("/api/v1/profiler/peserta/upcoming-birthdays", {
      method: "GET",
    });

    expect(res.status).toBe(200);
    expect(mockGetUpcomingBirthdays).toHaveBeenCalledWith(5, ["p1", "p2"]);
  });
});
