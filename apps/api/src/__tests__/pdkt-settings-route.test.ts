import { Hono } from "hono";
import { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockFrom, mockUserClient } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockUserClient: { from: vi.fn() },
}));

vi.mock("../routes/pdkt/route-utils", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../routes/pdkt/route-utils")>()),
  getUserClient: () => mockUserClient,
}));

import { settings } from "../routes/pdkt/settings";

function buildApp() {
  const app = new Hono<{
    Variables: { user: User; profile: { role: string } };
  }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as User);
    c.set("profile", { role: "agent" });
    await next();
  });
  app.route("/settings", settings);
  return app;
}

function requestJson(
  app: ReturnType<typeof buildApp>,
  body: unknown,
  version?: string,
) {
  return app.request("/settings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(version ? { "x-settings-version": version } : {}),
    },
    body: JSON.stringify(body),
  });
}

function requestGet(app: ReturnType<typeof buildApp>) {
  return app.request("/settings");
}

describe("PDKT settings guarded persistence", () => {
  beforeEach(() => {
    mockFrom.mockReset();
    mockUserClient.from.mockImplementation(mockFrom);
  });

  it("emits the current version on GET, including absent rows", async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    });

    const response = await requestGet(buildApp());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-settings-version")).toBe("absent");
    expect(await response.json()).toEqual({ success: true, data: null });
  });

  it("emits an existing row's updated_at version on GET", async () => {
    const version = "2026-07-29T08:00:00.000Z";
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { settings: { pdkt: { scenarios: [] } }, updated_at: version },
        error: null,
      }),
    });

    const response = await requestGet(buildApp());

    expect(response.status).toBe(200);
    expect(response.headers.get("x-settings-version")).toBe(version);
  });

  it("preserves other namespaces and emits the selected saved row version", async () => {
    const version = "2026-07-29T08:00:00.000Z";
    const savedVersion = "2026-07-29T08:01:00.000Z";
    const update = vi.fn().mockReturnThis();
    const eq = vi.fn().mockReturnThis();
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          settings: { ketik: { selectedModel: "ketik-model" } },
          updated_at: version,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          user_id: "user-1",
          settings: { saved: true },
          updated_at: savedVersion,
        },
        error: null,
      });
    const upsert = vi.fn();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq,
      maybeSingle,
      update,
      upsert,
    });

    const response = await requestJson(
      buildApp(),
      { settings: { scenarios: [{ id: "scenario-1" }] } },
      version,
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-settings-version")).toBe(savedVersion);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        user_id: "user-1",
        settings: { saved: true },
        updated_at: savedVersion,
      },
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: "user-1",
        settings: {
          ketik: { selectedModel: "ketik-model" },
          pdkt: { scenarios: [{ id: "scenario-1" }] },
        },
      }),
    );
    expect(eq).toHaveBeenCalledWith("updated_at", version);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a sequential stale client version after another save reaches V+1", async () => {
    const version = "2026-07-29T08:00:00.000Z";
    const newerVersion = "2026-07-29T08:01:00.000Z";
    const update = vi.fn().mockReturnThis();
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: { settings: {}, updated_at: version },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { user_id: "user-1", updated_at: newerVersion },
        error: null,
      })
      .mockResolvedValueOnce({
        data: { settings: {}, updated_at: newerVersion },
        error: null,
      });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
      update,
    });

    const app = buildApp();
    const first = await requestJson(
      app,
      { settings: { scenarios: [{ id: "newer-scenario" }] } },
      version,
    );
    const stale = await requestJson(
      app,
      { settings: { scenarios: [{ id: "stale-scenario" }] } },
      version,
    );

    expect(first.status).toBe(200);
    expect(first.headers.get("x-settings-version")).toBe(newerVersion);
    expect(stale.status).toBe(409);
    expect((await stale.json()).error.code).toBe("SETTINGS_CONFLICT");
    expect(update).toHaveBeenCalledTimes(1);
  });

  it("maps a stale compare-and-swap to SETTINGS_CONFLICT HTTP 409", async () => {
    const update = vi.fn().mockReturnThis();
    const maybeSingle = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          settings: { ketik: { selectedModel: "newer" } },
          updated_at: "2026-07-29T08:00:00.000Z",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null });
    const upsert = vi.fn();
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle,
      update,
      upsert,
    });

    const response = await requestJson(
      buildApp(),
      { settings: { scenarios: [{ id: "stale-scenario" }] } },
      "2026-07-29T07:59:00.000Z",
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: "SETTINGS_CONFLICT",
        message: expect.any(String),
      },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("maps a unique insert race to SETTINGS_CONFLICT HTTP 409", async () => {
    const insert = vi.fn().mockReturnThis();
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      insert,
      single,
    });

    const response = await requestJson(buildApp(), {
      settings: { scenarios: [{ id: "scenario-1" }] },
    });

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("SETTINGS_CONFLICT");
  });
});
