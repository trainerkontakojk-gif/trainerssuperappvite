import { ApiError } from "../../../lib/api";
import { buildTelefunRecordingPath } from "../recordingPath";
import type { RemuxRecordingResult } from "./telefun-recording-remux-service";

export const RECORDING_RECONCILIATION_STORAGE_KEY =
  "telefun_recording_reconciliation:v1";
export const RECORDING_RECONCILIATION_VERSION = 1 as const;
export const RECORDING_RECONCILIATION_MAX_ENTRIES = 32;
export const RECORDING_RECONCILIATION_TTL_MS = 604_800_000;
export const RECORDING_RECONCILIATION_MAX_ATTEMPTS = 8;
const RETRY_DELAYS_MS = [
  1_000,
  2_000,
  5_000,
  10_000,
  30_000,
  60_000,
  300_000,
  900_000,
] as const;

export type RecordingReconciliationPhase =
  | "recording_transition_pending"
  | "remux_pending";

export type RecordingReconciliationEntry = {
  version: 1;
  dedupeKey: `telefun-recording:${string}:${string}`;
  userId: string;
  sessionId: string;
  phase: RecordingReconciliationPhase;
  recordingPath: string | null;
  agentRecordingPath: string | null;
  captureStatus: "ready" | "failed";
  createdAtMs: number;
  updatedAtMs: number;
  nextAttemptAtMs: number;
  attemptCount: number;
  exhausted: boolean;
  lastErrorCode: string | null;
};

export interface RecordingReconciliationStore {
  read(): unknown;
  write(entries: RecordingReconciliationEntry[]): void;
}

export type RecordingTransitionResponse = {
  recordingStatus?: "uploaded" | "partial" | "ready" | "failed";
  recordingReady?: boolean;
  scoringReady?: boolean;
};

export type RecordingRemuxResponse = {
  success: boolean;
  data?: {
    remuxed: boolean;
    recordings: RemuxRecordingResult["recordings"];
    recordingStatus?: "uploaded" | "partial" | "ready" | "failed";
    recordingReady?: boolean;
    scoringReady?: boolean;
    scoringStatus?: "pending" | "processing" | "completed" | "failed";
  };
  errorCode?: string;
};

export interface RecordingReconciliationApi {
  getUserId(): Promise<string | undefined>;
  finalizeRecording(input: {
    sessionId: string;
    recordingPath?: string;
    agentRecordingPath?: string;
    captureStatus: "ready" | "failed";
  }): Promise<RecordingTransitionResponse>;
  remuxRecording(sessionId: string): Promise<RecordingRemuxResponse>;
}

export interface EnqueueRecordingReconciliationInput {
  userId: string;
  sessionId: string;
  recordingPath?: string | null;
  agentRecordingPath?: string | null;
  captureStatus: "ready" | "failed";
}

export interface RecordingReconciliationProcessResult {
  queued: boolean;
  processed: boolean;
  removed: boolean;
  saveFailed: boolean;
  /** The server explicitly rejected this exact owner/payload. */
  terminalFailure?: boolean;
  errorCode?: string;
  phase?: RecordingReconciliationPhase;
  transition?: RecordingTransitionResponse;
  remux?: RecordingRemuxResponse;
}

export interface RecordingReconciliationDrainResult {
  processed: number;
  results: Record<string, RecordingReconciliationProcessResult>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafeIdentifier(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    !value.includes("/") &&
    value !== "." &&
    value !== ".."
  );
}

function isSafeErrorCode(value: unknown): value is string | null {
  return (
    value === null ||
    (typeof value === "string" &&
      value.length > 0 &&
      value.length <= 64 &&
      /^[A-Z0-9_:-]+$/.test(value))
  );
}

function expectedPath(
  userId: string,
  sessionId: string,
  type: "full_call" | "agent_only",
): string {
  return buildTelefunRecordingPath({ userId, sessionId, type });
}

function isExpectedPath(
  path: unknown,
  userId: string,
  sessionId: string,
  type: "full_call" | "agent_only",
): path is string {
  return path === expectedPath(userId, sessionId, type);
}

export function seekablePathFor(rawPath: string): string {
  return rawPath.endsWith(".webm")
    ? `${rawPath.slice(0, -".webm".length)}.seekable.webm`
    : `${rawPath}.seekable.webm`;
}

