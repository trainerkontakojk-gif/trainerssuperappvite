import { describe, expect, it, vi } from "vitest";
import {
  createRecordingReconciliation,
  RECORDING_RECONCILIATION_STORAGE_KEY,
  type RecordingReconciliationApi,
  type RecordingReconciliationEntry,
  type RecordingReconciliationStore,
} from "../routes/telefun/services/telefun-recording-reconciliation";

const USER_ID = "550e8400-e29b-41d4-a716-446655440001";
const SESSION_ID = "550e8400-e29b-41d4-a716-446655440000";
const FULL_PATH = `${USER_ID}/${SESSION_ID}/full_call.webm`;
const AGENT_PATH = `${USER_ID}/${SESSION_ID}/agent_only.webm`;
const FULL_SEEKABLE_PATH = `${USER_ID}/${SESSION_ID}/full_call.seekable.webm`;
const AGENT_SEEKABLE_PATH = `${USER_ID}/${SESSION_ID}/agent_only.seekable.webm`;
const SECOND_SESSION_ID = "550e8400-e29b-41d4-a716-446655440002";
const SECOND_FULL_PATH = `${USER_ID}/${SECOND_SESSION_ID}/full_call.webm`;
const SECOND_FULL_SEEKABLE_PATH = `${USER_ID}/${SECOND_SESSION_ID}/full_call.seekable.webm`;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createStore(initial: unknown = null) {
  let raw = initial;
  const writes: RecordingReconciliationEntry[][] = [];
  const store: RecordingReconciliationStore = {
    read: () => raw,
    write: (entries) => {
      const snapshot = structuredClone(entries);
      writes.push(snapshot);
      raw = snapshot;
    },
  };
  return { store, writes, getRaw: () => raw };
}

function createApi(overrides: Partial<RecordingReconciliationApi> = {}) {
  return {
    getUserId: vi.fn(async () => USER_ID),
    finalizeRecording: vi.fn(async () => ({
      recordingStatus: "uploaded" as const,
      recordingReady: false,
      scoringReady: false,
    })),
    remuxRecording: vi.fn(async () => ({
      success: true,
      data: {
        remuxed: true,
        recordings: {
          [FULL_PATH]: {
            originalPath: FULL_PATH,
            seekablePath: FULL_SEEKABLE_PATH,
            remuxed: true,
          },
          [AGENT_PATH]: {
            originalPath: AGENT_PATH,
            seekablePath: AGENT_SEEKABLE_PATH,
            remuxed: true,
          },
        },
        recordingReady: true,
      },
    })),
    ...overrides,
  } satisfies RecordingReconciliationApi;
}

