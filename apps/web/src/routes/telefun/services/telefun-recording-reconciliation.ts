import { supabase } from "../../../lib/supabase";
import { telefunClient, unwrapResponse } from "../../../lib/api";
import {
  remuxRecording as defaultRemuxRecording,
} from "./telefun-recording-remux-service";
import {
  createBrowserStore,
  getRetryDelay,
  isRecord,
  isRemuxComplete,
  isRetryableCode,
  isValidRemuxData,
  isValidTransitionResponse,
  mergeEntries,
  normalizeStoredEntries,
  safeErrorCode,
  sanitizeCode,
  validateEnqueueInput,
  RECORDING_RECONCILIATION_MAX_ATTEMPTS,
  RECORDING_RECONCILIATION_MAX_ENTRIES,
  type EnqueueRecordingReconciliationInput,
  type RecordingReconciliationApi,
  type RecordingReconciliationDrainResult,
  type RecordingReconciliationEntry,
  type RecordingReconciliationProcessResult,
  type RecordingReconciliationStore,
  type RecordingRemuxResponse,
  type RecordingTransitionResponse,
} from "./telefun-recording-reconciliation-queue";
export {
  RECORDING_RECONCILIATION_MAX_ATTEMPTS,
  RECORDING_RECONCILIATION_MAX_ENTRIES,
  RECORDING_RECONCILIATION_STORAGE_KEY,
  RECORDING_RECONCILIATION_TTL_MS,
  RECORDING_RECONCILIATION_VERSION,
} from "./telefun-recording-reconciliation-queue";
export type {
  EnqueueRecordingReconciliationInput,
  RecordingReconciliationApi,
  RecordingReconciliationDrainResult,
  RecordingReconciliationEntry,
  RecordingReconciliationPhase,
  RecordingReconciliationProcessResult,
  RecordingReconciliationStore,
  RecordingRemuxResponse,
  RecordingTransitionResponse,
} from "./telefun-recording-reconciliation-queue";

