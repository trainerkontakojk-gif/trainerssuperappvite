import { describe, expect, it, vi } from "vitest";
import { finalizeTelefunSession } from "../routes/telefun/sessionFinalizer";

describe("Telefun Session Finalizer", () => {
  it("uploads and finalizes recording before scoring", async () => {
    const calls: string[] = [];

    const result = await finalizeTelefunSession({
      sessionId: "session-1",
      fullBlob: new Blob(["full"]),
      agentBlob: new Blob(["agent"]),
      duration: 12,
      metrics: {
        speechSegments: [],
        totalSpeakingMs: 0,
        totalSilenceMs: 0,
        deadAirCount: 0,
        interruptionCount: 0,
        volumeSamples: [],
        volumeConsistency: 0,
        inputTranscriptionChunks: [],
        sessionDurationMs: 12000,
      },
      localUrl: "blob:local",
      sessionConfig: null,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async ({ type }) => {
          calls.push(`upload:${type}`);
          return `user-1/session-1/${type}.webm`;
        }),
        patchSession: vi.fn(async () => {
          calls.push("patch");
        }),
        finalizeRecording: vi.fn(async () => {
          calls.push("finalize");
        }),
        scoreSession: vi.fn(async () => {
          calls.push("score");
          return { score: 88, feedback: "Bagus", assessment: null };
        }),
      },
    });

    expect(calls).toEqual(["upload:full_call", "upload:agent_only", "patch", "finalize", "score", "patch"]);
    expect(result.record.score).toBe(88);
    expect(result.record.feedback).toBe("Bagus");
  });
});
