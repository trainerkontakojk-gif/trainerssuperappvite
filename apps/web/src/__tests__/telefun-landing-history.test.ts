// Runs in the fast Node suite; no rendered React surface is required.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  canOverwriteTelefunLocalHistory,
  parseTelefunLocalHistory,
  shouldPersistTelefunLocalHistory,
} from "../routes/telefun/telefunLocalHistory";
import { upsertTelefunSessionRecord } from "../routes/telefun/telefunApi";
import {
  getTelefunScoringStatusLabel,
  isTelefunRecordScored,
  type CallRecord,
} from "../routes/telefun/types";

const __dirname = dirname(fileURLToPath(import.meta.url));
const landingSource = readFileSync(
  join(__dirname, "../routes/telefun/index.tsx"),
  "utf8",
);

const localRecord: CallRecord = {
  id: "local-1",
  date: "2026-07-13T10:00:00.000Z",
  url: "blob:local",
  consumerName: "Konsumen Lokal",
  scenarioTitle: "Skenario Lokal",
  duration: 30,
};

describe("Telefun local history parsing", () => {
  it("warns once and marks invalid JSON as corrupt", () => {
    const warn = vi.fn();

    expect(parseTelefunLocalHistory("{broken", warn)).toEqual({
      records: [],
      isCorrupt: true,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.join(" ")).not.toContain("broken");
  });

  it("warns once and marks non-array JSON as corrupt", () => {
    const warn = vi.fn();

    expect(
      parseTelefunLocalHistory(JSON.stringify({ id: "not-an-array" }), warn),
    ).toEqual({ records: [], isCorrupt: true });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it.each([
    [[null]],
    [["not-a-record"]],
    [[{ date: "2026-07-13T10:00:00.000Z" }]],
    [[{ id: "missing-date" }]],
  ])("marks arrays containing invalid records as corrupt", (payload) => {
    const warn = vi.fn();

    expect(parseTelefunLocalHistory(JSON.stringify(payload), warn)).toEqual({
      records: [],
      isCorrupt: true,
    });
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("returns a valid local-only array without warning", () => {
    const warn = vi.fn();

    expect(
      parseTelefunLocalHistory(JSON.stringify([localRecord]), warn),
    ).toEqual({ records: [localRecord], isCorrupt: false });
    expect(warn).not.toHaveBeenCalled();
  });

  it("returns an empty array without warning when local storage has no history", () => {
    const warn = vi.fn();

    expect(parseTelefunLocalHistory(null, warn)).toEqual({
      records: [],
      isCorrupt: false,
    });
    expect(warn).not.toHaveBeenCalled();
  });

  it("preserves corrupt local payloads instead of overwriting them with server rows", () => {
    expect(shouldPersistTelefunLocalHistory([localRecord], true)).toBe(false);
    expect(shouldPersistTelefunLocalHistory([localRecord], false)).toBe(true);
    expect(shouldPersistTelefunLocalHistory([], false)).toBe(false);
  });

  it("blocks later automatic writes until the user explicitly clears corrupt history", () => {
    expect(canOverwriteTelefunLocalHistory(true)).toBe(false);
    expect(canOverwriteTelefunLocalHistory(false)).toBe(true);
  });

  it("initializes the corruption guard before awaiting server history", () => {
    const loadHistorySource = landingSource.slice(
      landingSource.indexOf("const loadHistory = async"),
      landingSource.indexOf("loadSettings();"),
    );

    expect(loadHistorySource.indexOf("parseTelefunLocalHistory")).toBeLessThan(
      loadHistorySource.indexOf("await getTelefunSessions"),
    );
    expect(
      loadHistorySource.indexOf("localHistoryIsCorruptRef.current"),
    ).toBeLessThan(loadHistorySource.indexOf("await getTelefunSessions"));
  });

  it("navigates home before starting background scoring", () => {
    const handlerStart = landingSource.indexOf("const handleRecordingReady");
    const handlerEnd = landingSource.indexOf(
      "const handleDeleteSession",
      handlerStart,
    );
    const handlerSource = landingSource.slice(handlerStart, handlerEnd);

    const navigateHomeIndex = handlerSource.indexOf('setView("home")');
    const startScoringIndex = handlerSource.indexOf("scoreTelefunSession");

    expect(navigateHomeIndex).toBeGreaterThanOrEqual(0);
    expect(startScoringIndex).toBeGreaterThan(navigateHomeIndex);
  });

  it("does not fabricate a zero score when client scoring succeeds without a score", () => {
    const scoredRecordStart = landingSource.indexOf(
      "const scoredRecord: CallRecord = {",
    );
    const scoredRecordEnd = landingSource.indexOf(
      "setHistory((prev) => {",
      scoredRecordStart,
    );
    const scoredRecordSource = landingSource.slice(
      scoredRecordStart,
      scoredRecordEnd,
    );

    expect(scoredRecordStart).toBeGreaterThanOrEqual(0);
    // §1.4.1: a missing score must stay undefined ("—"), never forced to 0.
    // Mirrors the fixed buildCallRecord pattern in sessionFinalizer.ts.
    expect(scoredRecordSource).toContain("score: scoring.score ?? undefined");
    expect(scoredRecordSource).not.toContain("score: scoring.score ?? 0");
  });

  it("abandons only an untransferred URL and blocks a late review reclaim", () => {
    const handlerStart = landingSource.indexOf("const handleEndCall");
    const handlerEnd = landingSource.indexOf(
      "const handleRecordingReady",
      handlerStart,
    );
    const handlerSource = landingSource.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain("releaseIfNotTransferredToReview()");
    expect(landingSource).toContain("createRetainedObjectUrlOwner");
  });

  it("does not retain the retired WebRTC missing-session branch", () => {
    const handlerStart = landingSource.indexOf("const handleRecordingReady");
    const handlerEnd = landingSource.indexOf(
      "const handleDeleteSession",
      handlerStart,
    );
    const handlerSource = landingSource.slice(handlerStart, handlerEnd);

    expect(handlerSource).not.toContain("returnToSession(url)");
    expect(handlerSource).not.toContain('telefunTransport === "openai-webrtc"');
  });

  it("captures the usage run and baseline before background scoring can finish", () => {
    const handlerStart = landingSource.indexOf("const handleRecordingReady");
    const handlerEnd = landingSource.indexOf(
      "const handleDeleteSession",
      handlerStart,
    );
    const handlerSource = landingSource.slice(handlerStart, handlerEnd);
    const scoringIndex = handlerSource.indexOf("scoreTelefunSession");

    expect(handlerSource).toContain(
      "const usageRunIdAtEndCall = sessionRunIdRef.current",
    );
    expect(handlerSource).toContain(
      "const usageBaselineAtEndCall = sessionBaselineRef.current",
    );
    expect(
      handlerSource.indexOf("const usageRunIdAtEndCall"),
    ).toBeLessThan(scoringIndex);
    expect(
      handlerSource.indexOf("const usageBaselineAtEndCall"),
    ).toBeLessThan(scoringIndex);
  });

  it("does not start the retired WebRTC reconciler after a Gemini session is saved", () => {
    const handlerStart = landingSource.indexOf("const handleRecordingReady");
    const handlerEnd = landingSource.indexOf(
      "const handleDeleteSession",
      handlerStart,
    );
    const handlerSource = landingSource.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain("setIsReviewOpen(true)");
    expect(handlerSource).not.toContain(
      "sessionReconcilerRef.current?.start(",
    );
  });

  it("stops the reconciler when a session is deleted", () => {
    const handlerStart = landingSource.indexOf("const handleDeleteSession");
    const handlerEnd = landingSource.indexOf(
      "const handleClearHistory",
      handlerStart,
    );
    const handlerSource = landingSource.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain("sessionReconcilerRef.current?.stop(id)");
  });

  it("disposes the reconciler on unmount", () => {
    const reconcilerInitStart = landingSource.indexOf(
      "const sessionReconcilerRef",
    );
    const reconcilerInitEnd = landingSource.indexOf(
      "[applyAuthoritativeRecord]",
      reconcilerInitStart,
    );
    const initSource = landingSource.slice(
      reconcilerInitStart,
      reconcilerInitEnd,
    );

    expect(initSource).toContain("reconciler.dispose()");
  });

  it("refetches authoritative detail after manual scoring success", () => {
    const handlerStart = landingSource.indexOf("const handleAssessmentComplete");
    const handlerEnd = landingSource.indexOf(
      "  return (",
      handlerStart,
    );
    const handlerSource = landingSource.slice(handlerStart, handlerEnd);

    expect(handlerSource).toContain("getTelefunSession(");
    expect(handlerSource).toContain("applyAuthoritativeRecord(");
  });

  it("refetches the history list once when the history modal reopens", () => {
    const effectStart = landingSource.indexOf("const historyOpenRef");
    const effectEnd = landingSource.indexOf(
      "const handleSaveSettings",
      effectStart,
    );
    const effectSource = landingSource.slice(effectStart, effectEnd);

    expect(effectSource).toContain("getTelefunSessions()");
    expect(effectSource).toContain("historyRef.current");
    expect(effectSource).toContain("isHistoryOpen");
  });
});

describe("Telefun authoritative upsert", () => {
  it("replaces by session id in history, updates the open review record, and persists local storage together", () => {
    const existing: CallRecord = {
      id: "session-1",
      date: "2026-08-01T00:00:00.000Z",
      url: "blob:old",
      consumerName: "Konsumen",
      scenarioTitle: "Skenario",
      duration: 30,
    };
    const older: CallRecord = {
      id: "session-0",
      date: "2026-07-01T00:00:00.000Z",
      url: "",
      consumerName: "Lama",
      scenarioTitle: "Lama",
      duration: 10,
    };
    const authoritative: CallRecord = {
      id: "session-1",
      date: "2026-08-14T00:00:00.000Z",
      url: "",
      consumerName: "Konsumen",
      scenarioTitle: "Skenario",
      duration: 30,
      score: 8,
      scoringStatus: "completed",
    };

    const result = upsertTelefunSessionRecord({
      record: authoritative,
      history: [existing, older],
      reviewRecord: existing,
      canOverwriteLocalHistory: true,
    });

    expect(result.history).toHaveLength(2);
    expect(result.history.find((r) => r.id === "session-1")).toBe(
      authoritative,
    );
    expect(result.history[0]!.id).toBe("session-1");
    expect(result.reviewRecord).toBe(authoritative);
    expect(result.localHistory).toBe(JSON.stringify(result.history));
  });

  it("keeps local storage untouched when the corrupt guard blocks writes", () => {
    const record: CallRecord = {
      id: "session-1",
      date: "2026-08-14T00:00:00.000Z",
      url: "",
      consumerName: "Konsumen",
      scenarioTitle: "Skenario",
      duration: 30,
    };

    const result = upsertTelefunSessionRecord({
      record,
      history: [],
      reviewRecord: null,
      canOverwriteLocalHistory: false,
    });

    expect(result.localHistory).toBeUndefined();
    expect(result.history).toEqual([record]);
    expect(result.reviewRecord).toBeNull();
  });

  it("does not replace the open review record of another session", () => {
    const other: CallRecord = {
      id: "other-1",
      date: "2026-08-01T00:00:00.000Z",
      url: "",
      consumerName: "Lain",
      scenarioTitle: "Lain",
      duration: 10,
    };
    const record: CallRecord = {
      id: "session-1",
      date: "2026-08-14T00:00:00.000Z",
      url: "",
      consumerName: "Konsumen",
      scenarioTitle: "Skenario",
      duration: 30,
    };

    const result = upsertTelefunSessionRecord({
      record,
      history: [],
      reviewRecord: other,
      canOverwriteLocalHistory: true,
    });

    expect(result.reviewRecord).toBe(other);
  });
});

describe("Telefun scoring status labels", () => {
  it("maps pending, processing, retryable failed, final failed, and ready states to truthful text", () => {
    expect(getTelefunScoringStatusLabel({ scoringStatus: "pending" })).toEqual({
      text: "Menunggu analisis",
      tone: "waiting",
    });
    expect(
      getTelefunScoringStatusLabel({ scoringStatus: "processing" }),
    ).toEqual({ text: "Sedang dianalisis", tone: "processing" });
    expect(
      getTelefunScoringStatusLabel({
        scoringStatus: "failed",
        scoringRetryable: true,
      }),
    ).toEqual({
      text: "Analisis gagal, akan dicoba lagi otomatis",
      tone: "retryable",
    });
    expect(
      getTelefunScoringStatusLabel({
        scoringStatus: "failed",
        scoringRetryable: false,
      }),
    ).toEqual({ text: "Analisis gagal, coba lagi", tone: "failed" });
    expect(
      getTelefunScoringStatusLabel({ scoringStatus: "completed", score: 8 }),
    ).toEqual({ text: "Feedback siap", tone: "ready" });
    expect(
      getTelefunScoringStatusLabel({ scoringStatus: "completed", score: undefined }),
    ).toBeNull();
    expect(getTelefunScoringStatusLabel({})).toBeNull();
    expect(getTelefunScoringStatusLabel({ score: 8 })).toBeNull();
  });

  it("only considers a record scored when it is completed or legacy with a real score", () => {
    expect(
      isTelefunRecordScored({ score: 8, scoringStatus: "completed" }),
    ).toBe(true);
    expect(isTelefunRecordScored({ score: 8 })).toBe(true);
    expect(
      isTelefunRecordScored({ score: undefined, scoringStatus: "pending" }),
    ).toBe(false);
    expect(isTelefunRecordScored({ score: 8, scoringStatus: "pending" })).toBe(
      false,
    );
    expect(
      isTelefunRecordScored({ score: 8, scoringStatus: "processing" }),
    ).toBe(false);
    expect(isTelefunRecordScored({ score: 8, scoringStatus: "failed" })).toBe(
      false,
    );
  });
});
