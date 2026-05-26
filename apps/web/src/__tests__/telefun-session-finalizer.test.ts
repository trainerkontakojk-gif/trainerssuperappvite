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

  it("includes voiceAssessment in record when scoring provides assessment", async () => {
    const calls: string[] = [];
    const mockAssessment = {
      overallScore: 8,
      speakingRate: { score: 7, wordsPerMinute: 130, verdict: "Baik", feedback: "Tempo oke" },
      intonation: { score: 8, verdict: "Baik", feedback: "Intonasi baik" },
      articulation: { score: 9, verdict: "Baik", feedback: "Jelas" },
      fillerWords: { score: 8, count: 2, examples: ["uh"], verdict: "Baik", feedback: "Minim" },
      emotionalTone: { score: 7, dominant: "tenang", verdict: "Baik", feedback: "Empati cukup" },
      transcript: "Tes",
      highlights: [],
      strengths: [],
      communicationProfile: null,
    };

    const result = await finalizeTelefunSession({
      sessionId: "session-2",
      fullBlob: null,
      agentBlob: new Blob(["agent"]),
      duration: 15,
      metrics: {
        speechSegments: [],
        totalSpeakingMs: 0,
        totalSilenceMs: 0,
        deadAirCount: 0,
        interruptionCount: 0,
        volumeSamples: [],
        volumeConsistency: 0,
        inputTranscriptionChunks: [],
        sessionDurationMs: 15000,
      },
      localUrl: "blob:local",
      sessionConfig: null,
      scenarioTitle: "Skenario",
      consumerName: "Konsumen",
      dependencies: {
        getUserId: vi.fn(async () => "user-1"),
        uploadRecording: vi.fn(async ({ type }) => {
          calls.push(`upload:${type}`);
          return `user-1/session-2/${type}.webm`;
        }),
        patchSession: vi.fn(async () => {
          calls.push("patch");
        }),
        finalizeRecording: vi.fn(async () => {}),
        scoreSession: vi.fn(async () => {
          return { score: 90, feedback: "Bagus", assessment: mockAssessment };
        }),
      },
    });

    expect(result.record.voiceAssessment).toEqual(mockAssessment);
    expect(result.record.score).toBe(90);
  });
});
