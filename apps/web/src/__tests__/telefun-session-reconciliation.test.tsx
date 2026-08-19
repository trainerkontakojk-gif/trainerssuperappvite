import { describe, expect, it, vi } from "vitest";
import { createTelefunSessionReconciler } from "../routes/telefun/sessionReconciler";
import {
  mapTelefunSessionRow,
  upsertTelefunSessionRecord,
  type TelefunSessionRow,
} from "../routes/telefun/telefunApi";
import type { CallRecord } from "../routes/telefun/types";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

interface PendingFetch {
  sessionId: string;
  deferred: ReturnType<typeof deferred<TelefunSessionRow | null>>;
  signal?: AbortSignal;
}

function createHarness(overrides: { onRow?: (row: TelefunSessionRow) => void } = {}) {
  let visible = true;
  const timers: Array<{ id: number; handler: () => void; delayMs: number }> = [];
  const scheduledDelays: number[] = [];
  let nextTimerId = 1;
  const pendingFetches: PendingFetch[] = [];
  const offlineListeners: Array<() => void> = [];
  const onlineListeners: Array<() => void> = [];
  const visibilityListeners: Array<() => void> = [];

  const fetchSessionDetail = vi.fn(
    (sessionId: string, options: { signal?: AbortSignal }) => {
      const d = deferred<TelefunSessionRow | null>();
      pendingFetches.push({ sessionId, deferred: d, signal: options.signal });
      return d.promise;
    },
  );
  const onRow = overrides.onRow ?? vi.fn();
  const onStatusChange = vi.fn();
  const setTimeout = vi.fn((handler: () => void, delayMs: number) => {
    const id = nextTimerId++;
    timers.push({ id, handler, delayMs });
    scheduledDelays.push(delayMs);
    return id;
  });
  const clearTimeout = vi.fn((id: unknown) => {
    const index = timers.findIndex((t) => t.id === id);
    if (index >= 0) timers.splice(index, 1);
  });
  const addOfflineListener = vi.fn((handler: () => void) => {
    offlineListeners.push(handler);
    return () => {
      const i = offlineListeners.indexOf(handler);
      if (i >= 0) offlineListeners.splice(i, 1);
    };
  });
  const addOnlineListener = vi.fn((handler: () => void) => {
    onlineListeners.push(handler);
    return () => {
      const i = onlineListeners.indexOf(handler);
      if (i >= 0) onlineListeners.splice(i, 1);
    };
  });
  const addVisibilityListener = vi.fn((handler: () => void) => {
    visibilityListeners.push(handler);
    return () => {
      const i = visibilityListeners.indexOf(handler);
      if (i >= 0) visibilityListeners.splice(i, 1);
    };
  });
  const isDocumentVisible = vi.fn(() => visible);

  const reconciler = createTelefunSessionReconciler({
    fetchSessionDetail,
    setTimeout,
    clearTimeout,
    addOfflineListener,
    addOnlineListener,
    addVisibilityListener,
    isDocumentVisible,
    onRow,
    onStatusChange,
  });

  const flush = async () => {
    for (let i = 0; i < 6; i += 1) await Promise.resolve();
  };

  return {
    reconciler,
    fetchSessionDetail,
    onRow,
    onStatusChange,
    timers,
    scheduledDelays,
    pendingFetches,
    flush,
    fireTimer: async (index = 0) => {
      const timer = timers.splice(index, 1)[0];
      if (!timer) return;
      timer.handler();
      await flush();
    },
    resolveFetch: async (index: number, row: TelefunSessionRow | null) => {
      pendingFetches[index]?.deferred.resolve(row);
      await flush();
    },
    rejectFetch: async (index: number, error: unknown) => {
      pendingFetches[index]?.deferred.reject(error);
      await flush();
    },
    fireOffline: () => offlineListeners.forEach((h) => h()),
    fireOnline: () => onlineListeners.forEach((h) => h()),
    setVisible: (value: boolean) => {
      visible = value;
      visibilityListeners.forEach((h) => h());
    },
  };
}

function pendingRow(id = "session-1"): TelefunSessionRow {
  return { id, scoring_status: "pending", score: null };
}

const assessment = {
  overallScore: 8,
  speakingRate: {
    score: 7,
    wordsPerMinute: 130,
    verdict: "Baik",
    feedback: "Tempo oke",
  },
  intonation: { score: 8, verdict: "Baik", feedback: "Intonasi baik" },
  articulation: { score: 9, verdict: "Baik", feedback: "Jelas" },
  fillerWords: {
    score: 8,
    count: 2,
    examples: ["uh"],
    verdict: "Baik",
    feedback: "Minim",
  },
  emotionalTone: {
    score: 7,
    dominant: "tenang",
    verdict: "Baik",
    feedback: "Empati cukup",
  },
  transcript: "Tes",
  highlights: [],
  strengths: [],
};

