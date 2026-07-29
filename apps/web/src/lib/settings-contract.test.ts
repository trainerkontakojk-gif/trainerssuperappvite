import { describe, expect, it } from "vitest";
import { ApiError } from "./api";
import {
  createSettingsVersionStore,
  getSettingsSaveErrorMessage,
  safeReadKetikSettingsBackup,
  safeWriteKetikSettingsBackup,
} from "./settings-contract";

describe("settings contract helpers", () => {
  it("captures an ISO response version and sends it on the next request", () => {
    const store = createSettingsVersionStore();
    const version = "2026-07-29T08:19:09.000Z";
    store.capture({ headers: new Headers({ "x-settings-version": version }) });

    expect(store.current()).toBe(version);
    expect(store.requiredRequestOptions()).toEqual({
      headers: { "x-settings-version": version },
    });

    store.capture({ headers: new Headers() });
    expect(store.current()).toBeUndefined();
    expect(() => store.requiredRequestOptions()).toThrowError(
      expect.objectContaining({ code: "SETTINGS_VERSION_REQUIRED" }),
    );
  });

  it("fails closed with Indonesian reload and sync guidance when no version exists", () => {
    const store = createSettingsVersionStore();

    expect(() => store.requiredRequestOptions()).toThrowError(
      expect.objectContaining({
        code: "SETTINGS_VERSION_REQUIRED",
        message: expect.stringMatching(/muat ulang/i),
      }),
    );
    expect(() => store.requiredRequestOptions()).toThrowError(
      expect.objectContaining({ message: expect.stringMatching(/sinkron/i) }),
    );
  });

  it("preserves the absent version sentinel and sends it on the next request", () => {
    const store = createSettingsVersionStore();
    store.capture({ headers: new Headers({ "x-settings-version": "absent" }) });

    expect(store.current()).toBe("absent");
    expect(store.requiredRequestOptions()).toEqual({
      headers: { "x-settings-version": "absent" },
    });
  });

  it("ignores non-ISO response versions", () => {
    const store = createSettingsVersionStore();
    store.capture({ headers: new Headers({ "x-settings-version": "v1" }) });

    expect(store.current()).toBeUndefined();
  });

  it("only reads a valid backup for the authenticated account and version", () => {
    const storage = new MapStorage();
    const version = "2026-07-29T08:19:09.000Z";
    const settings = {
      scenarios: [],
      consumerTypes: [],
      quickTemplates: [],
      activeConsumerTypeId: "random",
      identitySettings: {},
      selectedModel: "gpt-5.4-mini",
      simulationDuration: 5,
      responsePacingMode: "realistic",
    };

    safeWriteKetikSettingsBackup(storage, "account-a", version, settings);

    expect(safeReadKetikSettingsBackup(storage, "account-a")).toEqual({
      userId: "account-a",
      version,
      settings,
    });
    expect(safeReadKetikSettingsBackup(storage, "account-b")).toBeUndefined();
  });

  it("ignores legacy, unversioned, and malformed backups", () => {
    const storage = new MapStorage();
    const settings = {
      scenarios: [],
      consumerTypes: [],
      quickTemplates: [],
      activeConsumerTypeId: "random",
      identitySettings: {},
      selectedModel: "gpt-5.4-mini",
      simulationDuration: 5,
      responsePacingMode: "realistic",
    };
    const key = "ketik_settings_backup:account-a";

    storage.setItem("ketik_settings_backup", JSON.stringify(settings));
    expect(safeReadKetikSettingsBackup(storage, "account-a")).toBeUndefined();

    storage.setItem(key, JSON.stringify({ userId: "account-a", settings }));
    expect(safeReadKetikSettingsBackup(storage, "account-a")).toBeUndefined();

    storage.setItem(key, "{malformed");
    expect(safeReadKetikSettingsBackup(storage, "account-a")).toBeUndefined();
  });

  it("does not read or write a cache without an authenticated user id", () => {
    const storage = new MapStorage();
    const settings = { scenarios: [] };

    safeWriteKetikSettingsBackup(
      storage,
      undefined,
      "2026-07-29T08:19:09.000Z",
      settings,
    );

    expect(storage.getItem("ketik_settings_backup")).toBeNull();
    expect(safeReadKetikSettingsBackup(storage, undefined)).toBeUndefined();
  });

  it("treats localStorage security and quota errors as best effort", () => {
    const storage = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("quota", "QuotaExceededError");
      },
    } as unknown as Storage;

    expect(safeReadKetikSettingsBackup(storage, "account-a")).toBeUndefined();
    expect(() =>
      safeWriteKetikSettingsBackup(
        storage,
        "account-a",
        "2026-07-29T08:19:09.000Z",
        { value: true },
      ),
    ).not.toThrow();
  });

  it("maps only the conflict code to changed-elsewhere guidance", () => {
    expect(
      getSettingsSaveErrorMessage(
        new ApiError("SETTINGS_CONFLICT", "stale"),
        "Gagal menyimpan pengaturan.",
      ),
    ).toContain("diubah di tempat lain");
    expect(
      getSettingsSaveErrorMessage(
        new ApiError("NETWORK", "network"),
        "Gagal menyimpan pengaturan.",
      ),
    ).toBe("network");
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
