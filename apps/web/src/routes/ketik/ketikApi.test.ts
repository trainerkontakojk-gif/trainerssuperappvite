import { beforeEach, describe, expect, it, vi } from "vitest";
import type { KetikAppSettings } from "@trainers/types";

const apiMocks = vi.hoisted(() => ({
  getSettings: vi.fn(),
  putSettings: vi.fn(),
  unwrapResponse: vi.fn(),
}));

vi.mock("../../lib/api", async () => {
  const actual =
    await vi.importActual<typeof import("../../lib/api")>("../../lib/api");
  return {
    ...actual,
    ketikClient: {
      settings: {
        $get: apiMocks.getSettings,
        $put: apiMocks.putSettings,
      },
    },
    unwrapResponse: apiMocks.unwrapResponse,
  };
});

import { safeWriteKetikSettingsBackup } from "../../lib/settings-contract";
import { ketikApi } from "./ketikApi";

const settings = {
  scenarios: [],
  consumerTypes: [],
  quickTemplates: [],
  activeConsumerTypeId: "random",
  identitySettings: {
    displayName: "",
    signatureName: "",
    phoneNumber: "",
    city: "",
  },
  selectedModel: "gpt-5.4-mini",
  simulationDuration: 5,
  responsePacingMode: "realistic",
} satisfies KetikAppSettings;

function response(version: string) {
  return { headers: new Headers({ "x-settings-version": version }) };
}

describe("ketik settings persistence boundary", () => {
  beforeEach(() => {
    apiMocks.getSettings.mockReset();
    apiMocks.putSettings.mockReset();
    apiMocks.unwrapResponse.mockReset();
    vi.unstubAllGlobals();
  });

  it("keeps successful GET/PUT successful when localStorage is unavailable", async () => {
    const serverResponse = response("2026-07-29T08:19:09.000Z");
    apiMocks.getSettings.mockResolvedValue(serverResponse);
    apiMocks.putSettings.mockResolvedValue(
      response("2026-07-30T08:19:09.000Z"),
    );
    apiMocks.unwrapResponse.mockResolvedValue(settings);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    });

    await expect(ketikApi.getSettings("account-a")).resolves.toEqual(settings);
    await expect(
      ketikApi.saveSettings(settings, "account-a"),
    ).resolves.toBeUndefined();

    expect(apiMocks.getSettings).toHaveBeenCalledWith();
    expect(apiMocks.putSettings).toHaveBeenCalledWith(
      { json: settings },
      { headers: { "x-settings-version": "2026-07-29T08:19:09.000Z" } },
    );
  });

  it("restores a versioned backup before returning a failed-GET fallback", async () => {
    const storage = new MapStorage();
    const version = "2026-07-29T08:19:09.000Z";
    safeWriteKetikSettingsBackup(storage, "account-a", version, settings);
    vi.stubGlobal("localStorage", storage);
    apiMocks.getSettings.mockRejectedValue(new Error("offline"));
    apiMocks.putSettings.mockResolvedValue(
      response("2026-07-30T08:19:09.000Z"),
    );
    apiMocks.unwrapResponse.mockResolvedValue(settings);

    await expect(ketikApi.getSettings("account-a")).resolves.toEqual(settings);
    await expect(
      ketikApi.saveSettings(settings, "account-a"),
    ).resolves.toBeUndefined();

    expect(apiMocks.putSettings).toHaveBeenCalledWith(
      { json: settings },
      { headers: { "x-settings-version": version } },
    );
  });

  it("fails closed after an initial GET has no trustworthy version", async () => {
    apiMocks.getSettings.mockRejectedValue(new Error("offline"));
    apiMocks.putSettings.mockResolvedValue(
      response("2026-07-30T08:19:09.000Z"),
    );
    apiMocks.unwrapResponse.mockResolvedValue(settings);

    await expect(ketikApi.getSettings("account-a")).rejects.toThrow("offline");
    await expect(
      ketikApi.saveSettings(settings, "account-a"),
    ).rejects.toMatchObject({
      code: "SETTINGS_VERSION_REQUIRED",
      message: expect.stringMatching(/muat ulang.*sinkron/i),
    });
    expect(apiMocks.putSettings).not.toHaveBeenCalled();
  });
});

class MapStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
