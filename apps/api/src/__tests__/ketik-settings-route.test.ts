import { Hono } from "hono";
import type { User } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_KETIK_SETTINGS } from "@trainers/types";

const {
  mockGetSettingsSnapshot,
  mockSaveSettings,
  mockGetGlobalTemplatesSnapshot,
  mockSaveGlobalTemplates,
} = vi.hoisted(() => ({
  mockGetSettingsSnapshot: vi.fn(),
  mockSaveSettings: vi.fn(),
  mockGetGlobalTemplatesSnapshot: vi.fn(),
  mockSaveGlobalTemplates: vi.fn(),
}));

vi.mock("../services/ketik-service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../services/ketik-service")>()),
  getSettingsSnapshot: mockGetSettingsSnapshot,
  saveSettings: mockSaveSettings,
  getGlobalKetikQuickTemplatesSnapshot: mockGetGlobalTemplatesSnapshot,
  saveGlobalKetikQuickTemplates: mockSaveGlobalTemplates,
}));

import { ketik } from "../routes/ketik";

function buildApp(role = "agent") {
  const app = new Hono<{
    Variables: { user: User; profile: { role: string } };
  }>();
  app.use("*", async (c, next) => {
    c.set("user", { id: "user-1" } as User);
    c.set("profile", { role });
    await next();
  });
  app.route("/", ketik);
  return app;
}

describe("KETIK settings conflict response", () => {
  beforeEach(() => {
    mockGetSettingsSnapshot.mockReset();
    mockSaveSettings.mockReset();
    mockGetGlobalTemplatesSnapshot.mockReset();
    mockSaveGlobalTemplates.mockReset();
  });

  it("emits the current settings version on GET, including absent rows", async () => {
    mockGetSettingsSnapshot.mockResolvedValue({
      settings: DEFAULT_KETIK_SETTINGS,
      version: "absent",
      globalTemplatesVersion: "2026-09-10T10:00:00.000Z",
    });

    const response = await buildApp().request("/settings");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-settings-version")).toBe("absent");
    expect(response.headers.get("x-ketik-templates-version")).toBe(
      "2026-09-10T10:00:00.000Z",
    );
    expect(await response.json()).toEqual({
      success: true,
      data: DEFAULT_KETIK_SETTINGS,
    });
  });

  it("emits the stored updated_at version on GET", async () => {
    const version = "2026-07-29T08:00:00.000Z";
    mockGetSettingsSnapshot.mockResolvedValue({
      settings: DEFAULT_KETIK_SETTINGS,
      version,
      globalTemplatesVersion: "2026-09-10T10:00:00.000Z",
    });

    const response = await buildApp().request("/settings");

    expect(response.status).toBe(200);
    expect(response.headers.get("x-settings-version")).toBe(version);
    expect(response.headers.get("x-ketik-templates-version")).toBe(
      "2026-09-10T10:00:00.000Z",
    );
  });

  it("surfaces settings read errors instead of using the service fallback", async () => {
    mockGetSettingsSnapshot.mockRejectedValue(new Error("DB unavailable"));

    const response = await buildApp().request("/settings");

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      success: false,
      error: { code: "INTERNAL_ERROR", message: "DB unavailable" },
    });
  });

  it("passes the client version and emits the new version on save", async () => {
    mockSaveSettings.mockResolvedValue("2026-07-29T08:01:00.000Z");

    const response = await buildApp().request("/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-settings-version": "2026-07-29T08:00:00.000Z",
      },
      body: JSON.stringify(DEFAULT_KETIK_SETTINGS),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-settings-version")).toBe(
      "2026-07-29T08:01:00.000Z",
    );
    expect(mockSaveSettings).toHaveBeenCalledWith(
      "user-1",
      DEFAULT_KETIK_SETTINGS,
      "2026-07-29T08:00:00.000Z",
    );
    expect(await response.json()).toEqual({
      success: true,
      message: "Pengaturan berhasil disimpan.",
    });
  });

  it("accepts a personal template list in the owner's settings payload", async () => {
    mockSaveSettings.mockResolvedValue("2026-07-29T08:02:00.000Z");
    const personalTemplate = {
      id: "personal-1",
      keyword: "follow-up-pribadi",
      content: "Tulis follow-up pribadi",
    };
    const settingsWithPersonal = {
      ...DEFAULT_KETIK_SETTINGS,
      quickTemplates: [
        ...DEFAULT_KETIK_SETTINGS.quickTemplates,
        personalTemplate,
      ],
      personalQuickTemplates: [personalTemplate],
    };

    const response = await buildApp("agent").request("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settingsWithPersonal),
    });

    expect(response.status).toBe(200);
    expect(mockSaveSettings).toHaveBeenCalledWith(
      "user-1",
      settingsWithPersonal,
      undefined,
    );
  });

  it("maps SETTINGS_CONFLICT to HTTP 409 without changing success responses", async () => {
    mockSaveSettings.mockRejectedValue({
      code: "SETTINGS_CONFLICT",
      status: 409,
      message: "Settings changed elsewhere.",
    });

    const response = await buildApp().request("/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(DEFAULT_KETIK_SETTINGS),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: "SETTINGS_CONFLICT",
        message: "Settings changed elsewhere.",
      },
    });
  });

  it("allows an admin to update the shared templates with its version", async () => {
    mockSaveGlobalTemplates.mockResolvedValue("2026-09-10T10:01:00.000Z");
    const templates = DEFAULT_KETIK_SETTINGS.quickTemplates;

    const response = await buildApp("admin").request("/templates", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "x-ketik-templates-version": "2026-09-10T10:00:00.000Z",
      },
      body: JSON.stringify({ templates }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("x-ketik-templates-version")).toBe(
      "2026-09-10T10:01:00.000Z",
    );
    expect(mockSaveGlobalTemplates).toHaveBeenCalledWith(
      templates,
      "2026-09-10T10:00:00.000Z",
    );
  });

  it("rejects a non-admin shared-template write before calling the service", async () => {
    const response = await buildApp("agent").request("/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templates: DEFAULT_KETIK_SETTINGS.quickTemplates,
      }),
    });

    expect(response.status).toBe(403);
    expect(mockSaveGlobalTemplates).not.toHaveBeenCalled();
  });

  it("maps a stale shared-template version to HTTP 409", async () => {
    mockSaveGlobalTemplates.mockRejectedValue({
      code: "SETTINGS_CONFLICT",
      status: 409,
      message: "Settings changed elsewhere.",
    });

    const response = await buildApp("admin").request("/templates", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        templates: DEFAULT_KETIK_SETTINGS.quickTemplates,
      }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      success: false,
      error: {
        code: "SETTINGS_CONFLICT",
        message: "Settings changed elsewhere.",
      },
    });
  });
});