function completedRow(id = "session-1"): TelefunSessionRow {
  return {
    id,
    scoring_status: "completed",
    scoring_ready_at: "2026-08-14T09:00:00.000Z",
    scoring_retryable: false,
    score: 8,
    feedback: "Tempo stabil.",
    voice_assessment: assessment,
  };
}

describe("Telefun session reconciler", () => {
  it("upserts the completed detail into history, open review, and local storage without reload", async () => {
    const legacy: CallRecord = {
      id: "legacy-1",
      date: "2026-07-01T00:00:00.000Z",
      url: "",
      consumerName: "Lama",
      scenarioTitle: "Lama",
      duration: 10,
    };
    let history: CallRecord[] = [legacy];
    let reviewRecord: CallRecord | null = {
      ...mapTelefunSessionRow(pendingRow("session-1")),
      date: "2026-08-14T00:00:00.000Z",
    };
    let stored: string | null = JSON.stringify([legacy]);

    const h = createHarness({
      onRow: (row) => {
        const result = upsertTelefunSessionRecord({
          record: mapTelefunSessionRow(row),
          history,
          reviewRecord,
          canOverwriteLocalHistory: true,
        });
        history = result.history;
        reviewRecord = result.reviewRecord;
        if (result.localHistory !== undefined) stored = result.localHistory;
      },
    });

    h.reconciler.start("session-1");
    expect(h.fetchSessionDetail).toHaveBeenCalledWith(
      "session-1",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    await h.resolveFetch(0, pendingRow("session-1"));
    expect(h.onStatusChange).toHaveBeenCalledWith(
      "waiting_for_scoring",
      "session-1",
    );
    expect(reviewRecord?.scoringStatus).toBe("pending");
    expect(reviewRecord?.score).toBeUndefined();
    expect(stored).toContain("session-1");

    await h.fireTimer();
    await h.resolveFetch(1, completedRow("session-1"));
    expect(h.onStatusChange).toHaveBeenLastCalledWith("completed", "session-1");
    expect(reviewRecord?.score).toBe(8);
    expect(reviewRecord?.feedback).toBe("Tempo stabil.");
    expect(reviewRecord?.voiceAssessment?.overallScore).toBe(8);
    expect(reviewRecord?.scoringStatus).toBe("completed");
    expect(history.find((r) => r.id === "session-1")?.score).toBe(8);
    expect(history.find((r) => r.id === "legacy-1")).toBe(legacy);
    expect(stored).toContain('"score":8');
    expect(h.timers).toHaveLength(0);
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(2);
  });

  it("backs off 2s/5s/10s/15s capped at 15s and stops with timed_out after 120s", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    await h.resolveFetch(0, pendingRow("session-1"));

    for (let i = 0; i < 10; i += 1) {
      await h.fireTimer();
      await h.resolveFetch(h.pendingFetches.length - 1, pendingRow("session-1"));
    }

    expect(h.scheduledDelays).toEqual([
      2000, 5000, 10000, 15000, 15000, 15000, 15000, 15000, 15000, 13000,
    ]);
    expect(h.scheduledDelays.reduce((a, b) => a + b, 0)).toBe(120000);
    expect(h.onStatusChange).toHaveBeenLastCalledWith("timed_out", "session-1");
    expect(h.timers).toHaveLength(0);
    const fetchesAtTimeout = h.fetchSessionDetail.mock.calls.length;

    h.reconciler.refresh();
    expect(h.fetchSessionDetail.mock.calls.length).toBe(fetchesAtTimeout + 1);
    await h.resolveFetch(h.pendingFetches.length - 1, completedRow("session-1"));
    expect(h.onStatusChange).toHaveBeenLastCalledWith("completed", "session-1");
    expect(h.timers).toHaveLength(0);
  });

  it("stops polling on a retryable failure and keeps refresh as the compatible retry", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    await h.resolveFetch(0, {
      id: "session-1",
      scoring_status: "failed",
      scoring_retryable: true,
      scoring_next_attempt_at: "2026-08-14T10:00:00.000Z",
      score: null,
    });

    expect(h.onStatusChange).toHaveBeenLastCalledWith(
      "failed_retryable",
      "session-1",
    );
    expect(h.timers).toHaveLength(0);
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(1);

    h.reconciler.refresh();
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(2);
    await h.resolveFetch(h.pendingFetches.length - 1, {
      id: "session-1",
      scoring_status: "failed",
      scoring_retryable: true,
      scoring_next_attempt_at: "2026-08-14T10:00:00.000Z",
      score: null,
    });
    expect(h.timers).toHaveLength(0);
  });

  it("stops polling on a permanent failure without claiming a retry is scheduled", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    await h.resolveFetch(0, {
      id: "session-1",
      scoring_status: "failed",
      scoring_retryable: false,
      score: null,
    });

    expect(h.onStatusChange).toHaveBeenLastCalledWith("failed_final", "session-1");
    expect(h.timers).toHaveLength(0);
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(1);
  });

  it("lets a new run replace the previous run without a late response writing", async () => {
    const h = createHarness();
    h.reconciler.start("session-a");
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(1);

    h.reconciler.start("session-b");
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(2);
    expect(h.pendingFetches[0]?.signal?.aborted).toBe(true);

    await h.resolveFetch(0, completedRow("session-a"));
    expect(h.onRow).not.toHaveBeenCalled();
    expect(h.onStatusChange).not.toHaveBeenCalled();

    await h.resolveFetch(1, pendingRow("session-b"));
    expect(h.onStatusChange).toHaveBeenCalledWith(
      "waiting_for_scoring",
      "session-b",
    );
    expect(h.timers).toHaveLength(1);
  });

  it("stops on delete and never lets a late response resurrect the row", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    h.reconciler.stop("session-1");
    expect(h.pendingFetches[0]?.signal?.aborted).toBe(true);

    await h.resolveFetch(0, completedRow("session-1"));
    expect(h.onRow).not.toHaveBeenCalled();
    expect(h.timers).toHaveLength(0);
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(1);
  });

  it("ignores a delete for a session that is not the active run", async () => {
    const h = createHarness();
    h.reconciler.start("session-b");
    h.reconciler.stop("session-a");
    await h.resolveFetch(0, pendingRow("session-b"));
    expect(h.timers).toHaveLength(1);
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(1);
  });

  it("dispose aborts the run, removes listeners, and leaves no timer behind", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    h.reconciler.dispose();
    expect(h.pendingFetches[0]?.signal?.aborted).toBe(true);

    await h.resolveFetch(0, completedRow("session-1"));
    expect(h.onRow).not.toHaveBeenCalled();
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(1);

    h.fireOnline();
    h.setVisible(true);
    await h.flush();
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(1);
    expect(h.timers).toHaveLength(0);
  });

  it("pauses polling while offline or hidden and resumes with a single refetch", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    await h.resolveFetch(0, pendingRow("session-1"));
    expect(h.timers).toHaveLength(1);

    h.fireOffline();
    expect(h.timers).toHaveLength(0);

    const fetchesBeforeOnline = h.fetchSessionDetail.mock.calls.length;
    h.fireOnline();
    expect(h.fetchSessionDetail.mock.calls.length).toBe(fetchesBeforeOnline + 1);
    await h.resolveFetch(h.pendingFetches.length - 1, pendingRow("session-1"));
    expect(h.timers).toHaveLength(1);

    h.setVisible(false);
    expect(h.timers).toHaveLength(0);

    const fetchesBeforeVisible = h.fetchSessionDetail.mock.calls.length;
    h.setVisible(true);
    expect(h.fetchSessionDetail.mock.calls.length).toBe(fetchesBeforeVisible + 1);
    await h.resolveFetch(h.pendingFetches.length - 1, pendingRow("session-1"));
    expect(h.timers).toHaveLength(1);
  });

  it("refresh performs a single authoritative refetch while the run is active", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    await h.resolveFetch(0, pendingRow("session-1"));
    expect(h.timers).toHaveLength(1);

    h.reconciler.refresh();
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(2);
    expect(h.timers).toHaveLength(0);
    await h.resolveFetch(1, pendingRow("session-1"));
    expect(h.timers).toHaveLength(1);
  });

  it("queues a single follow-up fetch when refresh lands while a fetch is in flight", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    h.reconciler.refresh();
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(1);

    await h.resolveFetch(0, pendingRow("session-1"));
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(2);
    await h.resolveFetch(1, pendingRow("session-1"));
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(2);
    expect(h.timers).toHaveLength(1);
  });

  it("watch refreshes an active run and starts a new run for another session", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    await h.resolveFetch(0, pendingRow("session-1"));

    h.reconciler.watch("session-1");
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(2);
    await h.resolveFetch(1, pendingRow("session-1"));

    h.reconciler.watch("session-2");
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(3);
    expect(h.pendingFetches[2]?.sessionId).toBe("session-2");
    await h.resolveFetch(2, pendingRow("session-2"));
    expect(h.onStatusChange).toHaveBeenLastCalledWith(
      "waiting_for_scoring",
      "session-2",
    );
  });

  it("continues polling after a transient fetch error", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    await h.rejectFetch(0, new Error("network down"));
    expect(h.timers).toHaveLength(1);

    await h.fireTimer();
    await h.resolveFetch(1, completedRow("session-1"));
    expect(h.onStatusChange).toHaveBeenLastCalledWith("completed", "session-1");
    expect(h.timers).toHaveLength(0);
  });

  it("treats a not-found detail as a deleted session and stops silently", async () => {
    const h = createHarness();
    h.reconciler.start("session-1");
    await h.resolveFetch(0, null);
    expect(h.onRow).not.toHaveBeenCalled();
    expect(h.timers).toHaveLength(0);
    expect(h.fetchSessionDetail).toHaveBeenCalledTimes(1);
  });
});