export function mergeEntries(
  existing: RecordingReconciliationEntry,
  incoming: RecordingReconciliationEntry,
): RecordingReconciliationEntry {
  const failed =
    existing.captureStatus === "failed" || incoming.captureStatus === "failed";
  const resetForFailed =
    incoming.captureStatus === "failed" && existing.captureStatus !== "failed";
  return {
    ...existing,
    phase: resetForFailed ? "recording_transition_pending" : existing.phase,
    recordingPath: existing.recordingPath ?? incoming.recordingPath,
    agentRecordingPath:
      existing.agentRecordingPath ?? incoming.agentRecordingPath,
    captureStatus: failed ? "failed" : "ready",
    createdAtMs: Math.min(existing.createdAtMs, incoming.createdAtMs),
    updatedAtMs: Math.max(existing.updatedAtMs, incoming.updatedAtMs),
    nextAttemptAtMs: resetForFailed
      ? incoming.nextAttemptAtMs
      : Math.min(existing.nextAttemptAtMs, incoming.nextAttemptAtMs),
    attemptCount: resetForFailed ? 0 : existing.attemptCount,
    exhausted: resetForFailed ? false : existing.exhausted,
    lastErrorCode: resetForFailed ? null : existing.lastErrorCode,
  };
}

export function isValidEntry(value: unknown): value is RecordingReconciliationEntry {
  if (!isRecord(value)) return false;
  if (value.version !== RECORDING_RECONCILIATION_VERSION) return false;
  if (!isSafeIdentifier(value.userId) || !isSafeIdentifier(value.sessionId)) {
    return false;
  }
  if (
    value.dedupeKey !== `telefun-recording:${value.userId}:${value.sessionId}`
  ) {
    return false;
  }
  if (
    value.phase !== "recording_transition_pending" &&
    value.phase !== "remux_pending"
  ) {
    return false;
  }
  if (value.captureStatus !== "ready" && value.captureStatus !== "failed") {
    return false;
  }
  if (
    value.recordingPath !== null &&
    !isExpectedPath(
      value.recordingPath,
      value.userId,
      value.sessionId,
      "full_call",
    )
  ) {
    return false;
  }
  if (
    value.agentRecordingPath !== null &&
    !isExpectedPath(
      value.agentRecordingPath,
      value.userId,
      value.sessionId,
      "agent_only",
    )
  ) {
    return false;
  }
  if (
    value.captureStatus === "ready" &&
    value.recordingPath === null &&
    value.agentRecordingPath === null
  ) {
    return false;
  }
  if (
    typeof value.createdAtMs !== "number" ||
    typeof value.updatedAtMs !== "number" ||
    typeof value.nextAttemptAtMs !== "number" ||
    !Number.isFinite(value.createdAtMs) ||
    !Number.isFinite(value.updatedAtMs) ||
    !Number.isFinite(value.nextAttemptAtMs) ||
    typeof value.attemptCount !== "number" ||
    !Number.isInteger(value.attemptCount) ||
    value.attemptCount < 0 ||
    value.attemptCount > RECORDING_RECONCILIATION_MAX_ATTEMPTS ||
    typeof value.exhausted !== "boolean" ||
    value.exhausted !==
      (value.attemptCount >= RECORDING_RECONCILIATION_MAX_ATTEMPTS) ||
    !isSafeErrorCode(value.lastErrorCode)
  ) {
    return false;
  }
  return true;
}

export function normalizeStoredEntries(
  raw: unknown,
  nowMs: number,
): { entries: RecordingReconciliationEntry[]; changed: boolean } {
  let parsed: unknown = raw;
  let changed = false;
  if (typeof raw === "string") {
    try {
      parsed = raw ? JSON.parse(raw) : [];
      if (!raw) changed = true;
    } catch {
      parsed = [];
      changed = true;
    }
  }
  if (!Array.isArray(parsed)) {
    return { entries: [], changed: parsed !== null && parsed !== undefined };
  }
  const byKey = new Map<string, RecordingReconciliationEntry>();
  for (const candidate of parsed) {
    if (!isValidEntry(candidate)) {
      changed = true;
      continue;
    }
    if (nowMs - candidate.createdAtMs > RECORDING_RECONCILIATION_TTL_MS) {
      changed = true;
      continue;
    }
    const previous = byKey.get(candidate.dedupeKey);
    if (previous) {
      byKey.set(candidate.dedupeKey, mergeEntries(previous, candidate));
      changed = true;
    } else {
      byKey.set(candidate.dedupeKey, candidate);
    }
  }
  const entries = [...byKey.values()];
  if (JSON.stringify(parsed) !== JSON.stringify(entries)) changed = true;
  return { entries, changed };
}

