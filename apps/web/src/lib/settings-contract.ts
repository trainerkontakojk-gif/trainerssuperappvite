import { ApiError, getErrorMessage } from "./api";

const SETTINGS_VERSION_HEADER = "x-settings-version";
const KETIK_SETTINGS_BACKUP_KEY = "ketik_settings_backup";
const SETTINGS_VERSION_REQUIRED_MESSAGE =
  "Versi pengaturan tidak tersedia atau tidak dapat dipercaya. Muat ulang pengaturan agar data tersinkron, lalu coba simpan kembali.";

export interface SettingsVersionStore {
  capture: (response: { headers?: Pick<Headers, "get"> }) => void;
  restore: (version: string | undefined) => void;
  clear: () => void;
  current: () => string | undefined;
  requestOptions: () => { headers?: Record<string, string> };
  requiredRequestOptions: () => { headers: Record<string, string> };
}

export function isTrustworthySettingsVersion(value: unknown): value is string {
  if (value === "absent") return true;
  if (typeof value !== "string") return false;
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/.test(
      value,
    ) && !Number.isNaN(Date.parse(value))
  );
}

export function createSettingsVersionStore(): SettingsVersionStore {
  let version: string | undefined;

  return {
    capture(response) {
      const nextVersion = response.headers?.get(SETTINGS_VERSION_HEADER);
      version = isTrustworthySettingsVersion(nextVersion)
        ? nextVersion
        : undefined;
    },
    restore(nextVersion) {
      version = isTrustworthySettingsVersion(nextVersion)
        ? nextVersion
        : undefined;
    },
    clear() {
      version = undefined;
    },
    current: () => version,
    requestOptions: () =>
      version ? { headers: { [SETTINGS_VERSION_HEADER]: version } } : {},
    requiredRequestOptions: () => {
      if (!version) {
        throw new ApiError(
          "SETTINGS_VERSION_REQUIRED",
          SETTINGS_VERSION_REQUIRED_MESSAGE,
          {
            guidance:
              "Muat ulang pengaturan untuk menyinkronkan versi terbaru sebelum menyimpan.",
          },
        );
      }
      return { headers: { [SETTINGS_VERSION_HEADER]: version } };
    },
  };
}

function resolveStorage(storage?: Storage): Storage | undefined {
  if (storage) return storage;
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export interface KetikSettingsBackup<T> {
  userId: string;
  version: string;
  settings: T;
}

function getKetikSettingsBackupKey(userId: string): string {
  return `${KETIK_SETTINGS_BACKUP_KEY}:${encodeURIComponent(userId)}`;
}

function isUsableKetikSettingsBackup(
  value: unknown,
): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Array.isArray(candidate.scenarios) &&
    Array.isArray(candidate.consumerTypes) &&
    Array.isArray(candidate.quickTemplates) &&
    typeof candidate.activeConsumerTypeId === "string" &&
    candidate.identitySettings !== null &&
    typeof candidate.identitySettings === "object" &&
    typeof candidate.selectedModel === "string" &&
    typeof candidate.simulationDuration === "number" &&
    (candidate.responsePacingMode === "realistic" ||
      candidate.responsePacingMode === "training_fast")
  );
}

export function safeReadKetikSettingsBackup<T = Record<string, unknown>>(
  storage: Storage | undefined,
  userId: string | undefined,
): KetikSettingsBackup<T> | undefined {
  if (!userId) return undefined;

  try {
    const raw = resolveStorage(storage)?.getItem(
      getKetikSettingsBackupKey(userId),
    );
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return undefined;
    }

    const candidate = parsed as Record<string, unknown>;
    return candidate.userId === userId &&
      isTrustworthySettingsVersion(candidate.version) &&
      isUsableKetikSettingsBackup(candidate.settings)
      ? {
          userId,
          version: candidate.version,
          settings: candidate.settings as T,
        }
      : undefined;
  } catch {
    return undefined;
  }
}

export function safeWriteKetikSettingsBackup(
  storage: Storage | undefined,
  userId: string | undefined,
  version: string | undefined,
  settings: unknown,
): void {
  if (
    !userId ||
    !isTrustworthySettingsVersion(version) ||
    !isUsableKetikSettingsBackup(settings)
  ) {
    return;
  }

  try {
    resolveStorage(storage)?.setItem(
      getKetikSettingsBackupKey(userId),
      JSON.stringify({ userId, version, settings }),
    );
  } catch {
    // Browser storage is only a recovery cache; server persistence is authoritative.
  }
}

export function getSettingsSaveErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ApiError && error.code === "SETTINGS_CONFLICT") {
    return "Pengaturan telah diubah di tempat lain. Muat ulang pengaturan, lalu coba simpan kembali draf Anda.";
  }
  return getErrorMessage(error, fallback);
}