describe("Telefun recording reconciliation", () => {
  it("writes the exact path-only entry before transition and removes it only after complete remux", async () => {
    const storeState = createStore();
    const order: string[] = [];
    const api = createApi({
      finalizeRecording: vi.fn(async () => {
        order.push("finalize");
        const persisted = storeState.getRaw();
        expect(Array.isArray(persisted)).toBe(true);
        expect((persisted as RecordingReconciliationEntry[])[0]).toMatchObject({
          version: 1,
          phase: "recording_transition_pending",
          userId: USER_ID,
          sessionId: SESSION_ID,
          recordingPath: FULL_PATH,
          agentRecordingPath: AGENT_PATH,
        });
        expect(JSON.stringify(persisted)).not.toContain("token");
        expect(JSON.stringify(persisted)).not.toContain("blob:");
        return { recordingStatus: "uploaded" as const };
      }),
      remuxRecording: vi.fn(async () => {
        order.push("remux");
        return {
          success: true,
          data: {
            remuxed: true,
            recordings: {
              [FULL_PATH]: {
                originalPath: FULL_PATH,
                seekablePath: FULL_SEEKABLE_PATH,
                remuxed: true,
              },
              [AGENT_PATH]: {
                originalPath: AGENT_PATH,
                seekablePath: AGENT_SEEKABLE_PATH,
                remuxed: true,
              },
            },
            recordingReady: true,
          },
        };
      }),
    });
    const reconciliation = createRecordingReconciliation({
      store: storeState.store,
      api,
      nowMs: () => 1_000,
    });

    const result = await reconciliation.enqueue({
      userId: USER_ID,
      sessionId: SESSION_ID,
      recordingPath: FULL_PATH,
      agentRecordingPath: AGENT_PATH,
      captureStatus: "ready",
    });

    expect(order).toEqual(["finalize", "remux"]);
    expect(result.queued).toBe(true);
    expect(result.removed).toBe(true);
    expect(storeState.getRaw()).toEqual([]);
    expect(storeState.writes[0]?.[0]).toMatchObject({
      dedupeKey: `telefun-recording:${USER_ID}:${SESSION_ID}`,
      nextAttemptAtMs: 1_000,
      attemptCount: 0,
      exhausted: false,
    });
    expect(storeState.writes.at(-1)).toEqual([]);
    expect(RECORDING_RECONCILIATION_STORAGE_KEY).toBe(
      "telefun_recording_reconciliation:v1",
    );
  });

  it("processes a sibling enqueued by another controller after the in-flight drain", async () => {
    const state = createStore();
    const authReady = deferred<string | undefined>();
    const firstApi = createApi({
      getUserId: vi.fn(() => authReady.promise),
    });
    const secondApi = createApi({
      remuxRecording: vi.fn(async () => ({
        success: true,
        data: {
          remuxed: true,
          recordings: {
            [SECOND_FULL_PATH]: {
              originalPath: SECOND_FULL_PATH,
              seekablePath: SECOND_FULL_SEEKABLE_PATH,
              remuxed: true,
            },
          },
          recordingReady: true,
        },
      })),
    });
    const firstController = createRecordingReconciliation({
      store: state.store,
      api: firstApi,
      nowMs: () => 1_000,
    });
    const secondController = createRecordingReconciliation({
      store: state.store,
      api: secondApi,
      nowMs: () => 1_000,
    });

    const firstEnqueue = firstController.enqueue({
      userId: USER_ID,
      sessionId: SESSION_ID,
      recordingPath: FULL_PATH,
      agentRecordingPath: null,
      captureStatus: "ready",
    });
    await vi.waitFor(() => expect(firstApi.getUserId).toHaveBeenCalledOnce());

    const secondEnqueue = secondController.enqueue({
      userId: USER_ID,
      sessionId: SECOND_SESSION_ID,
      recordingPath: SECOND_FULL_PATH,
      agentRecordingPath: null,
      captureStatus: "ready",
    });
    expect(state.getRaw()).toMatchObject([
      { sessionId: SESSION_ID },
      { sessionId: SECOND_SESSION_ID },
    ]);

    authReady.resolve(USER_ID);
    await Promise.all([firstEnqueue, secondEnqueue]);

    expect(secondApi.finalizeRecording).toHaveBeenCalledOnce();
    expect(secondApi.finalizeRecording).toHaveBeenCalledWith({
      sessionId: SECOND_SESSION_ID,
      recordingPath: SECOND_FULL_PATH,
      captureStatus: "ready",
    });
    expect(secondApi.remuxRecording).toHaveBeenCalledOnce();
    expect(secondApi.remuxRecording).toHaveBeenCalledWith(SECOND_SESSION_ID);
    expect(state.getRaw()).toEqual([]);
  });

  it("processes a newer same-session enqueue after the older in-flight drain", async () => {
    const state = createStore();
    const transitionReady = deferred<{
      recordingStatus: "uploaded";
      recordingReady: false;
      scoringReady: false;
    }>();
    const firstApi = createApi({
      finalizeRecording: vi.fn(() => transitionReady.promise),
    });
    const secondApi = createApi();
    const setTimer = vi.fn(() => 1);
    const firstController = createRecordingReconciliation({
      store: state.store,
      api: firstApi,
      nowMs: () => 1_000,
      setTimeout: setTimer,
    });
    const secondController = createRecordingReconciliation({
      store: state.store,
      api: secondApi,
      nowMs: () => 2_000,
    });

    const firstEnqueue = firstController.enqueue({
      userId: USER_ID,
      sessionId: SESSION_ID,
      recordingPath: FULL_PATH,
      agentRecordingPath: null,
      captureStatus: "ready",
    });
    await vi.waitFor(() =>
      expect(firstApi.finalizeRecording).toHaveBeenCalledWith({
        sessionId: SESSION_ID,
        recordingPath: FULL_PATH,
        captureStatus: "ready",
      }),
    );

    const secondEnqueue = secondController.enqueue({
      userId: USER_ID,
      sessionId: SESSION_ID,
      recordingPath: null,
      agentRecordingPath: AGENT_PATH,
      captureStatus: "ready",
    });
    expect(state.getRaw()).toMatchObject([
      {
        phase: "recording_transition_pending",
        recordingPath: FULL_PATH,
        agentRecordingPath: AGENT_PATH,
      },
    ]);

    transitionReady.resolve({
      recordingStatus: "uploaded",
      recordingReady: false,
      scoringReady: false,
    });
    await Promise.all([firstEnqueue, secondEnqueue]);

    expect(secondApi.finalizeRecording).toHaveBeenCalledOnce();
    expect(secondApi.finalizeRecording).toHaveBeenCalledWith({
      sessionId: SESSION_ID,
      recordingPath: FULL_PATH,
      agentRecordingPath: AGENT_PATH,
      captureStatus: "ready",
    });
    expect(secondApi.remuxRecording).toHaveBeenCalledOnce();
    expect(secondApi.remuxRecording).toHaveBeenCalledWith(SESSION_ID);
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 0);
    expect(state.getRaw()).toEqual([]);
  });

  it("keeps entries owner-scoped across reload and does not send a foreign path", async () => {
    const foreignUser = "550e8400-e29b-41d4-a716-446655440002";
    const state = createStore([
      {
        version: 1,
        dedupeKey: `telefun-recording:${foreignUser}:${SESSION_ID}`,
        userId: foreignUser,
        sessionId: SESSION_ID,
        phase: "recording_transition_pending",
        recordingPath: `${foreignUser}/${SESSION_ID}/full_call.webm`,
        agentRecordingPath: null,
        captureStatus: "ready",
        createdAtMs: 1_000,
        updatedAtMs: 1_000,
        nextAttemptAtMs: 1_000,
        attemptCount: 0,
        exhausted: false,
        lastErrorCode: null,
      },
    ]);
    const api = createApi({
      getUserId: vi.fn(async () => USER_ID),
      finalizeRecording: vi.fn(),
      remuxRecording: vi.fn(),
    });
    const reconciliation = createRecordingReconciliation({
      store: state.store,
      api,
      nowMs: () => 1_000,
    });

    await reconciliation.drain();

    expect(api.finalizeRecording).not.toHaveBeenCalled();
    expect(api.remuxRecording).not.toHaveBeenCalled();
    expect(state.getRaw()).toHaveLength(1);
  });

  it("retries when auth hydration changes from undefined to the queue owner", async () => {
    const state = createStore([
      {
        version: 1,
        dedupeKey: `telefun-recording:${USER_ID}:${SESSION_ID}`,
        userId: USER_ID,
        sessionId: SESSION_ID,
        phase: "recording_transition_pending",
        recordingPath: FULL_PATH,
        agentRecordingPath: null,
        captureStatus: "ready",
        createdAtMs: 1_000,
        updatedAtMs: 1_000,
        nextAttemptAtMs: 1_000,
        attemptCount: 0,
        exhausted: false,
        lastErrorCode: null,
      },
    ]);
    let authReady: (() => void) | undefined;
    let authenticated = false;
    const api = createApi({
      getUserId: vi.fn(async () => (authenticated ? USER_ID : undefined)),
      finalizeRecording: vi.fn(async () => ({ recordingStatus: "failed" as const })),
    });
    const reconciliation = createRecordingReconciliation({
      store: state.store,
      api,
      nowMs: () => 1_000,
      addAuthStateListener: (handler: () => void) => {
        authReady = handler;
        return () => {};
      },
    } as any);

    const removeListeners = reconciliation.install();
    await reconciliation.drain();
    expect(api.finalizeRecording).not.toHaveBeenCalled();
    authenticated = true;
    authReady?.();
    await vi.waitFor(() => expect(api.finalizeRecording).toHaveBeenCalledOnce());
    expect(state.getRaw()).toEqual([]);
    removeListeners();
  });

  it("merges duplicate paths, preserves failed dominance, and rejects arbitrary paths", async () => {
    const state = createStore();
    const api = createApi({
      finalizeRecording: vi.fn(async () => ({
        recordingStatus: "failed" as const,
      })),
    });
    const reconciliation = createRecordingReconciliation({
      store: state.store,
      api,
      nowMs: () => 5_000,
    });

    await reconciliation.enqueue({
      userId: USER_ID,
      sessionId: SESSION_ID,
      recordingPath: FULL_PATH,
      agentRecordingPath: null,
      captureStatus: "ready",
    });
    const invalid = await reconciliation.enqueue({
      userId: USER_ID,
      sessionId: SESSION_ID,
      recordingPath: "other-user/other-session/full_call.webm",
      agentRecordingPath: AGENT_PATH,
      captureStatus: "failed",
    });

    expect(invalid.queued).toBe(false);
    expect(invalid.errorCode).toBe("INVALID_RECORDING_PATH");
    expect(api.finalizeRecording).toHaveBeenCalledTimes(1);
  });

  it("does not hot-loop an already-due entry when a storage mutation fails", async () => {
    let raw: RecordingReconciliationEntry[] | null = null;
    let writeCount = 0;
    const store: RecordingReconciliationStore = {
      read: () => raw,
      write: (entries) => {
        writeCount += 1;
        if (writeCount > 1) throw new Error("Storage unavailable.");
        raw = structuredClone(entries);
      },
    };
    const setTimer = vi.fn(() => 1);
    const api = createApi();
    const reconciliation = createRecordingReconciliation({
      store,
      api,
      nowMs: () => 10_000,
      setTimeout: setTimer,
    });

    const result = await reconciliation.enqueue({
      userId: USER_ID,
      sessionId: SESSION_ID,
      recordingPath: FULL_PATH,
      agentRecordingPath: null,
      captureStatus: "ready",
    });

    expect(result.saveFailed).toBe(true);
    expect(raw).toMatchObject([
      { phase: "recording_transition_pending", nextAttemptAtMs: 10_000 },
    ]);
    expect(setTimer).not.toHaveBeenCalled();
  });

  it("backs off partial remux, caps at eight attempts, and preserves the entry", async () => {
    let now = 10_000;
    const state = createStore();
    const api = createApi({
      remuxRecording: vi.fn(async () => ({
        success: true,
        data: {
          remuxed: false,
          recordings: {},
          recordingReady: false,
        },
      })),
    });
    const reconciliation = createRecordingReconciliation({
      store: state.store,
      api,
      nowMs: () => now,
    });

    const first = await reconciliation.enqueue({
      userId: USER_ID,
      sessionId: SESSION_ID,
      recordingPath: FULL_PATH,
      agentRecordingPath: null,
      captureStatus: "ready",
    });

    expect(first.removed).toBe(false);
    expect(first.errorCode).toBe("REMUX_INCOMPLETE");
    expect(state.getRaw()).toMatchObject([
      { phase: "remux_pending", attemptCount: 1, nextAttemptAtMs: 11_000 },
    ]);

    for (let attempt = 0; attempt < 7; attempt += 1) {
      now = (state.getRaw() as RecordingReconciliationEntry[])[0]!.nextAttemptAtMs;
      await reconciliation.drain();
    }

    expect(api.remuxRecording).toHaveBeenCalledTimes(8);
    expect(state.getRaw()).toMatchObject([
      { attemptCount: 8, exhausted: true, lastErrorCode: "REMUX_INCOMPLETE" },
    ]);

    now += 900_000;
    await reconciliation.drain();
    expect(api.remuxRecording).toHaveBeenCalledTimes(8);
  });

  it("removes a valid non-retryable ownership response but retains a conflict", async () => {
    const state = createStore();
    const api = createApi({
      finalizeRecording: vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error("bad path"), { code: "400" }))
        .mockRejectedValueOnce(Object.assign(new Error("conflict"), { code: "409" }))
        .mockRejectedValueOnce(Object.assign(new Error("conflict"), { code: "409" })),
    });
    const reconciliation = createRecordingReconciliation({
      store: state.store,
      api,
      nowMs: () => 20_000,
    });

    const removed = await reconciliation.enqueue({
      userId: USER_ID,
      sessionId: SESSION_ID,
      recordingPath: FULL_PATH,
      agentRecordingPath: null,
      captureStatus: "ready",
    });
    expect(removed.removed).toBe(true);
    expect(state.getRaw()).toEqual([]);

    const retained = await reconciliation.enqueue({
      userId: USER_ID,
      sessionId: SESSION_ID,
      recordingPath: FULL_PATH,
      agentRecordingPath: null,
      captureStatus: "ready",
    });
    expect(retained.removed).toBe(false);
    expect(state.getRaw()).toMatchObject([
      { attemptCount: 2, lastErrorCode: "409" },
    ]);
  });

  it("prunes malformed and expired entries without evicting live entries at the cap", async () => {
    const now = 604_801_000;
    const liveEntries = Array.from({ length: 32 }, (_, index) => {
      const sessionId = `session-${index}`;
      return {
        version: 1 as const,
        dedupeKey: `telefun-recording:${USER_ID}:${sessionId}`,
        userId: USER_ID,
        sessionId,
        phase: "remux_pending" as const,
        recordingPath: `${USER_ID}/${sessionId}/full_call.webm`,
        agentRecordingPath: null,
        captureStatus: "ready" as const,
        createdAtMs: now,
        updatedAtMs: now,
        nextAttemptAtMs: now + 100_000,
        attemptCount: 0,
        exhausted: false,
        lastErrorCode: null,
      };
    });
    const state = createStore([
      {
        ...liveEntries[0],
        sessionId: "expired",
        dedupeKey: `telefun-recording:${USER_ID}:expired`,
        recordingPath: `${USER_ID}/expired/full_call.webm`,
        createdAtMs: now - 604_800_001,
      },
      ...liveEntries,
      { malformed: true },
    ]);
    const reconciliation = createRecordingReconciliation({
      store: state.store,
      api: createApi(),
      nowMs: () => now,
    });

    const result = await reconciliation.enqueue({
      userId: USER_ID,
      sessionId: "new-session",
      recordingPath: `${USER_ID}/new-session/full_call.webm`,
      agentRecordingPath: null,
      captureStatus: "ready",
    });

    expect(result.queued).toBe(false);
    expect(result.errorCode).toBe("queue_full");
    expect(state.getRaw()).toHaveLength(32);
  });
});