export interface RecordingReconciliationRuntime {
  nowMs?: () => number;
  setTimeout?: (handler: () => void, delayMs: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
  addOnlineListener?: (handler: () => void) => () => void;
  addVisibilityListener?: (handler: () => void) => () => void;
  addAuthStateListener?: (handler: () => void) => () => void;
  isDocumentVisible?: () => boolean;
}
export interface RecordingReconciliationDependencies extends RecordingReconciliationRuntime {
  store: RecordingReconciliationStore;
  api: RecordingReconciliationApi;
}
type StoredEntriesResult =
  | { entries: RecordingReconciliationEntry[]; ok: true }
  | { entries: RecordingReconciliationEntry[]; ok: false; errorCode: string };
type ProcessEntryResult = {
  entries: RecordingReconciliationEntry[];
  result: RecordingReconciliationProcessResult;
};
function finishEntry(
  entries: RecordingReconciliationEntry[],
  overrides: Partial<RecordingReconciliationProcessResult> = {},
): ProcessEntryResult {
  return {
    entries,
    result: {
      queued: true,
      processed: true,
      removed: false,
      saveFailed: false,
      ...overrides,
    },
  };
}
function isSameEntryVersion(
  left: RecordingReconciliationEntry,
  right: RecordingReconciliationEntry,
): boolean {
  return (
    left.version === right.version &&
    left.dedupeKey === right.dedupeKey &&
    left.userId === right.userId &&
    left.sessionId === right.sessionId &&
    left.phase === right.phase &&
    left.recordingPath === right.recordingPath &&
    left.agentRecordingPath === right.agentRecordingPath &&
    left.captureStatus === right.captureStatus &&
    left.createdAtMs === right.createdAtMs &&
    left.updatedAtMs === right.updatedAtMs &&
    left.nextAttemptAtMs === right.nextAttemptAtMs &&
    left.attemptCount === right.attemptCount &&
    left.exhausted === right.exhausted &&
    left.lastErrorCode === right.lastErrorCode
  );
}
const defaultRuntime: RecordingReconciliationRuntime = {
  nowMs: () => Date.now(),
  setTimeout: (handler, delayMs) => setTimeout(handler, delayMs),
  clearTimeout: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
  addOnlineListener: (handler) => {
    if (typeof window === "undefined") return () => {};
    window.addEventListener("online", handler);
    return () => window.removeEventListener("online", handler);
  },
  addVisibilityListener: (handler) => {
    if (typeof document === "undefined") return () => {};
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  },
  addAuthStateListener: (handler) => {
    try {
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (session?.user?.id) handler();
      });
      return () => data.subscription.unsubscribe();
    } catch {
      return () => {};
    }
  },
  isDocumentVisible: () =>
    typeof document === "undefined" || document.visibilityState === "visible",
};
function createProductionApi(): RecordingReconciliationApi {
  return {
    getUserId: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user?.id;
    },
    finalizeRecording: async (input) =>
      (await unwrapResponse(
        await telefunClient["finalize-recording"].$post({ json: input }),
      )) as RecordingTransitionResponse,
    remuxRecording: async (sessionId) => defaultRemuxRecording(sessionId),
  };
}
function createProductionDependencies(): RecordingReconciliationDependencies {
  return {
    store: createBrowserStore(),
    api: createProductionApi(),
    ...defaultRuntime,
  };
}
let moduleInFlight: Promise<RecordingReconciliationDrainResult> | null = null;
export class RecordingReconciliationController {
  private inFlight: Promise<RecordingReconciliationDrainResult> | null = null;
  private timer: unknown = null;
  private removeListeners: (() => void) | null = null;
  private disposed = false;
  private readonly deps: Required<
    Pick<
      RecordingReconciliationDependencies,
      | "store"
      | "api"
      | "nowMs"
      | "setTimeout"
      | "clearTimeout"
      | "addOnlineListener"
      | "addVisibilityListener"
      | "addAuthStateListener"
      | "isDocumentVisible"
    >
  >;
  constructor(overrides?: Partial<RecordingReconciliationDependencies>) {
    const defaults = createProductionDependencies();
    this.deps = {
      store: overrides?.store ?? defaults.store,
      api: overrides?.api ?? defaults.api,
      nowMs: overrides?.nowMs ?? defaults.nowMs!,
      setTimeout: overrides?.setTimeout ?? defaults.setTimeout!,
      clearTimeout: overrides?.clearTimeout ?? defaults.clearTimeout!,
      addOnlineListener:
        overrides?.addOnlineListener ?? defaults.addOnlineListener!,
      addVisibilityListener:
        overrides?.addVisibilityListener ?? defaults.addVisibilityListener!,
      addAuthStateListener:
        overrides?.addAuthStateListener ?? defaults.addAuthStateListener!,
      isDocumentVisible:
        overrides?.isDocumentVisible ?? defaults.isDocumentVisible!,
    };
  }
  public async enqueue(
    input: EnqueueRecordingReconciliationInput,
  ): Promise<RecordingReconciliationProcessResult> {
    const nowMs = this.deps.nowMs();
    const validation = validateEnqueueInput(input, nowMs);
    if ("errorCode" in validation) {
      return {
        queued: false,
        processed: false,
        removed: false,
        saveFailed: true,
        errorCode: validation.errorCode,
      };
    }
    const stored = this.readEntries();
    if (!stored.ok) {
      return {
        queued: false,
        processed: false,
        removed: false,
        saveFailed: true,
        errorCode: stored.errorCode,
      };
    }
    const existingIndex = stored.entries.findIndex(
      (entry) => entry.dedupeKey === validation.entry.dedupeKey,
    );
    let entries = stored.entries;
    if (existingIndex >= 0) {
      entries = [...entries];
      entries[existingIndex] = mergeEntries(
        entries[existingIndex]!,
        validation.entry,
      );
    } else {
      if (entries.length >= RECORDING_RECONCILIATION_MAX_ENTRIES) {
        return {
          queued: false,
          processed: false,
          removed: false,
          saveFailed: true,
          errorCode: "queue_full",
        };
      }
      entries = [...entries, validation.entry];
    }
    if (!this.writeEntries(entries)) {
      return {
        queued: false,
        processed: false,
        removed: false,
        saveFailed: true,
        errorCode: "STORAGE_UNAVAILABLE",
      };
    }
    const joinedInFlight = this.inFlight !== null || moduleInFlight !== null;
    const drain = await this.drain();
    const followUp = joinedInFlight ? await this.drain() : drain;
    return (
      followUp.results[validation.entry.dedupeKey] ??
      drain.results[validation.entry.dedupeKey] ?? {
        queued: true,
        processed: false,
        removed: false,
        saveFailed: false,
        phase: validation.entry.phase,
      }
    );
  }
  public drain(): Promise<RecordingReconciliationDrainResult> {
    if (this.inFlight) return this.inFlight;
    if (moduleInFlight) {
      this.inFlight = moduleInFlight;
      const shared = moduleInFlight;
      void shared.then(
        () => {
          if (this.inFlight === shared) this.inFlight = null;
        },
        () => {
          if (this.inFlight === shared) this.inFlight = null;
        },
      );
      return shared;
    }
    const run = this.runDrain();
    const shared = run.finally(() => {
      moduleInFlight = null;
      if (this.inFlight === shared) this.inFlight = null;
    });
    moduleInFlight = shared;
    this.inFlight = shared;
    return shared;
  }
  public install(): () => void {
    if (this.removeListeners) return this.removeListeners;
    this.disposed = false;
    const removeOnline = this.deps.addOnlineListener(() => {
      void this.drain();
    });
    const removeVisibility = this.deps.addVisibilityListener(() => {
      if (this.deps.isDocumentVisible()) void this.drain();
    });
    const removeAuth = this.deps.addAuthStateListener(() => {
      void this.drain();
    });
    this.removeListeners = () => {
      removeOnline();
      removeVisibility();
      removeAuth();
      this.clearScheduledTimer();
      this.disposed = true;
      this.removeListeners = null;
    };
    void this.drain();
    return this.removeListeners;
  }
  private readEntries(): StoredEntriesResult {
    let raw: unknown;
    try {
      raw = this.deps.store.read();
    } catch {
      return { entries: [], ok: false, errorCode: "STORAGE_UNAVAILABLE" };
    }
    const normalized = normalizeStoredEntries(raw, this.deps.nowMs());
    if (normalized.changed && !this.writeEntries(normalized.entries)) {
      return {
        entries: normalized.entries,
        ok: false,
        errorCode: "STORAGE_UNAVAILABLE",
      };
    }
    return { entries: normalized.entries, ok: true };
  }
  private writeEntries(entries: RecordingReconciliationEntry[]): boolean {
    try {
      this.deps.store.write(entries);
      return true;
    } catch {
      return false;
    }
  }
  private async runDrain(): Promise<RecordingReconciliationDrainResult> {
    const stored = this.readEntries();
    if (!stored.ok) {
      return {
        processed: 0,
        results: {},
      };
    }
    let entries = stored.entries;
    let userId: string | undefined;
    try {
      userId = await this.deps.api.getUserId();
    } catch {
      userId = undefined;
    }
    if (typeof userId !== "string" || !userId) {
      this.scheduleNextTimer(entries, undefined);
      return { processed: 0, results: {} };
    }
    const results: Record<string, RecordingReconciliationProcessResult> = {};
    let processed = 0;
    const candidates = [...entries].filter(
      (entry) =>
        entry.userId === userId &&
        !entry.exhausted &&
        entry.nextAttemptAtMs <= this.deps.nowMs(),
    );
    for (const candidate of candidates) {
      if (!entries.some((entry) => entry.dedupeKey === candidate.dedupeKey)) {
        continue;
      }
      const outcome = await this.processEntry(candidate, entries);
      entries = outcome.entries;
      results[candidate.dedupeKey] = outcome.result;
      if (outcome.result.processed) processed += 1;
    }
    const canScheduleDueEntries = !Object.values(results).some(
      (result) => result.saveFailed,
    );
    this.scheduleNextTimer(entries, userId, canScheduleDueEntries);
    return { processed, results };
  }
  private async processEntry(
    candidate: RecordingReconciliationEntry,
    initialEntries: RecordingReconciliationEntry[],
  ): Promise<ProcessEntryResult> {
    let entries = initialEntries;
    let current = entries.find(
      (entry) => entry.dedupeKey === candidate.dedupeKey,
    );
    if (!current) {
      return finishEntry(entries, { processed: false, removed: true });
    }
    let transition: RecordingTransitionResponse | undefined;
    if (current.phase === "recording_transition_pending") {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await this.deps.api.finalizeRecording({
            sessionId: current.sessionId,
            ...(current.recordingPath
              ? { recordingPath: current.recordingPath }
              : {}),
            ...(current.agentRecordingPath
              ? { agentRecordingPath: current.agentRecordingPath }
              : {}),
            captureStatus: current.captureStatus,
          });
          if (!isValidTransitionResponse(response)) {
            throw Object.assign(new Error("Invalid transition response."), {
              code: "INVALID_RESPONSE",
            });
          }
          transition = response;
          break;
        } catch (error) {
          const code = safeErrorCode(error, "NETWORK_ERROR");
          if (!isRetryableCode(code)) {
            const removed = await this.removeWithDiagnostic(
              current,
              entries,
              code,
            );
            entries = removed.entries;
            return finishEntry(entries, {
              removed: removed.removed,
              saveFailed: !removed.ok,
              terminalFailure: true,
              errorCode: code,
              phase: current.phase,
            });
          }
          const failed = await this.recordRetry(current, entries, code);
          entries = failed.entries;
          if (!failed.ok || failed.entry.exhausted || attempt === 1) {
            return finishEntry(entries, {
              saveFailed: !failed.ok,
              errorCode: code,
              phase: current.phase,
            });
          }
          current = failed.entry;
        }
      }
      if (!transition) {
        return finishEntry(entries, {
          saveFailed: true,
          errorCode: "INVALID_RESPONSE",
          phase: current.phase,
        });
      }
      if (
        transition.recordingStatus === "failed" ||
        (current.captureStatus === "failed" &&
          current.recordingPath === null &&
          current.agentRecordingPath === null)
      ) {
        const removed = await this.removeEntry(current, entries);
        entries = removed.entries;
        return finishEntry(entries, {
          removed: removed.removed,
          saveFailed: !removed.ok,
          transition,
          phase: current.phase,
          ...(removed.ok ? {} : { errorCode: "STORAGE_UNAVAILABLE" }),
        });
      }
      const phaseChangedAtMs = this.deps.nowMs();
      const remuxEntry: RecordingReconciliationEntry = {
        ...current,
        phase: "remux_pending",
        updatedAtMs: phaseChangedAtMs,
        nextAttemptAtMs: phaseChangedAtMs,
        attemptCount: 0,
        exhausted: false,
        lastErrorCode: null,
      };
      const committed = await this.replaceEntry(current, remuxEntry, entries);
      entries = committed.entries;
      if (!committed.ok) {
        return finishEntry(entries, {
          saveFailed: true,
          errorCode: "STORAGE_UNAVAILABLE",
          transition,
          phase: remuxEntry.phase,
        });
      }
      current = remuxEntry;
    }
    let remuxResponse: RecordingRemuxResponse;
    try {
      remuxResponse = await this.deps.api.remuxRecording(current.sessionId);
    } catch (error) {
      return this.handleRemuxFailure(
        current,
        entries,
        safeErrorCode(error, "NETWORK_ERROR"),
        transition,
      );
    }
    if (
      !isRecord(remuxResponse) ||
      typeof remuxResponse.success !== "boolean"
    ) {
      return this.handleRemuxFailure(
        current,
        entries,
        "INVALID_RESPONSE",
        transition,
      );
    }
    if (!remuxResponse.success) {
      const code = sanitizeCode(remuxResponse.errorCode ?? "REMUX_ERROR");
      if (!isRetryableCode(code)) {
        const removed = await this.removeWithDiagnostic(current, entries, code);
        entries = removed.entries;
        return finishEntry(entries, {
          removed: removed.removed,
          saveFailed: !removed.ok,
          terminalFailure: true,
          errorCode: code,
          transition,
          remux: remuxResponse,
          phase: current.phase,
        });
      }
      return this.handleRemuxFailure(
        current,
        entries,
        code,
        transition,
        remuxResponse,
      );
    }
    if (!isValidRemuxData(remuxResponse.data)) {
      return this.handleRemuxFailure(
        current,
        entries,
        "INVALID_RESPONSE",
        transition,
        remuxResponse,
      );
    }
    if (remuxResponse.data.recordingStatus === "failed") {
      const removed = await this.removeEntry(current, entries);
      entries = removed.entries;
      return finishEntry(entries, {
        removed: removed.removed,
        saveFailed: !removed.ok,
        transition,
        remux: remuxResponse,
        phase: current.phase,
      });
    }
    if (!isRemuxComplete(current, remuxResponse.data)) {
      return this.handleRemuxFailure(
        current,
        entries,
        "REMUX_INCOMPLETE",
        transition,
        remuxResponse,
      );
    }
    const removed = await this.removeEntry(current, entries);
    entries = removed.entries;
    return finishEntry(entries, {
      removed: removed.removed,
      saveFailed: !removed.ok,
      transition,
      remux: remuxResponse,
      phase: current.phase,
      ...(removed.ok ? {} : { errorCode: "STORAGE_UNAVAILABLE" }),
    });
  }
  private async handleRemuxFailure(
    current: RecordingReconciliationEntry,
    entries: RecordingReconciliationEntry[],
    code: string,
    transition?: RecordingTransitionResponse,
    remux?: RecordingRemuxResponse,
  ): Promise<ProcessEntryResult> {
    const failed = await this.recordRetry(current, entries, code);
    return finishEntry(failed.entries, {
      saveFailed: !failed.ok,
      errorCode: code,
      transition,
      remux,
      phase: current.phase,
    });
  }
  private async recordRetry(
    current: RecordingReconciliationEntry,
    entries: RecordingReconciliationEntry[],
    code: string,
  ): Promise<{
    ok: boolean;
    entry: RecordingReconciliationEntry;
    entries: RecordingReconciliationEntry[];
  }> {
    const attemptCount = Math.min(
      RECORDING_RECONCILIATION_MAX_ATTEMPTS,
      current.attemptCount + 1,
    );
    const delay = getRetryDelay(attemptCount);
    const failedAtMs = this.deps.nowMs();
    const next: RecordingReconciliationEntry = {
      ...current,
      updatedAtMs: failedAtMs,
      nextAttemptAtMs: failedAtMs + delay,
      attemptCount,
      exhausted: attemptCount >= RECORDING_RECONCILIATION_MAX_ATTEMPTS,
      lastErrorCode: sanitizeCode(code),
    };
    const committed = await this.replaceEntry(current, next, entries);
    return { ...committed, entry: next };
  }
  private async removeWithDiagnostic(
    current: RecordingReconciliationEntry,
    entries: RecordingReconciliationEntry[],
    code: string,
  ): Promise<{
    ok: boolean;
    removed: boolean;
    entries: RecordingReconciliationEntry[];
  }> {
    const diagnostic = {
      ...current,
      updatedAtMs: this.deps.nowMs(),
      lastErrorCode: sanitizeCode(code),
    };
    const recorded = await this.replaceEntry(current, diagnostic, entries);
    if (!recorded.ok) return { ...recorded, removed: false };
    return this.removeEntry(diagnostic, recorded.entries);
  }
  private async replaceEntry(
    current: RecordingReconciliationEntry,
    replacement: RecordingReconciliationEntry,
    entries: RecordingReconciliationEntry[],
  ): Promise<{ ok: boolean; entries: RecordingReconciliationEntry[] }> {
    // A drain snapshots its candidates before awaiting auth. Re-read before
    // every mutation so an enqueue from another controller cannot be removed
    // by a stale phase update.
    const latest = this.readEntries();
    if (!latest.ok) return { ok: false, entries };
    const latestCurrent = latest.entries.find(
      (entry) => entry.dedupeKey === current.dedupeKey,
    );
    if (!latestCurrent || !isSameEntryVersion(latestCurrent, current)) {
      entries.splice(0, entries.length, ...latest.entries);
      return { ok: true, entries };
    }
    const nextEntries = latest.entries.map((entry) =>
      entry.dedupeKey === current.dedupeKey ? replacement : entry,
    );
    if (!this.writeEntries(nextEntries)) return { ok: false, entries };
    entries.splice(0, entries.length, ...nextEntries);
    return { ok: true, entries };
  }
  private async removeEntry(
    current: RecordingReconciliationEntry,
    entries: RecordingReconciliationEntry[],
  ): Promise<{
    ok: boolean;
    removed: boolean;
    entries: RecordingReconciliationEntry[];
  }> {
    // Preserve siblings enqueued while the drain was awaiting an API/auth
    // boundary. JavaScript runs this read/filter/write section atomically.
    const latest = this.readEntries();
    if (!latest.ok) return { ok: false, removed: false, entries };
    const latestCurrent = latest.entries.find(
      (entry) => entry.dedupeKey === current.dedupeKey,
    );
    if (!latestCurrent) {
      entries.splice(0, entries.length, ...latest.entries);
      return { ok: true, removed: true, entries };
    }
    if (!isSameEntryVersion(latestCurrent, current)) {
      entries.splice(0, entries.length, ...latest.entries);
      return { ok: true, removed: false, entries };
    }
    const nextEntries = latest.entries.filter(
      (entry) => entry.dedupeKey !== current.dedupeKey,
    );
    if (!this.writeEntries(nextEntries)) {
      return { ok: false, removed: false, entries };
    }
    entries.splice(0, entries.length, ...nextEntries);
    return { ok: true, removed: true, entries };
  }
  private clearScheduledTimer(): void {
    if (this.timer !== null) {
      this.deps.clearTimeout(this.timer);
      this.timer = null;
    }
  }
  private scheduleNextTimer(
    entries: RecordingReconciliationEntry[],
    userId: string | undefined,
    includeDueEntries = false,
  ): void {
    this.clearScheduledTimer();
    if (!userId || this.disposed) return;
    const nowMs = this.deps.nowMs();
    const nextAttemptAtMs = entries
      .filter(
        (entry) =>
          entry.userId === userId &&
          !entry.exhausted &&
          (includeDueEntries || entry.nextAttemptAtMs > nowMs),
      )
      .map((entry) => entry.nextAttemptAtMs)
      .sort((a, b) => a - b)[0];
    if (nextAttemptAtMs === undefined) return;
    this.timer = this.deps.setTimeout(
      () => {
        this.timer = null;
        void this.drain();
      },
      Math.max(0, nextAttemptAtMs - nowMs),
    );
  }
}
export function createRecordingReconciliation(
  dependencies?: Partial<RecordingReconciliationDependencies>,
): RecordingReconciliationController {
  return new RecordingReconciliationController(dependencies);
}
export const recordingReconciliation = new RecordingReconciliationController();
export function enqueueRecordingReconciliation(
  input: EnqueueRecordingReconciliationInput,
  dependencies?: Partial<RecordingReconciliationDependencies>,
): Promise<RecordingReconciliationProcessResult> {
  if (dependencies) {
    return new RecordingReconciliationController(dependencies).enqueue(input);
  }
  return recordingReconciliation.enqueue(input);
}
export function reconcileTelefunRecordingQueue(): Promise<RecordingReconciliationDrainResult> {
  return recordingReconciliation.drain();
}
export function installTelefunRecordingReconciliation(): () => void {
  return recordingReconciliation.install();
}