export function validateEnqueueInput(
  input: EnqueueRecordingReconciliationInput,
  nowMs: number,
): { entry: RecordingReconciliationEntry } | { errorCode: string } {
  if (!isSafeIdentifier(input.userId) || !isSafeIdentifier(input.sessionId)) {
    return { errorCode: "INVALID_RECORDING_PATH" };
  }
  const recordingPath = input.recordingPath ?? null;
  const agentRecordingPath = input.agentRecordingPath ?? null;
  if (
    (recordingPath !== null &&
      !isExpectedPath(
        recordingPath,
        input.userId,
        input.sessionId,
        "full_call",
      )) ||
    (agentRecordingPath !== null &&
      !isExpectedPath(
        agentRecordingPath,
        input.userId,
        input.sessionId,
        "agent_only",
      ))
  ) {
    return { errorCode: "INVALID_RECORDING_PATH" };
  }
  if (
    input.captureStatus === "ready" &&
    recordingPath === null &&
    agentRecordingPath === null
  ) {
    return { errorCode: "INVALID_RECORDING_PATH" };
  }
  return {
    entry: {
      version: RECORDING_RECONCILIATION_VERSION,
      dedupeKey: `telefun-recording:${input.userId}:${input.sessionId}`,
      userId: input.userId,
      sessionId: input.sessionId,
      phase: "recording_transition_pending",
      recordingPath,
      agentRecordingPath,
      captureStatus: input.captureStatus,
      createdAtMs: nowMs,
      updatedAtMs: nowMs,
      nextAttemptAtMs: nowMs,
      attemptCount: 0,
      exhausted: false,
      lastErrorCode: null,
    },
  };
}

export function safeErrorCode(error: unknown, fallback = "NETWORK_ERROR"): string {
  if (isRecord(error)) {
    const code = error.code;
    if (typeof code === "string" && /^[A-Za-z0-9_:-]+$/.test(code)) {
      return code.slice(0, 64).toUpperCase();
    }
    if (typeof error.status === "number") return String(error.status);
  }
  if (error instanceof ApiError && error.code) {
    return error.code.slice(0, 64).toUpperCase();
  }
  return fallback;
}

export function isRetryableCode(code: string): boolean {
  return ![
    "400",
    "403",
    "404",
    "INVALID_RECORDING_PATH",
    "UNAUTHORIZED",
    "NOT_FOUND",
  ].includes(code);
}

export function getRetryDelay(attemptCount: number): number {
  return RETRY_DELAYS_MS[attemptCount - 1] ?? RETRY_DELAYS_MS.at(-1)!;
}

export function isValidTransitionResponse(
  value: unknown,
): value is RecordingTransitionResponse {
  if (!isRecord(value)) return false;
  if (
    value.recordingStatus !== undefined &&
    !["uploaded", "partial", "ready", "failed"].includes(
      String(value.recordingStatus),
    )
  ) {
    return false;
  }
  return (
    (value.recordingReady === undefined ||
      typeof value.recordingReady === "boolean") &&
    (value.scoringReady === undefined || typeof value.scoringReady === "boolean")
  );
}

export function isValidRemuxData(
  value: unknown,
): value is NonNullable<RecordingRemuxResponse["data"]> {
  if (!isRecord(value) || typeof value.remuxed !== "boolean") return false;
  if (!isRecord(value.recordings)) return false;
  return (
    value.recordingReady === undefined || typeof value.recordingReady === "boolean"
  );
}

export function isRemuxComplete(
  entry: RecordingReconciliationEntry,
  data: NonNullable<RecordingRemuxResponse["data"]>,
): boolean {
  if (data.recordingReady !== true) return false;
  const trackedPaths = [entry.recordingPath, entry.agentRecordingPath].filter(
    (path): path is string => path !== null,
  );
  return trackedPaths.every((path) => {
    const seekablePath = seekablePathFor(path);
    const direct = data.recordings[path];
    const seekable = data.recordings[seekablePath];
    return (
      (direct?.remuxed === true &&
        (direct.seekablePath === undefined ||
          direct.seekablePath === seekablePath)) ||
      seekable?.remuxed === true
    );
  });
}

export function createBrowserStore(): RecordingReconciliationStore {
  return {
    read: () => {
      try {
        return typeof localStorage === "undefined"
          ? null
          : localStorage.getItem(RECORDING_RECONCILIATION_STORAGE_KEY);
      } catch {
        throw new Error("Storage unavailable.");
      }
    },
    write: (entries) => {
      if (typeof localStorage === "undefined") {
        throw new Error("Storage unavailable.");
      }
      localStorage.setItem(
        RECORDING_RECONCILIATION_STORAGE_KEY,
        JSON.stringify(entries),
      );
    },
  };
}

export function sanitizeCode(value: string): string {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9_:-]/g, "_");
  return normalized.slice(0, 64) || "UNKNOWN_ERROR";
}
